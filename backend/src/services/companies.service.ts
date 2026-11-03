import { Prisma } from '@prisma/client';
import type { NormalizedCompany } from '../integrations/enricho/normalize';
import { normalizeDomain } from '../integrations/enricho/normalize';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { ActivityType, logActivity } from './activity.service';

type Tx = Prisma.TransactionClient;

function providerFields(c: NormalizedCompany) {
  return {
    name: c.name,
    domain: c.domain,
    website: c.website,
    logoUrl: c.logoUrl,
    industry: c.industry,
    industries: c.industries,
    categories: c.categories,
    description: c.description,
    employeeRange: c.employeeRange,
    revenueRange: c.revenueRange,
    foundedYear: c.foundedYear,
    companyType: c.companyType,
    country: c.country,
    countryCode: c.countryCode,
    state: c.state,
    city: c.city,
    address: c.address,
    phone: c.phone,
    linkedinUrl: c.linkedinUrl,
    totalFunding: c.totalFunding !== null ? BigInt(Math.round(c.totalFunding)) : null,
    fundingStage: c.fundingStage,
    fundingDate: c.fundingDate ? new Date(c.fundingDate) : null,
    fundingRounds: c.fundingRounds.length ? (c.fundingRounds as Prisma.InputJsonValue) : Prisma.DbNull,
    keywords: c.keywords,
    technologies: c.technologies,
    providerId: c.providerId,
    providerUpdatedAt: c.providerUpdatedAt ? new Date(c.providerUpdatedAt) : null,
    lastEnrichedAt: new Date(),
  };
}

/** Finds an existing company for this user by provider id, then by domain. */
export async function findDuplicate(userId: string, c: { providerId?: string | null; domain?: string | null }, tx: Tx | typeof prisma = prisma) {
  if (c.providerId) {
    const byProvider = await tx.company.findUnique({ where: { userId_providerId: { userId, providerId: c.providerId } } });
    if (byProvider) return byProvider;
  }
  if (c.domain) {
    return tx.company.findUnique({ where: { userId_domain: { userId, domain: c.domain } } });
  }
  return null;
}

/**
 * Saves provider data as a company and ensures it has a lead. Existing records are
 * refreshed in place (no duplicates). Runs in a transaction.
 */
export async function upsertProviderCompany(userId: string, c: NormalizedCompany, sourceNote?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await findDuplicate(userId, c, tx);
    const company = existing
      ? await tx.company.update({ where: { id: existing.id }, data: { ...providerFields(c), source: 'ENRICHO' } })
      : await tx.company.create({ data: { userId, source: 'ENRICHO', ...providerFields(c) } });
    const lead = await ensureLead(userId, company.id, tx, sourceNote);
    return { company, lead, created: !existing };
  });
}

export async function ensureLead(userId: string, companyId: string, tx: Tx | typeof prisma = prisma, note?: string) {
  const existing = await tx.lead.findUnique({ where: { userId_companyId: { userId, companyId } } });
  if (existing) return existing;
  const last = await tx.lead.findFirst({ where: { userId, stage: 'NEW_LEAD' }, orderBy: { position: 'desc' }, select: { position: true } });
  const lead = await tx.lead.create({ data: { userId, companyId, stage: 'NEW_LEAD', position: (last?.position ?? -1) + 1 } });
  await logActivity({ userId, leadId: lead.id, companyId, type: ActivityType.LEAD_CREATED, title: 'Lead created', details: note }, tx);
  return lead;
}

export async function createManualCompany(
  userId: string,
  data: { name: string; domain?: string | null; website?: string | null; industry?: string | null; description?: string | null; city?: string | null; country?: string | null; employeeRange?: string | null }
) {
  const domain = normalizeDomain(data.domain || data.website || null);
  if (domain) {
    const dup = await findDuplicate(userId, { domain });
    if (dup) throw new AppError('CONFLICT', `${dup.name} (${domain}) is already saved.`, { details: { companyId: dup.id } });
  }
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        userId,
        source: 'MANUAL',
        name: data.name,
        domain,
        website: data.website || (domain ? `https://${domain}` : null),
        industry: data.industry || null,
        description: data.description || null,
        city: data.city || null,
        country: data.country || null,
        employeeRange: data.employeeRange || null,
      },
    });
    const lead = await ensureLead(userId, company.id, tx, 'Added manually');
    return { company, lead };
  });
}

export async function getOwnedCompany(userId: string, id: string) {
  const company = await prisma.company.findFirst({ where: { id, userId } });
  if (!company) throw notFound('Company');
  return company;
}

/** Serializes BigInt for JSON responses. */
export function serializeCompany<T extends { totalFunding?: bigint | null }>(c: T) {
  return { ...c, totalFunding: c.totalFunding !== null && c.totalFunding !== undefined ? Number(c.totalFunding) : null };
}
