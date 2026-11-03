import type { CampaignStatus } from '@prisma/client';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { generateDraft, LENGTHS, TONES } from './email.service';

async function owned(userId: string, id: string) {
  const c = await prisma.campaign.findFirst({ where: { id, userId } });
  if (!c) throw notFound('Campaign');
  return c;
}

/** Campaign metrics derived from actual drafts and email activity. */
async function stats(campaignId: string) {
  const [enrolled, drafts, sent] = await Promise.all([
    prisma.campaignLead.count({ where: { campaignId } }),
    prisma.emailDraft.groupBy({ by: ['status'], where: { campaignId }, _count: true }),
    prisma.emailActivity.findMany({ where: { draft: { campaignId }, type: 'SENT' }, select: { gmailThreadId: true } }),
  ]);
  const threadIds = sent.map((s) => s.gmailThreadId).filter((t): t is string => Boolean(t));
  const replies = threadIds.length
    ? await prisma.emailActivity.findMany({ where: { type: 'REPLY_RECEIVED', gmailThreadId: { in: threadIds } }, distinct: ['gmailThreadId'], select: { id: true } })
    : [];
  const byStatus = Object.fromEntries(drafts.map((d) => [d.status, d._count]));
  return {
    enrolled,
    drafts: (byStatus.DRAFT || 0) + (byStatus.FAILED || 0),
    approved: byStatus.APPROVED || 0,
    sent: sent.length,
    repliedThreads: replies.length,
    replyRate: sent.length ? Math.round((replies.length / sent.length) * 1000) / 10 : null,
  };
}

export async function listCampaigns(userId: string) {
  const campaigns = await prisma.campaign.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, include: { service: { select: { id: true, name: true } } } });
  return Promise.all(campaigns.map(async (c) => ({ ...c, stats: await stats(c.id) })));
}

export async function getCampaign(userId: string, id: string) {
  await owned(userId, id);
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id },
    include: {
      service: true,
      leads: {
        orderBy: { enrolledAt: 'desc' },
        include: {
          lead: {
            select: {
              id: true,
              stage: true,
              score: true,
              company: { select: { id: true, name: true, domain: true } },
              primaryContact: { select: { id: true, fullName: true, email: true } },
            },
          },
        },
      },
      drafts: { where: { status: { not: 'DISCARDED' } }, orderBy: { updatedAt: 'desc' }, select: { id: true, leadId: true, status: true, subject: true, updatedAt: true } },
    },
  });
  return { ...campaign, stats: await stats(id) };
}

export async function createCampaign(
  userId: string,
  data: { name: string; objective: string; description?: string | null; tone: string; serviceId?: string | null; leadIds?: string[] }
) {
  if (data.serviceId) {
    const s = await prisma.service.findFirst({ where: { id: data.serviceId, userId } });
    if (!s) throw notFound('Service');
  }
  const campaign = await prisma.campaign.create({
    data: { userId, name: data.name, objective: data.objective, description: data.description || null, tone: data.tone, serviceId: data.serviceId || null },
  });
  if (data.leadIds?.length) await enroll(userId, campaign.id, data.leadIds);
  return campaign;
}

export async function updateCampaign(
  userId: string,
  id: string,
  data: { name?: string; objective?: string; description?: string | null; tone?: string; status?: CampaignStatus; serviceId?: string | null }
) {
  await owned(userId, id);
  if (data.serviceId) {
    const s = await prisma.service.findFirst({ where: { id: data.serviceId, userId } });
    if (!s) throw notFound('Service');
  }
  return prisma.campaign.update({ where: { id }, data });
}

export async function deleteCampaign(userId: string, id: string) {
  await owned(userId, id);
  await prisma.campaign.delete({ where: { id } });
}

export async function enroll(userId: string, id: string, leadIds: string[]) {
  await owned(userId, id);
  const leads = await prisma.lead.findMany({ where: { userId, id: { in: leadIds } }, select: { id: true } });
  if (leads.length !== new Set(leadIds).size) throw new AppError('VALIDATION', 'Some leads were not found.');
  const res = await prisma.campaignLead.createMany({ data: leads.map((l) => ({ campaignId: id, leadId: l.id })), skipDuplicates: true });
  return { enrolled: res.count };
}

export async function unenroll(userId: string, id: string, leadId: string) {
  await owned(userId, id);
  await prisma.campaignLead.deleteMany({ where: { campaignId: id, leadId } });
}

/**
 * Generates drafts (never sends) for enrolled leads that have a primary contact with an email
 * and no open draft in this campaign yet. Runs sequentially to respect provider rate limits.
 */
export async function generateCampaignDrafts(userId: string, id: string, length: (typeof LENGTHS)[number]) {
  const campaign = await owned(userId, id);
  const tone = (TONES as readonly string[]).includes(campaign.tone) ? (campaign.tone as (typeof TONES)[number]) : 'professional';
  const enrolled = await prisma.campaignLead.findMany({
    where: { campaignId: id },
    include: { lead: { include: { primaryContact: true, drafts: { where: { campaignId: id, status: { in: ['DRAFT', 'APPROVED', 'SENT'] } }, select: { id: true } } } } },
  });
  const created: string[] = [];
  const skipped: { leadId: string; reason: string }[] = [];
  const failed: { leadId: string; reason: string }[] = [];
  for (const e of enrolled) {
    if (e.lead.drafts.length) {
      skipped.push({ leadId: e.leadId, reason: 'already has a campaign draft' });
      continue;
    }
    if (!e.lead.primaryContact?.email) {
      skipped.push({ leadId: e.leadId, reason: 'no primary contact with an email' });
      continue;
    }
    try {
      const d = await generateDraft(userId, { companyId: e.lead.companyId, contactId: e.lead.primaryContact.id, campaignId: id, objective: campaign.objective, tone, length });
      created.push(d.id);
    } catch (err) {
      failed.push({ leadId: e.leadId, reason: (err as Error).message });
      if (err instanceof AppError && ['PROVIDER_AUTH', 'NOT_CONFIGURED', 'PROVIDER_CREDITS'].includes(err.code)) break;
    }
  }
  return { created: created.length, skipped, failed };
}
