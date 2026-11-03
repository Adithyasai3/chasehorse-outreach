import type { LeadStage, Prisma } from '@prisma/client';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { ActivityType, logActivity } from './activity.service';

export const STAGES: { key: LeadStage; label: string }[] = [
  { key: 'NEW_LEAD', label: 'New lead' },
  { key: 'RESEARCHING', label: 'Researching' },
  { key: 'QUALIFIED', label: 'Qualified' },
  { key: 'CONTACTED', label: 'Contacted' },
  { key: 'FOLLOW_UP', label: 'Follow-up' },
  { key: 'MEETING_SCHEDULED', label: 'Meeting scheduled' },
  { key: 'NEGOTIATION', label: 'Negotiation' },
  { key: 'WON', label: 'Won' },
  { key: 'LOST', label: 'Lost' },
];
export const stageLabel = (s: LeadStage) => STAGES.find((x) => x.key === s)?.label || s;

export const leadCardSelect = {
  id: true,
  stage: true,
  position: true,
  owner: true,
  score: true,
  qualificationStatus: true,
  scoreIsManual: true,
  estimatedValue: true,
  updatedAt: true,
  company: { select: { id: true, name: true, domain: true, industry: true, city: true, country: true, employeeRange: true, logoUrl: true } },
  primaryContact: { select: { id: true, fullName: true, title: true, email: true } },
  followUps: { where: { status: 'PENDING' as const }, orderBy: { dueAt: 'asc' as const }, take: 1, select: { id: true, dueAt: true, title: true } },
  _count: { select: { drafts: true, emailActs: true, tasks: { where: { status: 'OPEN' as const } } } },
} satisfies Prisma.LeadSelect;

export async function listLeads(
  userId: string,
  q: { search?: string; stage?: LeadStage; status?: string; owner?: string; minScore?: number; sort?: string }
) {
  const where: Prisma.LeadWhereInput = { userId };
  if (q.stage) where.stage = q.stage;
  if (q.status) where.qualificationStatus = q.status as Prisma.EnumQualificationStatusFilter['equals'];
  if (q.owner) where.owner = { equals: q.owner, mode: 'insensitive' };
  if (q.minScore !== undefined) where.score = { gte: q.minScore };
  if (q.search) {
    where.OR = [
      { company: { name: { contains: q.search, mode: 'insensitive' } } },
      { company: { domain: { contains: q.search, mode: 'insensitive' } } },
      { company: { industry: { contains: q.search, mode: 'insensitive' } } },
      { primaryContact: { fullName: { contains: q.search, mode: 'insensitive' } } },
    ];
  }
  const orderBy: Prisma.LeadOrderByWithRelationInput =
    q.sort === 'score' ? { score: { sort: 'desc', nulls: 'last' } } : q.sort === 'name' ? { company: { name: 'asc' } } : { updatedAt: 'desc' };
  return prisma.lead.findMany({ where, select: leadCardSelect, orderBy, take: 500 });
}

export async function board(userId: string, q: { search?: string; owner?: string }) {
  const leads = await listLeads(userId, { ...q });
  return STAGES.map((s) => ({
    ...s,
    leads: leads.filter((l) => l.stage === s.key).sort((a, b) => a.position - b.position),
  }));
}

export async function getLead(userId: string, id: string) {
  const lead = await prisma.lead.findFirst({
    where: { id, userId },
    include: {
      company: { include: { contacts: { orderBy: { createdAt: 'asc' } } } },
      primaryContact: true,
      notes: { orderBy: { createdAt: 'desc' } },
      tasks: { orderBy: [{ status: 'asc' }, { dueDate: 'asc' }] },
      followUps: { orderBy: { dueAt: 'asc' }, include: { contact: { select: { fullName: true } }, calendarEvent: true } },
      scores: { orderBy: { createdAt: 'desc' }, take: 10 },
      activities: { orderBy: { createdAt: 'desc' }, take: 100 },
      drafts: { where: { status: { not: 'DISCARDED' } }, orderBy: { updatedAt: 'desc' }, include: { contact: { select: { fullName: true } } } },
      emailActs: { orderBy: { occurredAt: 'desc' } },
      campaigns: { include: { campaign: { select: { id: true, name: true, status: true } } } },
    },
  });
  if (!lead) throw notFound('Lead');
  return lead;
}

