import type { Request, Response } from 'express';
import { z } from 'zod';
import { notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { currentUser } from '../middleware/auth';
import { parse } from '../middleware/common';
import * as analytics from '../services/analytics.service';
import * as campaigns from '../services/campaigns.service';
import * as email from '../services/email.service';
import * as followups from '../services/followups.service';
import { getSettings, updateSettings } from '../services/settings.service';

const id = z.string().uuid();
const optStr = (max = 500) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

// --- Email drafts --------------------------------------------------------------------

export async function listDrafts(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const status = parse(z.enum(['DRAFT', 'APPROVED', 'SENT', 'FAILED', 'ALL']).default('ALL'), req.query.status);
  const drafts = await prisma.emailDraft.findMany({
    where: { userId, ...(status === 'ALL' ? { status: { not: 'DISCARDED' } } : { status }) },
    orderBy: { updatedAt: 'desc' },
    take: 300,
    include: {
      company: { select: { id: true, name: true, domain: true } },
      contact: { select: { id: true, fullName: true, title: true, email: true, emailStatus: true, emailCertainty: true } },
      campaign: { select: { id: true, name: true } },
    },
  });
  res.json({ drafts });
}

export async function getDraft(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const draft = await prisma.emailDraft.findFirst({
    where: { id: parse(id, req.params.id), userId },
    include: {
      company: { select: { id: true, name: true, domain: true, contacts: { select: { id: true, fullName: true, email: true, title: true } } } },
      contact: true,
      activities: { orderBy: { occurredAt: 'desc' } },
    },
  });
  if (!draft) throw notFound('Draft');
  res.json({ draft });
}

const generateSchema = z.object({
  companyId: id,
  contactId: id.optional().nullable(),
  campaignId: id.optional().nullable(),
  objective: z.string().trim().min(5, 'Describe what this email should achieve').max(600),
  tone: z.enum(email.TONES),
  length: z.enum(email.LENGTHS),
  followUpOf: id.optional().nullable(),
});

export async function generateDraft(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  res.status(201).json({ draft: await email.generateDraft(userId, parse(generateSchema, req.body)) });
}

export async function updateDraft(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const body = parse(
    z.object({
      subject: z.string().trim().min(1).max(200).optional(),
      body: z.string().trim().min(1).max(10000).optional(),
      toEmail: z.string().trim().email().max(254).optional().nullable().or(z.literal('').transform(() => null)),
      contactId: id.optional().nullable(),
    }),
    req.body
  );
  res.json({ draft: await email.updateDraft(userId, parse(id, req.params.id), body) });
}

export async function approveDraft(req: Request, res: Response) {
  res.json({ draft: await email.approveDraft(currentUser(req).id, parse(id, req.params.id)) });
}

export async function discardDraft(req: Request, res: Response) {
  res.json({ draft: await email.discardDraft(currentUser(req).id, parse(id, req.params.id)) });
}

export async function sendDraft(req: Request, res: Response) {
  // Explicit, user-initiated send of an approved draft. Requires { confirm: true }.
  parse(z.object({ confirm: z.literal(true, { errorMap: () => ({ message: 'Confirm sending.' }) }) }), req.body);
  res.json({ draft: await email.sendApprovedDraft(currentUser(req).id, parse(id, req.params.id)) });
}

export async function emailHistory(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const items = await prisma.emailActivity.findMany({
    where: { userId },
    orderBy: { occurredAt: 'desc' },
    take: 300,
    include: { company: { select: { id: true, name: true } }, contact: { select: { id: true, fullName: true } }, lead: { select: { id: true } } },
  });
  res.json({ items });
}

export async function syncReplies(req: Request, res: Response) {
  res.json(await email.syncReplies(currentUser(req).id));
}

// --- Follow-ups ---------------------------------------------------------------------

export async function listFollowUps(req: Request, res: Response) {
  const scope = parse(z.enum(['overdue', 'today', 'upcoming', 'completed', 'all']).default('all'), req.query.scope);
  res.json({ followUps: await followups.listFollowUps(currentUser(req).id, scope) });
}

export async function createFollowUp(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const body = parse(
    z.object({
      leadId: id,
      contactId: id.optional().nullable(),
      kind: z.enum(['FOLLOW_UP', 'CALL', 'MEETING']).default('FOLLOW_UP'),
      title: z.string().trim().min(1).max(200),
      notes: optStr(2000),
      dueAt: z.coerce.date(),
      durationMinutes: z.number().int().min(5).max(480).optional(),
      addToCalendar: z.boolean().default(false),
      moveStage: z.boolean().default(true),
    }),
    req.body
  );
  res.status(201).json(await followups.createFollowUp(userId, body));
}

export async function updateFollowUp(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const fid = parse(id, req.params.id);
  const body = parse(z.object({ status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(), dueAt: z.coerce.date().optional(), notes: optStr(2000) }), req.body);
  let result;
  if (body.dueAt) result = await followups.rescheduleFollowUp(userId, fid, body.dueAt, body.notes);
  if (body.status) result = await followups.setFollowUpStatus(userId, fid, body.status);
  res.json({ followUp: result });
}

export async function addFollowUpToCalendar(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const { durationMinutes } = parse(z.object({ durationMinutes: z.number().int().min(5).max(480).default(30) }), req.body || {});
  res.json({ event: await followups.addCalendarEvent(userId, parse(id, req.params.id), durationMinutes) });
}

// --- Campaigns ----------------------------------------------------------------------

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  objective: z.string().trim().min(5).max(600),
  description: optStr(2000),
  tone: z.enum(email.TONES).default('professional'),
  serviceId: id.optional().nullable(),
  leadIds: z.array(id).max(500).optional(),
});

