import { generateJson } from '../integrations/gemini.client';
import { getThreadMessages, sendGmail } from '../integrations/google.client';
import { AppError, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { ActivityType, logActivity } from './activity.service';
import { latestResearch, type ResearchContent } from './research.service';
import { getSettings } from './settings.service';

export const TONES = ['professional', 'friendly', 'direct', 'consultative'] as const;
export const LENGTHS = ['short', 'medium', 'long'] as const;
const LENGTH_WORDS: Record<(typeof LENGTHS)[number], string> = { short: '60-90', medium: '100-140', long: '150-200' };

export interface GenerateDraftInput {
  companyId: string;
  contactId?: string | null;
  campaignId?: string | null;
  objective: string;
  tone: (typeof TONES)[number];
  length: (typeof LENGTHS)[number];
  followUpOf?: string | null; // draft id this follows up
}

export async function generateDraft(userId: string, input: GenerateDraftInput) {
  const company = await prisma.company.findFirst({ where: { id: input.companyId, userId } });
  if (!company) throw notFound('Company');
  const contact = input.contactId ? await prisma.contact.findFirst({ where: { id: input.contactId, userId, companyId: company.id } }) : null;
  if (input.contactId && !contact) throw notFound('Contact');
  const campaign = input.campaignId ? await prisma.campaign.findFirst({ where: { id: input.campaignId, userId }, include: { service: true } }) : null;
  const lead = await prisma.lead.findUnique({ where: { userId_companyId: { userId, companyId: company.id } } });
  const settings = await getSettings(userId);
  const services = await prisma.service.findMany({ where: { userId, isActive: true } });
  const research = await latestResearch(userId, company.id);
  const content = research?.content as unknown as ResearchContent | undefined;
  const history = await prisma.emailActivity.findMany({
    where: { userId, companyId: company.id },
    orderBy: { occurredAt: 'desc' },
    take: 5,
    select: { direction: true, subject: true, snippet: true, occurredAt: true },
  });
  const previousDraft = input.followUpOf ? await prisma.emailDraft.findFirst({ where: { id: input.followUpOf, userId } }) : null;

  const context = [
    `SENDER: ${settings.senderName || '(name not set)'}${settings.senderTitle ? `, ${settings.senderTitle}` : ''} at ${settings.businessName}`,
    settings.businessDescription && `WHAT WE DO: ${settings.businessDescription}`,
    settings.valueProposition && `VALUE PROPOSITION: ${settings.valueProposition}`,
    campaign?.service
      ? `SERVICE TO PITCH: ${campaign.service.name}: ${campaign.service.description} ${campaign.service.valueProposition}`
      : services.length
        ? `OUR SERVICES:\n${services.map((s) => `- ${s.name}: ${s.description}`).join('\n')}`
        : null,
    `RECIPIENT: ${contact ? `${contact.fullName}${contact.title ? `, ${contact.title}` : ''}` : 'unknown person; address the team generically'} at ${company.name}`,
    content
      ? `KNOWN FACTS:\n${content.facts.map((f) => `- ${f.label}: ${f.value}`).join('\n')}\nSOURCED FINDINGS:\n${content.findings.slice(0, 10).map((f) => `- ${f.statement}`).join('\n') || '- none'}\nANALYST VIEW (inference, not fact):\n- ${content.analysis.overview.text}\n- Suggested angle: ${content.analysis.outreachAngle.text}\n${content.analysis.opportunities.map((o) => `- ${o.text}`).join('\n')}`
      : `KNOWN FACTS:\n- Company: ${company.name}${company.industry ? `\n- Industry: ${company.industry}` : ''}${company.description ? `\n- Description: ${company.description}` : ''}`,
    lead?.outreachStrategy && `RECOMMENDED STRATEGY: ${lead.outreachStrategy}`,
    history.length
      ? `PREVIOUS EMAILS WITH THIS COMPANY:\n${history.map((h) => `- ${h.occurredAt.toISOString().slice(0, 10)} ${h.direction === 'OUTBOUND' ? 'we sent' : 'they replied'}: "${h.subject}" ${h.snippet ? `(${h.snippet.slice(0, 120)})` : ''}`).join('\n')}`
      : 'PREVIOUS EMAILS: none, this is the first contact',
    previousDraft && `THIS IS A FOLLOW-UP TO: "${previousDraft.subject}"\n${previousDraft.body.slice(0, 800)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const prompt = `Write a cold B2B email.

${context}

OBJECTIVE: ${input.objective}
TONE: ${input.tone}
LENGTH: ${LENGTH_WORDS[input.length]} words for the body.

Rules:
- Reference one or two specific things from KNOWN FACTS or SOURCED FINDINGS. Never present ANALYST VIEW items as facts about them; if you use them, phrase as a question or possibility.
- Do not invent statistics, customer names, case studies, awards, or results. Do not claim we have worked with them.
- No spammy phrases ("I hope this email finds you well", "game-changer", "revolutionize", "quick question"), no exclamation marks, no emojis.
- One clear, low-pressure call to action.
- Plain text. Greeting with first name if known. End with the sender name${settings.signature ? ' (the signature will be appended separately, so do not add contact details)' : ''}.
- Subject: under 8 words, specific, no clickbait.
Also list in "personalizationNotes" exactly which facts/findings you used.`;

  const out = await generateJson<{ subject: string; body: string; personalizationNotes: string }>({
    userId,
    model: settings.geminiModel,
    operation: 'EMAIL_GENERATION',
    prompt,
    temperature: 0.6,
    jsonSchema: {
      type: 'object',
      properties: { subject: { type: 'string' }, body: { type: 'string' }, personalizationNotes: { type: 'string' } },
      required: ['subject', 'body', 'personalizationNotes'],
    },
  });

  const body = settings.signature ? `${out.body.trim()}\n\n${settings.signature.trim()}` : out.body.trim();
  const draft = await prisma.emailDraft.create({
    data: {
      userId,
      companyId: company.id,
      leadId: lead?.id,
      contactId: contact?.id,
      campaignId: campaign?.id,
      toEmail: contact?.email || null,
      subject: out.subject.trim(),
      body,
      tone: input.tone,
      length: input.length,
      objective: input.objective,
      personalizationNotes: out.personalizationNotes,
      generatedByAi: true,
      model: settings.geminiModel,
    },
  });
  await logActivity({ userId, leadId: lead?.id, companyId: company.id, contactId: contact?.id, type: ActivityType.DRAFT_CREATED, title: `Draft created: "${draft.subject}"` });
  return draft;
}

async function ownedDraft(userId: string, id: string) {
  const draft = await prisma.emailDraft.findFirst({ where: { id, userId } });
  if (!draft) throw notFound('Draft');
  return draft;
}

export async function updateDraft(userId: string, id: string, data: { subject?: string; body?: string; toEmail?: string | null; contactId?: string | null }) {
  const draft = await ownedDraft(userId, id);
  if (draft.status === 'SENT') throw new AppError('CONFLICT', 'This email has already been sent and cannot be edited.');
  if (data.contactId) {
    const c = await prisma.contact.findFirst({ where: { id: data.contactId, userId, companyId: draft.companyId } });
    if (!c) throw notFound('Contact');
  }
  const changed =
    (data.subject !== undefined && data.subject !== draft.subject) ||
    (data.body !== undefined && data.body !== draft.body) ||
    (data.toEmail !== undefined && data.toEmail !== draft.toEmail);
  return prisma.emailDraft.update({
    where: { id },
    data: {
      ...data,
      toEmail: data.toEmail !== undefined ? data.toEmail?.trim().toLowerCase() || null : undefined,
      // Editing invalidates approval: what gets sent must be what was approved.
      ...(changed && draft.status === 'APPROVED' ? { status: 'DRAFT', approvedAt: null } : {}),
      ...(draft.status === 'FAILED' ? { status: 'DRAFT', lastError: null } : {}),
    },
  });
}

export async function approveDraft(userId: string, id: string) {
  const draft = await ownedDraft(userId, id);
  if (draft.status !== 'DRAFT') throw new AppError('CONFLICT', `Only drafts can be approved (this one is ${draft.status.toLowerCase()}).`);
  if (!draft.toEmail) throw new AppError('VALIDATION', 'Add a recipient email before approving.');
  const updated = await prisma.emailDraft.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date() } });
  await logActivity({ userId, leadId: draft.leadId, companyId: draft.companyId, contactId: draft.contactId, type: ActivityType.DRAFT_APPROVED, title: `Draft approved: "${draft.subject}"` });
  return updated;
}

export async function discardDraft(userId: string, id: string) {
  const draft = await ownedDraft(userId, id);
  if (draft.status === 'SENT') throw new AppError('CONFLICT', 'Sent emails cannot be discarded.');
  return prisma.emailDraft.update({ where: { id }, data: { status: 'DISCARDED' } });
}

export async function isSuppressed(userId: string, email: string) {
  const domain = email.split('@')[1]?.toLowerCase();
  const hit = await prisma.suppressionEntry.findFirst({
    where: { userId, OR: [{ email: email.toLowerCase() }, ...(domain ? [{ domain }] : [])] },
  });
  return Boolean(hit);
}

const EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/;

/** Sends an approved draft via the user's Gmail. Never called automatically. */
export async function sendApprovedDraft(userId: string, id: string) {
  const draft = await ownedDraft(userId, id);
  if (draft.status === 'SENT') throw new AppError('CONFLICT', 'This email was already sent.');
  if (draft.status !== 'APPROVED') throw new AppError('CONFLICT', 'Approve this draft before sending.');
  if (!draft.toEmail || !EMAIL_RE.test(draft.toEmail)) throw new AppError('VALIDATION', 'The recipient email address is invalid.');
  if (await isSuppressed(userId, draft.toEmail)) {
    throw new AppError('FORBIDDEN', `${draft.toEmail} is on your suppression list. Remove it there if you really intend to email them.`);
  }

  // Claim the draft atomically so a double click cannot send twice.
  const claimed = await prisma.emailDraft.updateMany({ where: { id, userId, status: 'APPROVED' }, data: { status: 'SENT', sentAt: new Date() } });
  if (claimed.count === 0) throw new AppError('CONFLICT', 'This draft is already being sent.');

  const settings = await getSettings(userId);
  try {
    const sent = await sendGmail(userId, { to: draft.toEmail, subject: draft.subject, body: draft.body, fromName: settings.senderName || undefined });
    await prisma.$transaction(async (tx) => {
      await tx.emailActivity.create({
        data: {
          userId,
          draftId: draft.id,
          leadId: draft.leadId,
          companyId: draft.companyId,
          contactId: draft.contactId,
          direction: 'OUTBOUND',
          type: 'SENT',
          gmailMessageId: sent.messageId,
          gmailThreadId: sent.threadId,
          fromEmail: sent.from,
          toEmail: draft.toEmail as string,
          subject: draft.subject,
          snippet: draft.body.slice(0, 200),
        },
      });
      if (draft.leadId) {
        const lead = await tx.lead.findUnique({ where: { id: draft.leadId } });
        if (lead && ['NEW_LEAD', 'RESEARCHING', 'QUALIFIED'].includes(lead.stage)) {
          await tx.lead.update({ where: { id: lead.id }, data: { stage: 'CONTACTED' } });
        }
      }
      await logActivity(
        { userId, leadId: draft.leadId, companyId: draft.companyId, contactId: draft.contactId, type: ActivityType.EMAIL_SENT, title: `Email sent to ${draft.toEmail}`, details: draft.subject, metadata: { gmailMessageId: sent.messageId } },
        tx
      );
    });
    return prisma.emailDraft.findUniqueOrThrow({ where: { id } });
  } catch (err) {
    const message = (err as Error).message;
    await prisma.emailDraft.update({ where: { id }, data: { status: 'FAILED', sentAt: null, lastError: message.slice(0, 500) } });
    await prisma.emailActivity.create({
      data: {
        userId,
        draftId: draft.id,
        leadId: draft.leadId,
        companyId: draft.companyId,
        contactId: draft.contactId,
        direction: 'OUTBOUND',
        type: 'SEND_FAILED',
        fromEmail: '',
        toEmail: draft.toEmail,
        subject: draft.subject,
        error: message.slice(0, 500),
      },
    });
    await logActivity({ userId, leadId: draft.leadId, companyId: draft.companyId, type: ActivityType.EMAIL_FAILED, title: 'Email failed to send', details: message.slice(0, 300) });
    throw err;
  }
}

function addressOf(header: string) {
  const m = header.match(/<([^>]+)>/);
  return (m ? m[1] : header).trim().toLowerCase();
}

/**
 * Checks Gmail threads of emails we sent in the last 30 days for new messages from
 * other people, and records them as replies. Read-only on the Gmail side.
 */
export async function syncReplies(userId: string) {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const sent = await prisma.emailActivity.findMany({
    where: { userId, type: 'SENT', gmailThreadId: { not: null }, occurredAt: { gte: since } },
    distinct: ['gmailThreadId'],
    select: { gmailThreadId: true, fromEmail: true, leadId: true, companyId: true, contactId: true },
  });
  let newReplies = 0;
  for (const s of sent) {
    const messages = await getThreadMessages(userId, s.gmailThreadId as string);
    for (const m of messages) {
      if (!m.id || addressOf(m.from) === s.fromEmail.toLowerCase()) continue;
      const exists = await prisma.emailActivity.findUnique({ where: { userId_gmailMessageId: { userId, gmailMessageId: m.id } } });
      if (exists) continue;
      await prisma.emailActivity.create({
        data: {
          userId,
          leadId: s.leadId,
          companyId: s.companyId,
          contactId: s.contactId,
          direction: 'INBOUND',
          type: 'REPLY_RECEIVED',
          gmailMessageId: m.id,
          gmailThreadId: s.gmailThreadId,
          fromEmail: addressOf(m.from),
          toEmail: s.fromEmail,
          subject: m.subject,
          snippet: m.snippet.slice(0, 300),
          occurredAt: m.internalDate ? new Date(m.internalDate) : new Date(),
        },
      });
      await logActivity({ userId, leadId: s.leadId, companyId: s.companyId, contactId: s.contactId, type: ActivityType.REPLY_RECEIVED, title: `Reply from ${addressOf(m.from)}`, details: m.snippet.slice(0, 200) });
      newReplies++;
    }
  }
  logger.info('Reply sync complete', { threads: sent.length, newReplies });
  return { threadsChecked: sent.length, newReplies };
}
