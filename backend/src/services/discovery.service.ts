import type { Prisma } from '@prisma/client';
import type { CompanySearchFilters } from '../integrations/enricho/args';
import * as enricho from '../integrations/enricho/enricho.service';
import type { NormalizedCompany } from '../integrations/enricho/normalize';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { cacheGet, cacheSet } from '../lib/redis';
import { ActivityType, logActivity } from './activity.service';
import { getOwnedCompany, upsertProviderCompany } from './companies.service';

/*
 * Enricho search flow:
 *   1. preview (free, up to 3 sample records, no exact totals)
 *   2. full search (5 credits per new record, `limit` per page)
 *   3. next page: Enricho's next_page.arguments passed back unchanged
 * Results of a run are cached server-side so "save" uses the provider's data, not the browser's.
 */

const RUN_TTL_SECONDS = 60 * 60 * 6;
const runKey = (userId: string, runId: string) => `discovery:${userId}:${runId}`;

interface CachedRun {
  companies: NormalizedCompany[];
  nextPage: Record<string, unknown> | null;
  preview: boolean;
  toolName: string;
}

async function annotate(userId: string, companies: NormalizedCompany[], offset = 0) {
  const domains = companies.map((c) => c.domain).filter((d): d is string => Boolean(d));
  const providerIds = companies.map((c) => c.providerId).filter((d): d is string => Boolean(d));
  const existing = await prisma.company.findMany({
    where: { userId, OR: [{ domain: { in: domains } }, { providerId: { in: providerIds } }] },
    select: { id: true, domain: true, providerId: true, lastResearchedAt: true },
  });
  return companies.map((c, i) => {
    const match = existing.find((e) => (c.providerId && e.providerId === c.providerId) || (c.domain && e.domain === c.domain));
    return { ...c, resultIndex: offset + i, existingCompanyId: match?.id ?? null, lastResearchedAt: match?.lastResearchedAt ?? null };
  });
}

function dedupe(companies: NormalizedCompany[], already: NormalizedCompany[] = []) {
  const seen = new Set(already.map((c) => c.providerId || c.domain || c.name.toLowerCase()));
  return companies.filter((c) => {
    const key = c.providerId || c.domain || c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function runCompanySearch(userId: string, filters: CompanySearchFilters) {
  const run = await prisma.searchRun.create({
    data: { userId, kind: filters.preview ? 'COMPANY_PREVIEW' : 'COMPANY', filters: filters as Prisma.InputJsonValue, transport: 'MCP', status: 'RUNNING' },
  });
  try {
    const result = await enricho.searchCompanies(userId, filters);
    const companies = dedupe(result.records);
    await cacheSet(runKey(userId, run.id), { companies, nextPage: result.nextPage, preview: result.preview, toolName: result.toolName } satisfies CachedRun, RUN_TTL_SECONDS);
    await prisma.searchRun.update({
      where: { id: run.id },
      data: { status: 'COMPLETED', toolName: result.toolName, resultCount: companies.length, totalAvailable: result.totalItems },
    });
    return {
      runId: run.id,
      toolName: result.toolName,
      preview: result.preview,
      totalItems: result.totalItems,
      hasMore: result.hasMore,
      creditsUsed: result.creditsUsed,
      canLoadMore: Boolean(result.nextPage),
      applied: result.applied,
      notApplied: result.notApplied,
      rawText: result.rawText,
      companies: await annotate(userId, companies),
    };
  } catch (err) {
    await prisma.searchRun.update({ where: { id: run.id }, data: { status: 'FAILED', error: (err as Error).message.slice(0, 500) } });
    throw err;
  }
}

/** Fetches the next full page for a run (costs credits) and appends it to the cached run. */
export async function loadNextPage(userId: string, runId: string) {
  const run = await prisma.searchRun.findFirst({ where: { id: runId, userId } });
  if (!run) throw new AppError('NOT_FOUND', 'Search run not found.');
  const cached = await cacheGet<CachedRun>(runKey(userId, runId));
  if (!cached) throw new AppError('VALIDATION', 'These search results have expired. Run the search again.');
  if (!cached.nextPage) throw new AppError('VALIDATION', 'There are no more results for this search.');
  const result = await enricho.searchCompanies(userId, {}, cached.nextPage);
  const fresh = dedupe(result.records, cached.companies);
  const offset = cached.companies.length;
  const next: CachedRun = { ...cached, companies: [...cached.companies, ...fresh], nextPage: result.nextPage };
  await cacheSet(runKey(userId, runId), next, RUN_TTL_SECONDS);
  await prisma.searchRun.update({ where: { id: runId }, data: { resultCount: next.companies.length } });
  return { runId, creditsUsed: result.creditsUsed, canLoadMore: Boolean(result.nextPage), companies: await annotate(userId, fresh, offset) };
}

export async function saveFromRun(userId: string, runId: string, resultIndexes: number[]) {
  const run = await prisma.searchRun.findFirst({ where: { id: runId, userId } });
  if (!run) throw new AppError('NOT_FOUND', 'Search run not found.');
  const cached = await cacheGet<CachedRun>(runKey(userId, runId));
  if (!cached) throw new AppError('VALIDATION', 'These search results have expired. Run the search again to save companies.');
  const picked = [...new Set(resultIndexes)].map((i) => cached.companies[i]).filter(Boolean);
  if (!picked.length) throw new AppError('VALIDATION', 'Select at least one company to save.');

  const saved = [];
  for (const c of picked) {
    const { company, lead, created } = await upsertProviderCompany(userId, c, `Discovered via Enricho ${cached.toolName}${cached.preview ? ' (free preview)' : ''}`);
    saved.push({ companyId: company.id, leadId: lead.id, name: company.name, created });
  }
  return { saved, createdCount: saved.filter((s) => s.created).length, updatedCount: saved.filter((s) => !s.created).length };
}

/** Re-fetches a saved company's full record from Enricho by domain (5 credits if new to you). */
export async function refreshCompanyFromProvider(userId: string, companyId: string) {
  const company = await getOwnedCompany(userId, companyId);
  if (!company.domain) throw new AppError('VALIDATION', 'This company has no domain, so it cannot be looked up.');
  const { toolName, company: fresh } = await enricho.enrichCompany(userId, company.domain);
  if (!fresh) throw new AppError('NOT_FOUND', `Enricho has no record for ${company.domain}. Nothing was charged.`, { provider: 'ENRICHO' });
  const { company: updated, lead } = await upsertProviderCompany(userId, { ...fresh, domain: fresh.domain || company.domain });
  await logActivity({ userId, leadId: lead.id, companyId, type: ActivityType.ENRICHED, title: 'Company data refreshed from Enricho', details: `Tool: ${toolName}` });
  return updated;
}

export async function listRuns(userId: string) {
  return prisma.searchRun.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 25 });
}
