import type { FollowUpKind } from '@prisma/client';
import { createCalendarEvent } from '../integrations/google.client';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { ActivityType, logActivity } from './activity.service';

export async function createFollowUp(
  userId: string,
  data: {
    leadId: string;
    contactId?: string | null;
    kind: FollowUpKind;
    title: string;
    notes?: string | null;
    dueAt: Date;
    durationMinutes?: number;
    addToCalendar: boolean;
    moveStage: boolean;
  }
) {
  const lead = await prisma.lead.findFirst({ where: { id: data.leadId, userId }, include: { company: true } });
  if (!lead) throw notFound('Lead');
  const contact = data.contactId ? await prisma.contact.findFirst({ where: { id: data.contactId, userId, companyId: lead.companyId } }) : null;
  if (data.contactId && !contact) throw notFound('Contact');

  const followUp = await prisma.$transaction(async (tx) => {
    const f = await tx.followUp.create({
      data: { userId, leadId: lead.id, contactId: contact?.id, kind: data.kind, title: data.title, notes: data.notes || null, dueAt: data.dueAt },
    });
    if (data.moveStage) {
      const stage = data.kind === 'MEETING' ? 'MEETING_SCHEDULED' : 'FOLLOW_UP';
      if (lead.stage !== stage && !['WON', 'LOST', 'NEGOTIATION'].includes(lead.stage)) {
        await tx.lead.update({ where: { id: lead.id }, data: { stage } });
      }
    }
    await logActivity(
      { userId, leadId: lead.id, companyId: lead.companyId, contactId: contact?.id, type: ActivityType.FOLLOW_UP_SCHEDULED, title: `${data.kind === 'MEETING' ? 'Meeting' : 'Follow-up'} scheduled: ${data.title}`, details: data.dueAt.toISOString() },
      tx
    );
    return f;
  });

  // Calendar is optional and only on explicit request. A failure here does not undo the follow-up.
  let calendarError: string | null = null;
  if (data.addToCalendar) {
    try {
      await addCalendarEvent(userId, followUp.id, data.durationMinutes || 30);
    } catch (err) {
      calendarError = (err as Error).message;
    }
  }
  const fresh = await prisma.followUp.findUniqueOrThrow({ where: { id: followUp.id }, include: { calendarEvent: true } });
  return { followUp: fresh, calendarError };
}

export async function addCalendarEvent(userId: string, followUpId: string, durationMinutes = 30) {
  const f = await prisma.followUp.findFirst({
    where: { id: followUpId, userId },
    include: { lead: { include: { company: true } }, contact: true, calendarEvent: true },
  });
  if (!f) throw notFound('Follow-up');
  if (f.calendarEvent) throw new AppError('CONFLICT', 'This follow-up is already on your calendar.');
  const start = f.dueAt;
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const summary = `${f.kind === 'MEETING' ? 'Meeting' : f.kind === 'CALL' ? 'Call' : 'Follow up'}: ${f.lead.company.name}${f.contact ? ` (${f.contact.fullName})` : ''}`;
  const description = [f.title, f.notes, 'Created by ChaseHorse Outreach'].filter(Boolean).join('\n\n');
  const ev = await createCalendarEvent(userId, { summary, description, start, end });
  const record = await prisma.calendarEvent.create({
    data: { userId, followUpId: f.id, leadId: f.leadId, googleEventId: ev.id, htmlLink: ev.htmlLink, summary, startAt: start, endAt: end },
  });
  await logActivity({ userId, leadId: f.leadId, companyId: f.lead.companyId, type: ActivityType.CALENDAR_EVENT, title: 'Added to Google Calendar', details: summary });
  return record;
}

export async function setFollowUpStatus(userId: string, id: string, status: 'COMPLETED' | 'CANCELLED' | 'PENDING') {
  const f = await prisma.followUp.findFirst({ where: { id, userId }, include: { lead: true } });
  if (!f) throw notFound('Follow-up');
  const updated = await prisma.followUp.update({ where: { id }, data: { status, completedAt: status === 'COMPLETED' ? new Date() : null } });
  if (status === 'COMPLETED') {
    await logActivity({ userId, leadId: f.leadId, companyId: f.lead.companyId, type: ActivityType.FOLLOW_UP_COMPLETED, title: `Completed: ${f.title}` });
  }
  return updated;
}

export async function rescheduleFollowUp(userId: string, id: string, dueAt: Date, notes?: string | null) {
  const f = await prisma.followUp.findFirst({ where: { id, userId } });
  if (!f) throw notFound('Follow-up');
  return prisma.followUp.update({ where: { id }, data: { dueAt, ...(notes !== undefined ? { notes } : {}) } });
}

export function dayBounds(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function listFollowUps(userId: string, scope: 'overdue' | 'today' | 'upcoming' | 'completed' | 'all') {
  const { start, end } = dayBounds();
  const where =
    scope === 'overdue'
      ? { status: 'PENDING' as const, dueAt: { lt: start } }
      : scope === 'today'
        ? { status: 'PENDING' as const, dueAt: { gte: start, lt: end } }
        : scope === 'upcoming'
          ? { status: 'PENDING' as const, dueAt: { gte: end } }
          : scope === 'completed'
            ? { status: 'COMPLETED' as const }
            : {};
  return prisma.followUp.findMany({
    where: { userId, ...where },
    orderBy: { dueAt: scope === 'completed' ? 'desc' : 'asc' },
    take: 200,
    include: {
      lead: { select: { id: true, stage: true, company: { select: { id: true, name: true, domain: true } } } },
      contact: { select: { id: true, fullName: true, email: true } },
      calendarEvent: { select: { htmlLink: true } },
    },
  });
}
