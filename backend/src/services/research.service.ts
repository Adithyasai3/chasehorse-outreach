import type { Company, Prisma } from '@prisma/client';
import { generate, generateJson, type GroundingSource } from '../integrations/gemini.client';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { ActivityType, logActivity } from './activity.service';
import { getOwnedCompany } from './companies.service';
import { getSettings } from './settings.service';

/*
 * Research output keeps four kinds of information strictly apart:
 *  - facts:     structured fields from the data provider (Enricho) or entered by the user. Built
 *               deterministically from the database, never written by the AI.
 *  - findings:  statements from Google Search grounding, each tied to the source URLs Google
 *               attributed to it. Statements without a source are discarded.
 *  - analysis:  AI-generated interpretation. Each point lists the facts/findings it relies on.
 *  - unknowns:  what could not be determined.
 */

export interface ResearchFact {
  key: string;
  label: string;
  value: string;
  origin: 'ENRICHO' | 'USER';
}
export interface ResearchFinding {
  id: string;
  statement: string;
  sourceIndexes: number[];
}
export interface AnalysisPoint {
  text: string;
  evidence: string[]; // fact keys or finding ids
}
export interface ResearchContent {
  facts: ResearchFact[];
  findings: ResearchFinding[];
  analysis: {
    overview: AnalysisPoint;
    productsAndServices: AnalysisPoint[];
    businessModel: AnalysisPoint | null;
    growthIndicators: AnalysisPoint[];
    logisticsRequirements: AnalysisPoint[];
    supplyChainChallenges: AnalysisPoint[];
    opportunities: AnalysisPoint[];
    outreachAngle: AnalysisPoint;
  };
  unknowns: string[];
  searchQueries: string[];
}

function money(n: bigint | null) {
  if (n === null) return null;
  const v = Number(n);
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
}

export function buildFacts(c: Company): ResearchFact[] {
  const origin: ResearchFact['origin'] = c.source === 'ENRICHO' ? 'ENRICHO' : 'USER';
  const rows: [string, string, string | null | undefined][] = [
    ['name', 'Company name', c.name],
    ['domain', 'Domain', c.domain],
    ['industry', 'Industry', [c.industry, ...c.industries.filter((i) => i !== c.industry)].filter(Boolean).join(', ') || null],
    ['categories', 'Business categories', c.categories.join(', ') || null],
    ['description', 'Description', c.description],
    ['employees', 'Employees', c.employeeRange],
    ['revenue', 'Revenue range', c.revenueRange],
    ['founded', 'Founded', c.foundedYear ? String(c.foundedYear) : null],
    ['type', 'Company type', c.companyType],
    ['location', 'Headquarters', [c.city, c.state, c.country].filter(Boolean).join(', ') || null],
    ['funding', 'Total funding', money(c.totalFunding)],
    ['fundingStage', 'Latest funding stage', c.fundingStage],
    ['fundingDate', 'Latest funding date', c.fundingDate ? c.fundingDate.toISOString().slice(0, 10) : null],
    ['keywords', 'Keywords', c.keywords.slice(0, 15).join(', ') || null],
    ['technologies', 'Technologies', c.technologies.slice(0, 15).join(', ') || null],
  ];
  return rows.filter(([, , v]) => v).map(([key, label, value]) => ({ key, label, value: value as string, origin }));
}

const pointSchema = {
  type: 'object',
  properties: { text: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } } },
  required: ['text', 'evidence'],
};

const analysisSchema = {
  type: 'object',
  properties: {
    overview: pointSchema,
    productsAndServices: { type: 'array', items: pointSchema },
    businessModel: { ...pointSchema, nullable: true },
    growthIndicators: { type: 'array', items: pointSchema },
    logisticsRequirements: { type: 'array', items: pointSchema },
    supplyChainChallenges: { type: 'array', items: pointSchema },
    opportunities: { type: 'array', items: pointSchema },
    outreachAngle: pointSchema,
    unknowns: { type: 'array', items: { type: 'string' } },
  },
  required: ['overview', 'productsAndServices', 'growthIndicators', 'logisticsRequirements', 'supplyChainChallenges', 'opportunities', 'outreachAngle', 'unknowns'],
};

