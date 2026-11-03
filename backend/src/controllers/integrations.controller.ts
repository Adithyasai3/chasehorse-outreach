import type { Request, Response } from 'express';
import { z } from 'zod';
import { config, googleConfigured } from '../config';
import * as enricho from '../integrations/enricho/enricho.service';
import { validateGeminiKey } from '../integrations/gemini.client';
import * as googleClient from '../integrations/google.client';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { currentUser } from '../middleware/auth';
import { parse } from '../middleware/common';
import { deleteCredential, getApiKey, getCredentialView, saveApiKey, updateCredentialStatus } from '../services/credentials.service';

const keySchema = z.object({ apiKey: z.string().trim().min(10, 'That does not look like an API key').max(500) });

export async function status(req: Request, res: Response) {
  const { id } = currentUser(req);
  const [gemini, enrichoView, google] = await Promise.all([
    getCredentialView(id, 'GEMINI'),
    getCredentialView(id, 'ENRICHO'),
    getCredentialView(id, 'GOOGLE'),
  ]);
  const catalog = enrichoView?.metadata.toolCatalog as
    | { tools: { name: string; description?: string; inputSchema: unknown }[]; capabilities: Record<string, string | null>; fetchedAt: string }
    | undefined;
  const scopes = (google?.metadata.scopes as string[] | undefined) || [];
  res.json({
    gemini: gemini && { ...gemini, metadata: { models: (gemini.metadata.models as string[] | undefined)?.slice(0, 50) } },
    enricho: enrichoView && {
      ...enrichoView,
      metadata: {
        tools: catalog?.tools || [],
        capabilities: catalog?.capabilities || {},
        toolsFetchedAt: catalog?.fetchedAt || null,
        account: enrichoView.metadata.account || null,
        accountCheckedAt: enrichoView.metadata.accountCheckedAt || null,
      },
    },
    google: {
      serverConfigured: googleConfigured(),
      redirectUri: config.google.redirectUri,
      connection: google && {
        ...google,
        metadata: {
          email: google.metadata.email,
          gmail: googleClient.SCOPES.gmail.every((s) => scopes.includes(s)),
          calendar: googleClient.SCOPES.calendar.every((s) => scopes.includes(s)),
        },
      },
    },
    enrichoEndpoint: config.enricho.mcpUrl,
  });
}

// --- Gemini ---------------------------------------------------------------------

export async function saveGemini(req: Request, res: Response) {
  const { id } = currentUser(req);
  const { apiKey } = parse(keySchema, req.body);
  const models = await validateGeminiKey(apiKey); // throws on invalid key; nothing is saved
  await saveApiKey(id, 'GEMINI', apiKey, { status: 'CONNECTED', metadata: { models } });
  res.json({ ok: true, models: models.length });
}

export async function testGemini(req: Request, res: Response) {
  const { id } = currentUser(req);
  const key = await getApiKey(id, 'GEMINI');
  try {
    const models = await validateGeminiKey(key);
    await updateCredentialStatus(id, 'GEMINI', 'CONNECTED', null, { models });
    res.json({ ok: true, models: models.length });
  } catch (err) {
    await updateCredentialStatus(id, 'GEMINI', 'ERROR', (err as Error).message);
    throw err;
  }
}

// --- Enricho --------------------------------------------------------------------

export async function saveEnrichoKey(req: Request, res: Response) {
  const { id } = currentUser(req);
  const { apiKey } = parse(keySchema, req.body);
  const result = await enricho.connectWithApiKey(id, apiKey);
  res.json({
    ok: true,
    tools: result.catalog.tools.map((t) => t.name),
    capabilities: result.catalog.capabilities,
    account: result.account,
    note: result.note,
  });
}

export async function enrichoAccount(req: Request, res: Response) {
  const { id } = currentUser(req);
  res.json({ account: await enricho.accountStatus(id) });
}

export async function startEnrichoOAuth(req: Request, res: Response) {
  const { id } = currentUser(req);
  const url = await enricho.startOAuth(id);
  res.json({ url });
}

function backToSettings(res: Response, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  res.redirect(`${config.appUrl}/settings/integrations?${qs}`);
}

export async function enrichoOAuthCallback(req: Request, res: Response) {
  const { id } = currentUser(req);
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (req.query.error) return backToSettings(res, { provider: 'enricho', error: String(req.query.error_description || req.query.error).slice(0, 200) });
  try {
    if (!code || !state) throw new AppError('VALIDATION', 'Missing authorization code.');
    await enricho.finishOAuth(id, code, state);
    backToSettings(res, { provider: 'enricho', connected: '1' });
  } catch (err) {
    logger.warn('Enricho OAuth callback failed', { error: err as Error });
    backToSettings(res, { provider: 'enricho', error: (err as Error).message.slice(0, 200) });
  }
}

export async function testEnricho(req: Request, res: Response) {
  const { id } = currentUser(req);
  const catalog = await enricho.refreshToolCatalog(id);
  // tools/list is unauthenticated on this server; the account call proves the credentials work.
  const account = await enricho.accountStatus(id);
  res.json({ ok: true, tools: catalog.tools.map((t) => t.name), capabilities: catalog.capabilities, account });
}

// --- Google ---------------------------------------------------------------------

const featureSchema = z.object({ feature: z.enum(['gmail', 'calendar']) });

export async function startGoogle(req: Request, res: Response) {
  const { id } = currentUser(req);
  const { feature } = parse(featureSchema, req.body);
  res.json({ url: await googleClient.createAuthUrl(id, feature) });
}

export async function googleCallback(req: Request, res: Response) {
  const { id } = currentUser(req);
  if (req.query.error) return backToSettings(res, { provider: 'google', error: String(req.query.error).slice(0, 200) });
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state) throw new AppError('VALIDATION', 'Missing authorization code.');
    const { feature } = await googleClient.handleCallback(id, code, state);
    backToSettings(res, { provider: 'google', connected: feature });
  } catch (err) {
    logger.warn('Google OAuth callback failed', { error: err as Error });
    backToSettings(res, { provider: 'google', error: (err as Error).message.slice(0, 200) });
  }
}

export async function testGoogle(req: Request, res: Response) {
  const { id } = currentUser(req);
  const result = await googleClient.testConnection(id);
  res.json({ ok: true, ...result });
}

// --- Disconnect -----------------------------------------------------------------

const providerParam = z.enum(['gemini', 'enricho', 'google']);
export async function disconnect(req: Request, res: Response) {
  const { id } = currentUser(req);
  const p = parse(providerParam, req.params.provider);
  const provider = p === 'gemini' ? 'GEMINI' : p === 'enricho' ? 'ENRICHO' : 'GOOGLE';
  if (provider === 'GOOGLE') await googleClient.revokeGoogle(id);
  await deleteCredential(id, provider);
  await prisma.oAuthState.deleteMany({ where: { userId: id, provider } });
  res.json({ ok: true });
}
