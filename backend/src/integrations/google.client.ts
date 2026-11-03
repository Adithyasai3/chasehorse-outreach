import { google, type gmail_v1 } from 'googleapis';
import { config, googleConfigured } from '../config';
import { encryptJson, decryptJson, randomToken } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import {
  getCredentialView,
  getOAuthBundle,
  logProviderCall,
  saveOAuthBundle,
  updateCredentialStatus,
} from '../services/credentials.service';

export const SCOPES = {
  identity: ['openid', 'https://www.googleapis.com/auth/userinfo.email'],
  gmail: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
  calendar: ['https://www.googleapis.com/auth/calendar.events'],
};

interface GoogleTokenBundle {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string;
}

function oauthClient() {
  if (!googleConfigured()) {
    throw new AppError(
      'NOT_CONFIGURED',
      'Google OAuth is not configured on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README → Google OAuth).'
    );
  }
  return new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
}

export type GoogleFeature = 'gmail' | 'calendar';

/** Builds a consent URL. Uses incremental authorization so Gmail and Calendar can be granted separately. */
export async function createAuthUrl(userId: string, feature: GoogleFeature): Promise<string> {
  const client = oauthClient();
  const state = randomToken(24);
  await prisma.oAuthState.create({
    data: {
      state,
      userId,
      provider: 'GOOGLE',
      dataEncrypted: encryptJson({ feature }),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: [...SCOPES.identity, ...SCOPES[feature]],
    state,
  });
}

export async function handleCallback(userId: string, code: string, state: string) {
  const row = await prisma.oAuthState.findUnique({ where: { state } });
  if (!row || row.userId !== userId || row.provider !== 'GOOGLE' || row.expiresAt < new Date()) {
    throw new AppError('VALIDATION', 'This Google authorization link has expired. Start the connection again.');
  }
  await prisma.oAuthState.delete({ where: { state } });
  const { feature } = decryptJson<{ feature: GoogleFeature }>(row.dataEncrypted || encryptJson({ feature: 'gmail' }));

  const client = oauthClient();
  const { tokens } = await client.getToken(code).catch(() => {
    throw new AppError('PROVIDER_AUTH', 'Google rejected the authorization code. Try connecting again.', { provider: 'GOOGLE' });
  });
  client.setCredentials(tokens);
  const info = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
  const email = info.data.email;
  if (!email) throw new AppError('PROVIDER_ERROR', 'Google did not return an email address for this account.', { provider: 'GOOGLE' });

  const existing = await getOAuthBundle<GoogleTokenBundle>(userId, 'GOOGLE');
  const bundle: GoogleTokenBundle = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || existing?.refresh_token || null,
    expiry_date: tokens.expiry_date,
    scope: tokens.scope,
  };
  await saveOAuthBundle(userId, 'GOOGLE', bundle, {
    metadata: { email, scopes: (tokens.scope || '').split(' ').filter(Boolean) },
    maskedHint: email,
  });
  return { email, feature };
}

export async function grantedScopes(userId: string): Promise<string[]> {
  const view = await getCredentialView(userId, 'GOOGLE');
  return (view?.metadata.scopes as string[] | undefined) || [];
}

async function authorizedClient(userId: string, feature: GoogleFeature) {
  const bundle = await getOAuthBundle<GoogleTokenBundle>(userId, 'GOOGLE');
  if (!bundle) {
    throw new AppError('NOT_CONFIGURED', `Connect your Google account (${feature === 'gmail' ? 'Gmail' : 'Calendar'}) in Settings → Integrations.`, {
      provider: 'GOOGLE',
    });
  }
  const scopes = await grantedScopes(userId);
  const needed = SCOPES[feature];
  if (!needed.every((s) => scopes.includes(s))) {
    throw new AppError('NOT_CONFIGURED', `${feature === 'gmail' ? 'Gmail' : 'Google Calendar'} access has not been granted. Connect it in Settings → Integrations.`, {
      provider: 'GOOGLE',
    });
  }
  const client = oauthClient();
  client.setCredentials(bundle);
  client.on('tokens', (fresh) => {
    void saveOAuthBundle(userId, 'GOOGLE', { ...bundle, ...fresh, refresh_token: fresh.refresh_token || bundle.refresh_token }, {});
  });
  return client;
}

function mapGoogleError(err: unknown, userId: string): AppError {
  const e = err as { code?: number; response?: { status?: number; data?: { error?: string | { message?: string } } }; message?: string };
  const status = e.response?.status || e.code;
  const data = e.response?.data?.error;
  const msg = typeof data === 'string' ? data : data?.message || e.message || 'Google API error';
  if (msg === 'invalid_grant' || status === 401) {
    void updateCredentialStatus(userId, 'GOOGLE', 'ERROR', 'Google access was revoked or expired. Reconnect your account.');
    return new AppError('PROVIDER_AUTH', 'Google access was revoked or expired. Reconnect your Google account in Settings → Integrations.', {
      provider: 'GOOGLE',
    });
  }
  if (status === 403) return new AppError('PROVIDER_AUTH', `Google denied the request: ${msg}`, { provider: 'GOOGLE' });
  if (status === 429) return new AppError('PROVIDER_RATE_LIMIT', 'Google API rate limit reached. Try again shortly.', { provider: 'GOOGLE' });
  if (status === 400) return new AppError('VALIDATION', `Google rejected the request: ${msg}`, { provider: 'GOOGLE' });
  return new AppError('PROVIDER_ERROR', `Google API error: ${msg}`, { provider: 'GOOGLE' });
}

