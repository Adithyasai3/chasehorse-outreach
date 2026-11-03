import type { Prisma } from '@prisma/client';
import * as enricho from '../integrations/enricho/enricho.service';
import type { NormalizedPerson } from '../integrations/enricho/normalize';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { cacheGet, cacheSet } from '../lib/redis';
import { ActivityType, logActivity } from './activity.service';
import { getOwnedCompany } from './companies.service';

/*
 * Enricho person_search: preview is free (≤3 people, no contact details);
 * full records cost 5 credits each and include email/phone when Enricho has them.
 */

const RUN_TTL_SECONDS = 60 * 60 * 6;
const runKey = (userId: string, runId: string) => `people:${userId}:${runId}`;

interface CachedPeopleRun {
  companyId: string;
  people: NormalizedPerson[];
  preview: boolean;
  nextPage: Record<string, unknown> | null;
}

export interface PeopleSearchParams {
  companyId: string;
  titles?: string[];
  seniority?: string[];
  roles?: string[];
  hasEmail?: boolean;
  preview: boolean;
  limit?: number;
}

async function annotate(userId: string, people: NormalizedPerson[], offset = 0) {
  const existing = await prisma.contact.findMany({
    where: { userId, providerId: { in: people.map((x) => x.providerId) } },
    select: { id: true, providerId: true },
  });
  return people.map((person, i) => ({ ...person, resultIndex: offset + i, existingContactId: existing.find((e) => e.providerId === person.providerId)?.id ?? null }));
}

export async function searchPeopleAtCompany(userId: string, p: PeopleSearchParams) {
  const company = await getOwnedCompany(userId, p.companyId);
  if (!company.domain && !company.providerId) throw new AppError('VALIDATION', 'People search needs the company domain. Edit the company to add one.');
  const run = await prisma.searchRun.create({
    data: { userId, kind: p.preview ? 'PEOPLE_PREVIEW' : 'PEOPLE', filters: { ...p, domain: company.domain } as Prisma.InputJsonValue, transport: 'MCP', status: 'RUNNING' },
  });
  try {
    const res = await enricho.searchPeople(userId, {
      companyDomains: company.domain ? [company.domain] : undefined,
      companyIds: !company.domain && company.providerId ? [company.providerId] : undefined,
      jobTitles: p.titles,
      seniority: p.seniority,
      roles: p.roles,
      hasEmail: p.hasEmail,
      preview: p.preview,
      limit: p.limit,
    });
    await cacheSet(runKey(userId, run.id), { companyId: company.id, people: res.records, preview: res.preview, nextPage: res.nextPage } satisfies CachedPeopleRun, RUN_TTL_SECONDS);
    await prisma.searchRun.update({ where: { id: run.id }, data: { status: 'COMPLETED', resultCount: res.records.length, totalAvailable: res.totalItems, toolName: res.toolName } });
    return {
      runId: run.id,
      toolName: res.toolName,
      preview: res.preview,
      totalItems: res.totalItems,
      hasMore: res.hasMore,
      creditsUsed: res.creditsUsed,
      canLoadMore: Boolean(res.nextPage),
      applied: res.applied,
      notApplied: res.notApplied,
      people: await annotate(userId, res.records),
    };
  } catch (err) {
    await prisma.searchRun.update({ where: { id: run.id }, data: { status: 'FAILED', error: (err as Error).message.slice(0, 500) } });
    throw err;
  }
}

export async function loadNextPeoplePage(userId: string, runId: string) {
  const cached = await cacheGet<CachedPeopleRun>(runKey(userId, runId));
  if (!cached) throw new AppError('VALIDATION', 'These people results have expired. Run the search again.');
  if (!cached.nextPage) throw new AppError('VALIDATION', 'There are no more people for this search.');
  const res = await enricho.searchPeople(userId, {}, cached.nextPage);
  const offset = cached.people.length;
  await cacheSet(runKey(userId, runId), { ...cached, people: [...cached.people, ...res.records], nextPage: res.nextPage }, RUN_TTL_SECONDS);
  return { runId, creditsUsed: res.creditsUsed, canLoadMore: Boolean(res.nextPage), people: await annotate(userId, res.records, offset) };
}

function contactFields(p: NormalizedPerson) {
  return {
    fullName: p.fullName,
    firstName: p.firstName,
    lastName: p.lastName,
    title: p.title,
    seniority: p.seniority,
    department: p.department,
    linkedinUrl: p.linkedinUrl,
    location: p.location,
    lastEnrichedAt: new Date(),
  };
}