async function groundedFindings(userId: string, model: string, c: Company) {
  const prompt = `Research the company "${c.name}"${c.domain ? ` (website: ${c.domain})` : ''}${c.country ? `, based in ${c.country}` : ''}.
Report concrete, verifiable facts only, as short separate sentences, about:
- what it sells (products/services) and to whom
- where it operates: plants, warehouses, stores, cities, countries served
- how it distributes or ships goods (own fleet, 3PL partners, marketplaces, exports)
- recent developments in the last 24 months: funding, expansion, new facilities, hiring, partnerships
Do not speculate. If you cannot find something, say nothing about it. Make sure you are describing this exact company and not a similarly named one.`;
  const res = await generate({ userId, model, operation: 'RESEARCH_GROUNDED', prompt, grounded: true, temperature: 0.1 });
  const findings: ResearchFinding[] = [];
  const seen = new Set<string>();
  for (const s of res.supports) {
    const statement = s.text.replace(/^[-*•\s]+/, '').trim();
    if (statement.length < 25 || seen.has(statement)) continue;
    seen.add(statement);
    findings.push({ id: `F${findings.length + 1}`, statement, sourceIndexes: s.sourceIndexes });
    if (findings.length >= 25) break;
  }
  return { findings, sources: res.sources, searchQueries: res.searchQueries };
}

function cleanPoint(p: AnalysisPoint | null | undefined, validRefs: Set<string>): AnalysisPoint | null {
  if (!p || typeof p.text !== 'string' || !p.text.trim()) return null;
  return { text: p.text.trim(), evidence: (p.evidence || []).filter((e) => validRefs.has(e)) };
}

