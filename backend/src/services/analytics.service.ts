import { prisma } from '../lib/prisma';
import { dayBounds } from './followups.service';
import { STAGES } from './leads.service';

/** All figures are computed from the user's own records. */
export async function dashboard(userId: string) {
  const { start, end } = dayBounds();
  const weekAhead = new Date(end.getTime() + 7 * 24 * 3600 * 1000);
  const [
    companies,
    researched,
    contacts,
    contactsWithEmail,
    qualified,
    draftsOpen,
    sent,
    replies,
    followUpsPending,
    overdue,
    today,
    meetings,
    stageCounts,
    recent,
    tasks,
    needsAction,
  ] = await Promise.all([
    prisma.company.count({ where: { userId } }),
    prisma.company.count({ where: { userId, lastResearchedAt: { not: null } } }),
    prisma.contact.count({ where: { userId } }),
    prisma.contact.count({ where: { userId, email: { not: null } } }),
    prisma.lead.count({ where: { userId, qualificationStatus: 'QUALIFIED' } }),
    prisma.emailDraft.count({ where: { userId, status: { in: ['DRAFT', 'APPROVED', 'FAILED'] } } }),
    prisma.emailActivity.count({ where: { userId, type: 'SENT' } }),
    prisma.emailActivity.count({ where: { userId, type: 'REPLY_RECEIVED' } }),
    prisma.followUp.count({ where: { userId, status: 'PENDING' } }),
    prisma.followUp.findMany({
      where: { userId, status: 'PENDING', dueAt: { lt: start } },
      orderBy: { dueAt: 'asc' },
      take: 8,
      include: { lead: { select: { id: true, company: { select: { id: true, name: true } } } } },
    }),
    prisma.followUp.findMany({
      where: { userId, status: 'PENDING', dueAt: { gte: start, lt: end } },
      orderBy: { dueAt: 'asc' },
      take: 8,
      include: { lead: { select: { id: true, company: { select: { id: true, name: true } } } } },
    }),
    prisma.followUp.findMany({
      where: { userId, status: 'PENDING', kind: 'MEETING', dueAt: { gte: start, lt: weekAhead } },
      orderBy: { dueAt: 'asc' },
      take: 8,
      include: { lead: { select: { id: true, company: { select: { id: true, name: true } } } }, calendarEvent: { select: { htmlLink: true } } },
    }),
    prisma.lead.groupBy({ by: ['stage'], where: { userId }, _count: true }),
    prisma.leadActivity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: { company: { select: { id: true, name: true } } },
    }),
    prisma.task.findMany({
      where: { userId, status: 'OPEN' },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 8,
      include: { lead: { select: { id: true, company: { select: { id: true, name: true } } } } },
    }),
    // Qualified leads not yet contacted, plus leads with approved drafts waiting to send.
    prisma.lead.findMany({
      where: {
        userId,
        OR: [{ stage: 'QUALIFIED' }, { drafts: { some: { status: 'APPROVED' } } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: {
        id: true,
        stage: true,
        score: true,
        company: { select: { id: true, name: true } },
        _count: { select: { drafts: { where: { status: 'APPROVED' } } } },
      },
    }),
  ]);

  const byStage = STAGES.map((s) => ({ ...s, count: stageCounts.find((c) => c.stage === s.key)?._count ?? 0 }));
  return {
    totals: {
      companies,
      researched,
      contacts,
      contactsWithEmail,
      qualified,
      draftsOpen,
      sent,
      replies,
      followUpsPending,
      meetingsUpcoming: meetings.length,
    },
    byStage,
    overdue,
    today,
    meetings,
    recent,
    tasks,
    needsAction,
  };
}

/** Weekly series for the analytics page (last 12 weeks). */
export async function trends(userId: string) {
  const weeks = 12;
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7)); // Monday
  const from = new Date(startOfWeek.getTime() - (weeks - 1) * 7 * 24 * 3600 * 1000);

  const [companies, drafts, sent, replies, researchRuns, scoreDist, providerCalls] = await Promise.all([
    prisma.company.findMany({ where: { userId, createdAt: { gte: from } }, select: { createdAt: true } }),
    prisma.emailDraft.findMany({ where: { userId, createdAt: { gte: from } }, select: { createdAt: true } }),
    prisma.emailActivity.findMany({ where: { userId, type: 'SENT', occurredAt: { gte: from } }, select: { occurredAt: true } }),
    prisma.emailActivity.findMany({ where: { userId, type: 'REPLY_RECEIVED', occurredAt: { gte: from } }, select: { occurredAt: true } }),
    prisma.companyResearch.groupBy({ by: ['status'], where: { userId }, _count: true }),
    prisma.lead.findMany({ where: { userId, score: { not: null } }, select: { score: true } }),
    prisma.providerCallLog.groupBy({ by: ['provider', 'status'], where: { userId, createdAt: { gte: from } }, _count: true }),
  ]);

  const bucket = (d: Date) => Math.floor((d.getTime() - from.getTime()) / (7 * 24 * 3600 * 1000));
  const series = Array.from({ length: weeks }, (_, i) => ({
    weekStart: new Date(from.getTime() + i * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    companies: 0,
    drafts: 0,
    sent: 0,
    replies: 0,
  }));
  for (const c of companies) series[bucket(c.createdAt)] && series[bucket(c.createdAt)].companies++;
  for (const d of drafts) series[bucket(d.createdAt)] && series[bucket(d.createdAt)].drafts++;
  for (const s of sent) series[bucket(s.occurredAt)] && series[bucket(s.occurredAt)].sent++;
  for (const r of replies) series[bucket(r.occurredAt)] && series[bucket(r.occurredAt)].replies++;

  const bands = [
    { label: '0–39', min: 0, max: 39 },
    { label: '40–64', min: 40, max: 64 },
    { label: '65–79', min: 65, max: 79 },
    { label: '80–100', min: 80, max: 100 },
  ].map((b) => ({ label: b.label, count: scoreDist.filter((l) => (l.score ?? -1) >= b.min && (l.score ?? -1) <= b.max).length }));

  return {
    series,
    research: Object.fromEntries(researchRuns.map((r) => [r.status, r._count])),
    scoreBands: bands,
    providerCalls: providerCalls.map((p) => ({ provider: p.provider, status: p.status, count: p._count })),
  };
}