export async function savePeopleFromRun(userId: string, runId: string, resultIndexes: number[]) {
  const cached = await cacheGet<CachedPeopleRun>(runKey(userId, runId));
  if (!cached) throw new AppError('VALIDATION', 'These people results have expired. Run the search again.');
  const company = await getOwnedCompany(userId, cached.companyId);
  const lead = await prisma.lead.findUnique({ where: { userId_companyId: { userId, companyId: company.id } } });
  const picked = [...new Set(resultIndexes)].map((i) => cached.people[i]).filter(Boolean);
  if (!picked.length) throw new AppError('VALIDATION', 'Select at least one person to save.');

  const saved = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const p of picked) {
      const data: Prisma.ContactUncheckedUpdateInput = { ...contactFields(p) };
      // Contact details only exist on full records. Store exactly what Enricho returned.
      if (p.email) {
        const clash = await tx.contact.findFirst({ where: { companyId: company.id, email: p.email.toLowerCase(), NOT: { providerId: p.providerId } } });
        if (!clash) Object.assign(data, { email: p.email.toLowerCase(), emailStatus: 'PROVIDER_FOUND', emailCertainty: p.emailType });
      }
      if (p.phone) data.phone = p.phone;
      const existing = await tx.contact.findUnique({ where: { userId_providerId: { userId, providerId: p.providerId } } });
      const contact = existing
        ? await tx.contact.update({ where: { id: existing.id }, data })
        : await tx.contact.create({
            data: { ...(data as Prisma.ContactUncheckedCreateInput), ...contactFields(p), userId, companyId: company.id, providerId: p.providerId, source: 'ENRICHO' },
          });
      if (!existing) {
        await logActivity(
          { userId, leadId: lead?.id, companyId: company.id, contactId: contact.id, type: ActivityType.CONTACT_ADDED, title: `Contact added: ${contact.fullName}`, details: contact.title },
          tx
        );
      }
      out.push(contact);
    }
    if (lead && !lead.primaryContactId && out[0]) await tx.lead.update({ where: { id: lead.id }, data: { primaryContactId: out[0].id } });
    return out;
  });
  return { saved };
}

/**
 * Fetches the full Enricho record for a saved contact (5 credits if new to your account).
 * Stores email/phone exactly as returned, labelled with Enricho's email_type. Never marked "verified".
 */
export async function findEmailForContact(userId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } });
  if (!contact) throw notFound('Contact');
  if (!contact.providerId) throw new AppError('VALIDATION', 'Contact details can only be fetched for people found through Enricho.');
  const person = await enricho.enrichPerson(userId, contact.providerId);
  if (!person) return { status: 'not-found' as const, contact, message: 'Enricho returned no record for this person. Nothing was charged.' };
  const data: Prisma.ContactUpdateInput = { ...contactFields(person) };
  if (person.phone) data.phone = person.phone;
  if (person.email) {
    const email = person.email.toLowerCase();
    const clash = await prisma.contact.findFirst({ where: { companyId: contact.companyId, email, NOT: { id: contact.id } } });
    if (clash) throw new AppError('CONFLICT', `${email} already belongs to ${clash.fullName}.`);
    Object.assign(data, { email, emailStatus: 'PROVIDER_FOUND', emailCertainty: person.emailType });
  }
  const updated = await prisma.contact.update({ where: { id: contact.id }, data });
  const lead = await prisma.lead.findUnique({ where: { userId_companyId: { userId, companyId: contact.companyId } } });
  if (person.email) {
    await logActivity({
      userId,
      leadId: lead?.id,
      companyId: contact.companyId,
      contactId: contact.id,
      type: ActivityType.EMAIL_FOUND,
      title: `Contact details found for ${contact.fullName}`,
      details: person.emailType ? `Enricho email type: ${person.emailType}` : 'From Enricho',
    });
  }
  return person.email
    ? { status: 'found' as const, contact: updated }
    : { status: 'not-found' as const, contact: updated, message: 'Enricho has no email on file for this person.' };
}

export async function createManualContact(
  userId: string,
  data: { companyId: string; fullName: string; title?: string | null; email?: string | null; phone?: string | null; linkedinUrl?: string | null }
) {
  const company = await getOwnedCompany(userId, data.companyId);
  const email = data.email?.trim().toLowerCase() || null;
  if (email) {
    const dup = await prisma.contact.findFirst({ where: { companyId: company.id, email } });
    if (dup) throw new AppError('CONFLICT', `${email} is already saved for ${dup.fullName}.`);
  }
  const [firstName, ...rest] = data.fullName.trim().split(/\s+/);
  const contact = await prisma.contact.create({
    data: {
      userId,
      companyId: company.id,
      fullName: data.fullName.trim(),
      firstName: firstName || null,
      lastName: rest.join(' ') || null,
      title: data.title || null,
      email,
      emailStatus: email ? 'UNVERIFIED' : 'NONE',
      phone: data.phone || null,
      linkedinUrl: data.linkedinUrl || null,
      source: 'MANUAL',
    },
  });
  const lead = await prisma.lead.findUnique({ where: { userId_companyId: { userId, companyId: company.id } } });
  if (lead && !lead.primaryContactId) await prisma.lead.update({ where: { id: lead.id }, data: { primaryContactId: contact.id } });
  await logActivity({ userId, leadId: lead?.id, companyId: company.id, contactId: contact.id, type: ActivityType.CONTACT_ADDED, title: `Contact added: ${contact.fullName}`, details: 'Entered manually' });
  return contact;
}

export async function updateContact(
  userId: string,
  id: string,
  data: { fullName?: string; title?: string | null; email?: string | null; phone?: string | null; linkedinUrl?: string | null }
) {
  const contact = await prisma.contact.findFirst({ where: { id, userId } });
  if (!contact) throw notFound('Contact');
  const patch: Prisma.ContactUpdateInput = { ...data };
  if (data.email !== undefined) {
    const email = data.email?.trim().toLowerCase() || null;
    patch.email = email;
    // A user-edited email is no longer the provider's result.
    if (email !== contact.email) {
      patch.emailStatus = email ? 'UNVERIFIED' : 'NONE';
      patch.emailCertainty = null;
    }
  }
  return prisma.contact.update({ where: { id }, data: patch });
}
