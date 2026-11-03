import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient | PrismaClient;

export const ActivityType = {
  LEAD_CREATED: 'LEAD_CREATED',
  STAGE_CHANGED: 'STAGE_CHANGED',
  RESEARCH_COMPLETED: 'RESEARCH_COMPLETED',
  RESEARCH_FAILED: 'RESEARCH_FAILED',
  SCORED: 'SCORED',
  SCORE_OVERRIDDEN: 'SCORE_OVERRIDDEN',
  CONTACT_ADDED: 'CONTACT_ADDED',
  EMAIL_FOUND: 'EMAIL_FOUND',
  DRAFT_CREATED: 'DRAFT_CREATED',
  DRAFT_APPROVED: 'DRAFT_APPROVED',
  EMAIL_SENT: 'EMAIL_SENT',
  EMAIL_FAILED: 'EMAIL_FAILED',
  REPLY_RECEIVED: 'REPLY_RECEIVED',
  NOTE_ADDED: 'NOTE_ADDED',
  TASK_ADDED: 'TASK_ADDED',
  FOLLOW_UP_SCHEDULED: 'FOLLOW_UP_SCHEDULED',
  FOLLOW_UP_COMPLETED: 'FOLLOW_UP_COMPLETED',
  CALENDAR_EVENT: 'CALENDAR_EVENT',
  ENRICHED: 'ENRICHED',
  LEAD_UPDATED: 'LEAD_UPDATED',
} as const;

export async function logActivity(
  data: {
    userId: string;
    type: string;
    title: string;
    leadId?: string | null;
    companyId?: string | null;
    contactId?: string | null;
    details?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
  tx: Tx = prisma
) {
  return tx.leadActivity.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      leadId: data.leadId ?? null,
      companyId: data.companyId ?? null,
      contactId: data.contactId ?? null,
      details: data.details ?? null,
      metadata: data.metadata,
    },
  });
}