export async function runResearch(userId: string, companyId: string) {
  const company = await getOwnedCompany(userId, companyId);
  const settings = await getSettings(userId);
  const services = await prisma.service.findMany({ where: { userId, isActive: true } });
  const lead = await prisma.lead.findUnique({ where: { userId_companyId: { userId, companyId } } });
  const model = settings.geminiModel;

  if (lead && lead.stage === 'NEW_LEAD') {
    await prisma.lead.update({ where: { id: lead.id }, data: { stage: 'RESEARCHING' } });
  }

  try {
    const facts = buildFacts(company);
    let findings: ResearchFinding[] = [];
    let sources: GroundingSource[] = [];
    let searchQueries: string[] = [];
    let grounded = false;
    if (settings.useSearchGrounding) {
      try {
        const g = await groundedFindings(userId, model, company);
        findings = g.findings;
        sources = g.sources;
        searchQueries = g.searchQueries;
        grounded = true;
      } catch (err) {
        // Grounding can be unavailable for some keys/models; continue with provider data only.
        if (err instanceof AppError && (err.code === 'PROVIDER_AUTH' || err.code === 'NOT_CONFIGURED')) throw err;
        logger.warn('Grounded research unavailable, continuing without web findings', { error: err as Error });
      }
    }

    const factLines = facts.map((f) => `[${f.key}] ${f.label}: ${f.value}`).join('\n') || '(no structured data)';
    const findingLines = findings.map((f) => `[${f.id}] ${f.statement}`).join('\n') || '(none)';
    const offer = [
      `Seller: ${settings.businessName}`,
      settings.businessDescription && `What the seller does: ${settings.businessDescription}`,
      settings.valueProposition && `Value proposition: ${settings.valueProposition}`,
      settings.idealCustomerProfile && `Ideal customer profile: ${settings.idealCustomerProfile}`,
      services.length ? `Services:\n${services.map((s) => `- ${s.name}: ${s.description}`).join('\n')}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = `You are a B2B research analyst helping a logistics and supply-chain services company assess a prospect.

SELLER CONTEXT
${offer}

PROSPECT FACTS (from data provider; reference by [key])
${factLines}

WEB FINDINGS WITH SOURCES (reference by [F#])
${findingLines}

Write an analysis of "${company.name}". Rules:
- Base every point on the facts and findings above. Put the keys/ids you relied on in "evidence".
- Analysis is your interpretation. Phrase inferences as such ("likely", "may") and never state them as facts.
- Do not invent numbers, customers, locations, partners or events that are not in the input.
- logisticsRequirements and supplyChainChallenges should be specific to this business, not generic.
- opportunities: where the seller could realistically help. If the fit looks weak, say so plainly.
- If the input is too thin for a section, return an empty array for it and add what is missing to "unknowns".
- overview: 2-3 sentences. outreachAngle: one specific angle for a first email.`;

    const analysis = await generateJson<{
      overview: AnalysisPoint;
      productsAndServices: AnalysisPoint[];
      businessModel?: AnalysisPoint | null;
      growthIndicators: AnalysisPoint[];
      logisticsRequirements: AnalysisPoint[];
      supplyChainChallenges: AnalysisPoint[];
      opportunities: AnalysisPoint[];
      outreachAngle: AnalysisPoint;
      unknowns: string[];
    }>({ userId, model, operation: 'RESEARCH_ANALYSIS', prompt, jsonSchema: analysisSchema, temperature: 0.3 });

    const refs = new Set<string>([...facts.map((f) => f.key), ...findings.map((f) => f.id)]);
    const list = (xs: AnalysisPoint[] | undefined) => (xs || []).map((p) => cleanPoint(p, refs)).filter((p): p is AnalysisPoint => Boolean(p)).slice(0, 8);
    const content: ResearchContent = {
      facts,
      findings,
      analysis: {
        overview: cleanPoint(analysis.overview, refs) || { text: 'Not enough information for an overview.', evidence: [] },
        productsAndServices: list(analysis.productsAndServices),
        businessModel: cleanPoint(analysis.businessModel, refs),
        growthIndicators: list(analysis.growthIndicators),
        logisticsRequirements: list(analysis.logisticsRequirements),
        supplyChainChallenges: list(analysis.supplyChainChallenges),
        opportunities: list(analysis.opportunities),
        outreachAngle: cleanPoint(analysis.outreachAngle, refs) || { text: 'No clear outreach angle from the available data.', evidence: [] },
      },
      unknowns: (analysis.unknowns || []).filter((u) => typeof u === 'string' && u.trim()).slice(0, 12),
      searchQueries,
    };

    const research = await prisma.$transaction(async (tx) => {
      const r = await tx.companyResearch.create({
        data: {
          userId,
          companyId,
          status: 'COMPLETED',
          model,
          grounded,
          content: content as unknown as Prisma.InputJsonValue,
          sources: sources as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.company.update({ where: { id: companyId }, data: { lastResearchedAt: new Date() } });
      await logActivity(
        {
          userId,
          leadId: lead?.id,
          companyId,
          type: ActivityType.RESEARCH_COMPLETED,
          title: 'Research completed',
          details: `${findings.length} sourced findings, ${sources.length} sources${grounded ? '' : ' (web search off or unavailable)'}`,
        },
        tx
      );
      return r;
    });
    return research;
  } catch (err) {
    const message = (err as Error).message;
    await prisma.companyResearch.create({ data: { userId, companyId, status: 'FAILED', model, errorMessage: message.slice(0, 500) } });
    await logActivity({ userId, leadId: lead?.id, companyId, type: ActivityType.RESEARCH_FAILED, title: 'Research failed', details: message.slice(0, 300) });
    throw err;
  }
}

export async function latestResearch(userId: string, companyId: string) {
  return prisma.companyResearch.findFirst({ where: { userId, companyId, status: 'COMPLETED' }, orderBy: { createdAt: 'desc' } });
}

export async function researchHistory(userId: string, companyId: string) {
  return prisma.companyResearch.findMany({
    where: { userId, companyId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, model: true, grounded: true, errorMessage: true, createdAt: true },
  });
}