// --- Gmail -------------------------------------------------------------------------

function encodeHeader(value: string) {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Builds a multipart/alternative RFC 2822 message (base64url). */
export function buildRawMessage(p: { from: string; fromName?: string; to: string; subject: string; body: string }) {
  const boundary = `ch_${randomToken(12)}`;
  const html = escapeHtml(p.body)
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
  const from = p.fromName ? `${encodeHeader(p.fromName)} <${p.from}>` : p.from;
  const lines = [
    `From: ${from}`,
    `To: ${p.to}`,
    `Subject: ${encodeHeader(p.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(p.body, 'utf8').toString('base64'),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(`<div>${html}</div>`, 'utf8').toString('base64'),
    `--${boundary}--`,
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

export async function sendGmail(userId: string, msg: { to: string; subject: string; body: string; fromName?: string }) {
  const client = await authorizedClient(userId, 'gmail');
  const view = await getCredentialView(userId, 'GOOGLE');
  const from = view?.metadata.email as string;
  const startedAt = Date.now();
  try {
    const gmail = google.gmail({ version: 'v1', auth: client });
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: buildRawMessage({ from, fromName: msg.fromName, to: msg.to, subject: msg.subject, body: msg.body }) },
    });
    await logProviderCall({ userId, provider: 'GOOGLE', operation: 'gmail.send', status: 'OK', startedAt });
    if (!res.data.id) throw new AppError('PROVIDER_ERROR', 'Gmail did not return a message id.', { provider: 'GOOGLE' });
    return { from, messageId: res.data.id, threadId: res.data.threadId || null };
  } catch (err) {
    const appErr = err instanceof AppError ? err : mapGoogleError(err, userId);
    await logProviderCall({ userId, provider: 'GOOGLE', operation: 'gmail.send', status: appErr.code, startedAt, detail: appErr.message });
    throw appErr;
  }
}

export interface ThreadMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  internalDate: number;
}

export async function getThreadMessages(userId: string, threadId: string): Promise<ThreadMessage[]> {
  const client = await authorizedClient(userId, 'gmail');
  try {
    const gmail = google.gmail({ version: 'v1', auth: client });
    const res = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'metadata', metadataHeaders: ['From', 'To', 'Subject'] });
    return (res.data.messages || []).map((m: gmail_v1.Schema$Message) => {
      const h = (name: string) => m.payload?.headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase())?.value || '';
      return { id: m.id || '', from: h('From'), to: h('To'), subject: h('Subject'), snippet: m.snippet || '', internalDate: Number(m.internalDate || 0) };
    });
  } catch (err) {
    throw mapGoogleError(err, userId);
  }
}

// --- Calendar ----------------------------------------------------------------------

export async function createCalendarEvent(
  userId: string,
  ev: { summary: string; description?: string; start: Date; end: Date; attendees?: string[] }
) {
  const client = await authorizedClient(userId, 'calendar');
  const startedAt = Date.now();
  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const res = await calendar.events.insert({
      calendarId: 'primary',
      sendUpdates: 'none',
      requestBody: {
        summary: ev.summary,
        description: ev.description,
        start: { dateTime: ev.start.toISOString() },
        end: { dateTime: ev.end.toISOString() },
        attendees: ev.attendees?.map((email) => ({ email })),
        reminders: { useDefault: true },
      },
    });
    await logProviderCall({ userId, provider: 'GOOGLE', operation: 'calendar.insert', status: 'OK', startedAt });
    return { id: res.data.id as string, htmlLink: res.data.htmlLink || null };
  } catch (err) {
    const appErr = mapGoogleError(err, userId);
    await logProviderCall({ userId, provider: 'GOOGLE', operation: 'calendar.insert', status: appErr.code, startedAt, detail: appErr.message });
    throw appErr;
  }
}

/** Live check of each granted feature: Gmail profile and calendar access. */
export async function testConnection(userId: string) {
  const scopes = await grantedScopes(userId);
  const out: { gmail: string | null; calendar: string | null } = { gmail: null, calendar: null };
  if (SCOPES.gmail.every((s) => scopes.includes(s))) {
    const client = await authorizedClient(userId, 'gmail');
    try {
      const profile = await google.gmail({ version: 'v1', auth: client }).users.getProfile({ userId: 'me' });
      out.gmail = profile.data.emailAddress || 'ok';
    } catch (err) {
      throw mapGoogleError(err, userId);
    }
  }
  if (SCOPES.calendar.every((s) => scopes.includes(s))) {
    const client = await authorizedClient(userId, 'calendar');
    try {
      await google.calendar({ version: 'v3', auth: client }).events.list({ calendarId: 'primary', maxResults: 1, timeMin: new Date().toISOString() });
      out.calendar = 'ok';
    } catch (err) {
      throw mapGoogleError(err, userId);
    }
  }
  if (!out.gmail && !out.calendar) throw new AppError('NOT_CONFIGURED', 'No Google features are connected yet.', { provider: 'GOOGLE' });
  await updateCredentialStatus(userId, 'GOOGLE', 'CONNECTED', null);
  return out;
}

export async function revokeGoogle(userId: string) {
  const bundle = await getOAuthBundle<GoogleTokenBundle>(userId, 'GOOGLE');
  if (!bundle || !googleConfigured()) return;
  const token = bundle.refresh_token || bundle.access_token;
  if (token) await oauthClient().revokeToken(token).catch(() => undefined);
}
