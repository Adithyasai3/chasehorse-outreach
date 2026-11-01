import { google } from 'googleapis';
import { config } from '../config';
import { prisma } from './prisma';
import { encrypt, decrypt } from './encryption';
import { classifyIncomingReply } from './gemini';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    config.gmail.clientId,
    config.gmail.clientSecret,
    config.gmail.redirectUri
  );
}

/**
 * Generate official Google OAuth 2.0 authorization URL
 */
export function generateAuthUrl(): string {
  if (!config.gmail.clientId) {
    throw new Error('Google OAuth Client ID is not configured in .env');
  }
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

/**
 * Exchange authorization code for tokens and save encrypted account
 */
export async function handleOAuthCallback(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const email = userInfo.data.email;

  if (!email) {
    throw new Error('Could not retrieve email address from Google');
  }

  const encryptedAccess = encrypt(tokens.access_token || '');
  const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

  const account = await prisma.gmailAccount.upsert({
    where: { email },
    update: {
      accessTokenEncrypted: encryptedAccess,
      refreshTokenEncrypted: encryptedRefresh || undefined,
      expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
      scopes: SCOPES,
      isActive: true,
      syncStatus: 'IDLE',
      lastErrorMessage: null,
    },
    create: {
      email,
      accessTokenEncrypted: encryptedAccess,
      refreshTokenEncrypted: encryptedRefresh,
      expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
      scopes: SCOPES,
      isActive: true,
      syncStatus: 'IDLE',
    },
  });

  await prisma.integration.upsert({
    where: { provider: 'GMAIL' },
    update: {
      status: 'CONNECTED',
      config: { connectedEmail: email, scopes: SCOPES },
      lastHealthCheck: new Date(),
      errorMessage: null,
    },
    create: {
      provider: 'GMAIL',
      status: 'CONNECTED',
      config: { connectedEmail: email, scopes: SCOPES },
    },
  });

  return account;
}

/**
 * Get authorized Gmail API instance for an active account
 */
async function getAuthorizedGmailClient(email?: string) {
  const account = email
    ? await prisma.gmailAccount.findUnique({ where: { email, isActive: true } })
    : await prisma.gmailAccount.findFirst({ where: { isActive: true } });

  if (!account) {
    return null;
  }

  const oauth2Client = getOAuth2Client();
  const accessToken = decrypt(account.accessTokenEncrypted);
  const refreshToken = account.refreshTokenEncrypted ? decrypt(account.refreshTokenEncrypted) : undefined;

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: account.expiryDate ? Number(account.expiryDate) : undefined,
  });

  return { gmail: google.gmail({ version: 'v1', auth: oauth2Client }), account };
}

/**
 * Check suppression list before sending any email
 */
export async function isSuppressed(email: string): Promise<boolean> {
  const domain = email.split('@')[1]?.toLowerCase();
  const match = await prisma.suppressionList.findFirst({
    where: {
      OR: [{ email: email.toLowerCase() }, ...(domain ? [{ domain }] : [])],
    },
  });
  return Boolean(match);
}

/**
 * Build RFC 2822 raw base64url email string
 */
function createRawEmail(to: string, from: string, subject: string, bodyText: string, bodyHtml?: string): string {
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const boundary = `__boundary_${Date.now()}__`;

  let message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    bodyText,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    bodyHtml || `<p>${bodyText.replace(/\n/g, '<br/>')}</p>`,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Send an email via connected Gmail API or save simulation record
 */
export async function sendEmail(params: {
  companyId: string;
  contactId?: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  draftId?: string;
}) {
  // Check suppression list first
  if (await isSuppressed(params.toEmail)) {
    throw new Error(`Email ${params.toEmail} is on the suppression/opt-out list. Outbound email blocked.`);
  }

  const clientInfo = await getAuthorizedGmailClient();
  const senderEmail = clientInfo?.account.email || 'outreach@chasehorse.com';
  let gmailMessageId = `sim_msg_${Date.now()}`;
  let threadId = `sim_th_${Date.now()}`;

  if (clientInfo) {
    try {
      const raw = createRawEmail(
        params.toEmail,
        clientInfo.account.email,
        params.subject,
        params.bodyText,
        params.bodyHtml
      );
      const res = await clientInfo.gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
      });
      if (res.data.id) gmailMessageId = res.data.id;
      if (res.data.threadId) threadId = res.data.threadId;
    } catch (err: any) {
      console.error('Gmail API send error:', err);
      throw new Error(`Failed to send email via Gmail API: ${err.message}`);
    }
  }

  // Create or get EmailThread
  const emailThread = await prisma.emailThread.upsert({
    where: { gmailThreadId: threadId },
    update: {
      lastMessageAt: new Date(),
      status: 'ACTIVE',
      messagesCount: { increment: 1 },
    },
    create: {
      gmailThreadId: threadId,
      subject: params.subject,
      companyId: params.companyId,
      contactId: params.contactId,
      messagesCount: 1,
      status: 'ACTIVE',
    },
  });

  // Record Outbound EmailMessage
  const message = await prisma.emailMessage.create({
    data: {
      gmailMessageId,
      threadId,
      direction: 'OUTBOUND',
      fromEmail: senderEmail,
      toEmail: params.toEmail,
      subject: params.subject,
      bodyText: params.bodyText,
      bodyHtml: params.bodyHtml,
      snippet: params.bodyText.substring(0, 120),
      sentAt: new Date(),
      companyId: params.companyId,
      contactId: params.contactId,
      emailThreadId: emailThread.id,
    },
  });

  // Update draft if provided
  if (params.draftId) {
    await prisma.emailDraft.update({
      where: { id: params.draftId },
      data: { status: 'SENT', sentAt: new Date() },
    });
  }

  // Update company Kanban stage to "Email Sent" if currently at earlier stage
  const sentStage = await prisma.kanbanStage.findUnique({ where: { key: 'email_sent' } });
  if (sentStage) {
    await prisma.company.update({
      where: { id: params.companyId },
      data: { kanbanStageId: sentStage.id },
    });
  }

  // Log activity
  await prisma.leadActivity.create({
    data: {
      companyId: params.companyId,
      contactId: params.contactId,
      type: 'EMAIL_SENT',
      title: `Email sent to ${params.toEmail}`,
      description: `Subject: "${params.subject}"`,
      metadata: { gmailMessageId, threadId },
    },
  });

  return message;
}