export async function updateLead(
  userId: string,
  id: string,
  data: { owner?: string | null; estimatedValue?: number | null; lostReason?: string | null; primaryContactId?: string | null }
) {
  const lead = await prisma.lead.findFirst({ where: { id, userId } });
  if (!lead) throw notFound('Lead');
  if (data.primaryContactId) {
    const c = await prisma.contact.findFirst({ where: { id: data.primaryContactId, userId, companyId: lead.companyId } });
    if (!c) throw notFound('Contact');
  }
  const updated = await prisma.lead.update({ where: { id }, data });
  const changes = Object.keys(data).join(', ');
  await logActivity({ userId, leadId: id, companyId: lead.companyId, type: ActivityType.LEAD_UPDATED, title: 'Lead updated', details: changes });
  return updated;
}

/** Moves a lead to a stage and index, renumbering both affected columns atomically. */
export async function moveLead(userId: string, id: string, stage: LeadStage, index: number) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({ where: { id, userId } });
    if (!lead) throw notFound('Lead');
    const target = await tx.lead.findMany({
      where: { userId, stage, NOT: { id } },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    const clamped = Math.max(0, Math.min(index, target.length));
    const ordered = [...target.slice(0, clamped).map((l) => l.id), id, ...target.slice(clamped).map((l) => l.id)];
    for (let i = 0; i < ordered.length; i++) {
      await tx.lead.update({ where: { id: ordered[i] }, data: { position: i, ...(ordered[i] === id ? { stage } : {}) } });
    }
    if (lead.stage !== stage) {
      const source = await tx.lead.findMany({ where: { userId, stage: lead.stage }, orderBy: { position: 'asc' }, select: { id: true } });
      for (let i = 0; i < source.length; i++) await tx.lead.update({ where: { id: source[i].id }, data: { position: i } });
      await logActivity(
        { userId, leadId: id, companyId: lead.companyId, type: ActivityType.STAGE_CHANGED, title: `Moved to ${stageLabel(stage)}`, metadata: { from: lead.stage, to: stage } },
        tx
      );
    }
    return tx.lead.findUniqueOrThrow({ where: { id }, select: leadCardSelect });
  });
}

export async function deleteLead(userId: string, id: string) {
  const lead = await prisma.lead.findFirst({ where: { id, userId } });
  if (!lead) throw notFound('Lead');
  // Deleting the company removes the lead, contacts, research and drafts with it.
  await prisma.company.delete({ where: { id: lead.companyId } });
}

export async function addNote(userId: string, leadId: string, content: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, userId } });
  if (!lead) throw notFound('Lead');
  const note = await prisma.note.create({ data: { userId, leadId, content } });
  await logActivity({ userId, leadId, companyId: lead.companyId, type: ActivityType.NOTE_ADDED, title: 'Note added', details: content.slice(0, 160) });
  return note;
}

export async function deleteNote(userId: string, noteId: string) {
  const res = await prisma.note.deleteMany({ where: { id: noteId, userId } });
  if (!res.count) throw notFound('Note');
}

export async function addTask(userId: string, data: { leadId?: string | null; title: string; dueDate?: Date | null }) {
  let companyId: string | null = null;
  if (data.leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: data.leadId, userId } });
    if (!lead) throw notFound('Lead');
    companyId = lead.companyId;
  }
  const task = await prisma.task.create({ data: { userId, leadId: data.leadId || null, title: data.title, dueDate: data.dueDate || null } });
  if (data.leadId) await logActivity({ userId, leadId: data.leadId, companyId, type: ActivityType.TASK_ADDED, title: `Task: ${data.title}` });
  return task;
}

export async function setTaskStatus(userId: string, id: string, done: boolean) {
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) throw notFound('Task');
  return prisma.task.update({ where: { id }, data: { status: done ? 'DONE' : 'OPEN', completedAt: done ? new Date() : null } });
}

export async function deleteTask(userId: string, id: string) {
  const res = await prisma.task.deleteMany({ where: { id, userId } });
  if (!res.count) throw notFound('Task');
}

export function assertStage(value: string): LeadStage {
  if (!STAGES.some((s) => s.key === value)) throw new AppError('VALIDATION', `Unknown stage ${value}`);
  return value as LeadStage;
}