export async function listCampaigns(req: Request, res: Response) {
  res.json({ campaigns: await campaigns.listCampaigns(currentUser(req).id) });
}
export async function getCampaign(req: Request, res: Response) {
  res.json({ campaign: await campaigns.getCampaign(currentUser(req).id, parse(id, req.params.id)) });
}
export async function createCampaign(req: Request, res: Response) {
  res.status(201).json({ campaign: await campaigns.createCampaign(currentUser(req).id, parse(campaignSchema, req.body)) });
}
export async function updateCampaign(req: Request, res: Response) {
  const body = parse(campaignSchema.omit({ leadIds: true }).partial().extend({ status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED']).optional() }), req.body);
  res.json({ campaign: await campaigns.updateCampaign(currentUser(req).id, parse(id, req.params.id), body) });
}
export async function deleteCampaign(req: Request, res: Response) {
  await campaigns.deleteCampaign(currentUser(req).id, parse(id, req.params.id));
  res.json({ ok: true });
}
export async function enrollLeads(req: Request, res: Response) {
  const { leadIds } = parse(z.object({ leadIds: z.array(id).min(1).max(500) }), req.body);
  res.json(await campaigns.enroll(currentUser(req).id, parse(id, req.params.id), leadIds));
}
export async function unenrollLead(req: Request, res: Response) {
  await campaigns.unenroll(currentUser(req).id, parse(id, req.params.id), parse(id, req.params.leadId));
  res.json({ ok: true });
}
export async function generateCampaignDrafts(req: Request, res: Response) {
  const { length } = parse(z.object({ length: z.enum(email.LENGTHS).default('short') }), req.body || {});
  res.json(await campaigns.generateCampaignDrafts(currentUser(req).id, parse(id, req.params.id), length));
}

// --- Settings, services, suppression -------------------------------------------------

export async function getSettingsHandler(req: Request, res: Response) {
  res.json({ settings: await getSettings(currentUser(req).id) });
}

export async function updateSettingsHandler(req: Request, res: Response) {
  const body = parse(
    z.object({
      businessName: z.string().trim().min(1).max(120).optional(),
      businessDescription: z.string().trim().max(2000).optional(),
      valueProposition: z.string().trim().max(2000).optional(),
      idealCustomerProfile: z.string().trim().max(2000).optional(),
      senderName: z.string().trim().max(120).optional(),
      senderTitle: z.string().trim().max(120).optional(),
      signature: z.string().trim().max(1000).optional(),
      geminiModel: z.string().trim().regex(/^[a-z0-9.\-]+$/i, 'Invalid model id').max(80).optional(),
      useSearchGrounding: z.boolean().optional(),
      defaultTone: z.enum(email.TONES).optional(),
      defaultLength: z.enum(email.LENGTHS).optional(),
    }),
    req.body
  );
  res.json({ settings: await updateSettings(currentUser(req).id, body) });
}

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  valueProposition: z.string().trim().max(2000).default(''),
  targetIndustries: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  isActive: z.boolean().default(true),
});

export async function listServices(req: Request, res: Response) {
  res.json({ services: await prisma.service.findMany({ where: { userId: currentUser(req).id }, orderBy: { createdAt: 'asc' } }) });
}
export async function createService(req: Request, res: Response) {
  res.status(201).json({ service: await prisma.service.create({ data: { userId: currentUser(req).id, ...parse(serviceSchema, req.body) } }) });
}
export async function updateService(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const sid = parse(id, req.params.id);
  const owned = await prisma.service.findFirst({ where: { id: sid, userId } });
  if (!owned) throw notFound('Service');
  res.json({ service: await prisma.service.update({ where: { id: sid }, data: parse(serviceSchema.partial(), req.body) }) });
}
export async function deleteService(req: Request, res: Response) {
  const r = await prisma.service.deleteMany({ where: { id: parse(id, req.params.id), userId: currentUser(req).id } });
  if (!r.count) throw notFound('Service');
  res.json({ ok: true });
}

export async function listSuppression(req: Request, res: Response) {
  res.json({ entries: await prisma.suppressionEntry.findMany({ where: { userId: currentUser(req).id }, orderBy: { createdAt: 'desc' } }) });
}
export async function addSuppression(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const body = parse(
    z
      .object({
        email: z.string().trim().toLowerCase().email().optional(),
        domain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'Invalid domain').optional(),
        reason: z.string().trim().min(1).max(200).default('Do not contact'),
      })
      .refine((b) => Boolean(b.email) !== Boolean(b.domain), { message: 'Provide either an email or a domain.' }),
    req.body
  );
  const existing = await prisma.suppressionEntry.findFirst({ where: { userId, ...(body.email ? { email: body.email } : { domain: body.domain }) } });
  if (existing) return res.json({ entry: existing });
  res.status(201).json({ entry: await prisma.suppressionEntry.create({ data: { userId, ...body } }) });
}
export async function removeSuppression(req: Request, res: Response) {
  const r = await prisma.suppressionEntry.deleteMany({ where: { id: parse(id, req.params.id), userId: currentUser(req).id } });
  if (!r.count) throw notFound('Entry');
  res.json({ ok: true });
}

// --- Analytics ----------------------------------------------------------------------

export async function dashboard(req: Request, res: Response) {
  res.json(await analytics.dashboard(currentUser(req).id));
}
export async function trends(req: Request, res: Response) {
  res.json(await analytics.trends(currentUser(req).id));
}