/**
 * Sync Gmail replies: detects replies, matches to company/contact, classifies intent, generates AI reply
 */
export async function syncGmailReplies(): Promise<{ syncedCount: number; matchedReplies: number }> {
  const clientInfo = await getAuthorizedGmailClient();
  if (!clientInfo) {
    return { syncedCount: 0, matchedReplies: 0 };
  }

  let matchedReplies = 0;
  try {
    await prisma.gmailAccount.update({
      where: { id: clientInfo.account.id },
      data: { syncStatus: 'SYNCING' },
    });

    const res = await clientInfo.gmail.users.messages.list({
      userId: 'me',
      q: 'label:INBOX is:unread',
      maxResults: 20,
    });

    const messages = res.data.messages || [];

    for (const msg of messages) {
      if (!msg.id) continue;
      const fullMsg = await clientInfo.gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const headers = fullMsg.data.payload?.headers || [];
      const fromHeader = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || '';
      const subjectHeader = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || 'No Subject';
      const senderEmailMatch = fromHeader.match(/<([^>]+)>/) || [null, fromHeader];
      const senderEmail = (senderEmailMatch[1] || fromHeader).trim().toLowerCase();

      // Find matching contact by email
      const contact = await prisma.contact.findFirst({
        where: { email: { equals: senderEmail, mode: 'insensitive' } },
        include: { company: true },
      });

      const bodyText = fullMsg.data.snippet || '';

      // AI reply classification
      let sentiment = 'POSITIVE';
      let intent = 'INTERESTED';
      let suggestedReply = '';

      if (contact) {
        const aiAnalysis = await classifyIncomingReply({
          incomingBody: bodyText,
          senderName: contact.fullName,
          senderEmail,
          companyName: contact.company.name,
        });
        sentiment = aiAnalysis.sentiment;
        intent = aiAnalysis.intent;
        suggestedReply = aiAnalysis.suggestedReply;
      }

      // Upsert EmailMessage
      await prisma.emailMessage.upsert({
        where: { gmailMessageId: msg.id },
        update: {},
        create: {
          gmailMessageId: msg.id,
          threadId: fullMsg.data.threadId || undefined,
          direction: 'INBOUND',
          fromEmail: senderEmail,
          toEmail: clientInfo.account.email,
          subject: subjectHeader,
          bodyText,
          snippet: fullMsg.data.snippet || '',
          receivedAt: new Date(Number(fullMsg.data.internalDate) || Date.now()),
          companyId: contact?.companyId || null,
          contactId: contact?.id || null,
          sentiment,
          intent,
          suggestedReply,
        },
      });

      // If matched, advance Kanban status to 'Replied'
      if (contact) {
        matchedReplies++;
        const repliedStage = await prisma.kanbanStage.findUnique({ where: { key: 'replied' } });
        if (repliedStage) {
          await prisma.company.update({
            where: { id: contact.companyId },
            data: { kanbanStageId: repliedStage.id },
          });
        }

        await prisma.leadActivity.create({
          data: {
            companyId: contact.companyId,
            contactId: contact.id,
            type: 'EMAIL_RECEIVED',
            title: `Reply received from ${contact.fullName}`,
            description: `Subject: "${subjectHeader}". Sentiment: ${sentiment}`,
            metadata: { snippet: bodyText },
          },
        });
      }
    }

    await prisma.gmailAccount.update({
      where: { id: clientInfo.account.id },
      data: {
        syncStatus: 'IDLE',
        lastSyncAt: new Date(),
        lastErrorMessage: null,
      },
    });

    return { syncedCount: messages.length, matchedReplies };
  } catch (err: any) {
    console.error('Gmail sync error:', err);
    await prisma.gmailAccount.update({
      where: { id: clientInfo.account.id },
      data: { syncStatus: 'ERROR', lastErrorMessage: err.message },
    });
    return { syncedCount: 0, matchedReplies: 0 };
  }
}
