import type { Prisma, QualificationStatus } from '@prisma/client';
import { generateJson } from '../integrations/gemini.client';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { ActivityType, logActivity } from './activity.service';
import { buildFacts, latestResearch, type ResearchContent } from './research.service';
import { getSettings } from './settings.service';

/*
 * Lead score = weighted average of factor scores (0-10) × 10.
 * Factors the AI cannot assess (insufficient data) count as neutral (5) so that a lead
 * is never rejected just because information is missing; such leads land in NEEDS_REVIEW.
 */

export const FACTORS = {
  relevance: { label: 'Relevance to our services', weight: 0.25 },
  logisticsNeed: { label: 'Logistics requirements', weight: 0.2 },
  growthSignals: { label: 'Growth signals', weight: 0.15 },
  operationalComplexity: { label: 'Operational complexity', weight: 0.15 },
  companySize: { label: 'Company size fit', weight: 0.1 },
  contactAvailability: { label: 'Contact availability', weight: 0.075 },
  outreachOpportunity: { label: 'Outreach opportunity', weight: 0.075 },
} as const;

export type FactorKey = keyof typeof FACTORS;

export interface FactorResult {
  key: FactorKey;
  label: string;
  weight: number;
  score: number | null; // null = insufficient data
  reasoning: string;
  computed?: boolean; // deterministic, not AI
}

export function computeScore(factors: FactorResult[]): { score: number; status: QualificationStatus; missing: number } {
  let total = 0;
  let missing = 0;
  for (const f of factors) {
    if (f.score === null) missing++;
    total += (f.score ?? 5) * f.weight;
  }
  const score = Math.round(total * 10);
  let status: QualificationStatus = score >= 65 ? 'QUALIFIED' : score >= 40 ? 'NEEDS_REVIEW' : 'NOT_A_FIT';
  if (missing >= 3 && status === 'NOT_A_FIT') status = 'NEEDS_REVIEW';
  return { score, status, missing };
}

/** Deterministic: based on saved contacts and whether we have an email for them. */
export function contactFactor(contacts: { email: string | null; seniority: string | null }[]): FactorResult {
  const withEmail = contacts.filter((c) => c.email).length;
  const senior = contacts.filter((c) => c.seniority && /owner|founder|c-suite|vp|head|director/.test(c.seniority)).length;
  let score: number | null;
  let reasoning: string;
  if (contacts.length === 0) {
    score = null;
    reasoning = 'No contacts saved yet. Use People search to find decision-makers.';
  } else {
    score = Math.min(10, 3 + withEmail * 3 + Math.min(senior, 2));
    reasoning = `${contacts.length} contact(s) saved, ${withEmail} with an email address, ${senior} senior decision-maker(s).`;
  }
  return { key: 'contactAvailability', ...FACTORS.contactAvailability, score, reasoning, computed: true };
}

const factorSchema = {
  type: 'object',
  properties: {
    score: { type: 'integer', nullable: true, description: '0-10, or null if there is not enough information' },
    reasoning: { type: 'string' },
  },
  required: ['score', 'reasoning'],
};

export async function scoreLead(userId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, userId }, include: { company: { include: { contacts: true } } } });
  if (!lead) throw notFound('Lead');
  const settings = await getSettings(userId);
  const services = await prisma.service.findMany({ where: { userId, isActive: true } });
  const research = await latestResearch(userId, lead.companyId);
  const content = research?.content as unknown as ResearchContent | undefined;

  const facts = buildFacts(lead.company).map((f) => `${f.label}: ${f.value}`).join('\n');
  const findings = content?.findings.map((f) => `- ${f.statement}`).join('\n') || '(no web findings)';
  const analysis = content
    ? [
        `Logistics requirements: ${content.analysis.logisticsRequirements.map((p) => p.text).join(' | ') || 'n/a'}`,
        `Supply-chain challenges: ${content.analysis.supplyChainChallenges.map((p) => p.text).join(' | ') || 'n/a'}`,
        `Growth indicators: ${content.analysis.growthIndicators.map((p) => p.text).join(' | ') || 'n/a'}`,
        `Opportunities: ${content.analysis.opportunities.map((p) => p.text).join(' | ') || 'n/a'}`,
      ].join('\n')
    : '(no research yet)';

  const prompt = `Assess this prospect for ${settings.businessName}.
${settings.businessDescription ? `Seller: ${settings.businessDescription}` : ''}
${settings.idealCustomerProfile ? `Ideal customer: ${settings.idealCustomerProfile}` : ''}
${services.length ? `Services: ${services.map((s) => s.name).join(', ')}` : ''}

PROVIDER FACTS
${facts || '(none)'}

WEB FINDINGS
${findings}

PRIOR AI ANALYSIS
${analysis}

Score each factor 0-10 with one or two sentences of reasoning grounded in the input. Use null when the input does not contain enough information to judge that factor; do not guess. Being funded alone is not evidence of logistics need.
Also give an overall recommended outreach strategy (2-3 sentences).`;

  const aiKeys: FactorKey[] = ['relevance', 'logisticsNeed', 'growthSignals', 'operationalComplexity', 'companySize', 'outreachOpportunity'];
  const result = await generateJson<Record<string, { score: number | null; reasoning: string }> & { strategy: string }>({
    userId,
    model: settings.geminiModel,
    operation: 'LEAD_QUALIFICATION',
    prompt,
    temperature: 0.2,
    jsonSchema: {
      type: 'object',
      properties: { ...Object.fromEntries(aiKeys.map((k) => [k, factorSchema])), strategy: { type: 'string' } },
      required: [...aiKeys, 'strategy'],
    },
  });

  const factors: FactorResult[] = aiKeys.map((key) => {
    const raw = result[key];
    const score = raw && typeof raw.score === 'number' ? Math.max(0, Math.min(10, Math.round(raw.score))) : null;
    return { key, ...FACTORS[key], score, reasoning: raw?.reasoning || 'No reasoning returned.' };
  });
  factors.splice(5, 0, contactFactor(lead.company.contacts));
  const { score, status, missing } = computeScore(factors);
  const reasoning = `Weighted score from ${factors.length - missing} assessed factor(s)${missing ? `; ${missing} factor(s) lacked data and were counted as neutral` : ''}.`;

  return prisma.$transaction(async (tx) => {
    const record = await tx.leadScore.create({
      data: {
        userId,
        leadId,
        score,
        status,
        reasoning,
        factors: factors as unknown as Prisma.InputJsonValue,
        strategy: result.strategy || null,
        source: 'AI',
        model: settings.geminiModel,
      },
    });
    await tx.lead.update({
      where: { id: leadId },
      data: {
        score,
        qualificationStatus: status,
        scoreReasoning: reasoning,
        outreachStrategy: result.strategy || null,
        scoreIsManual: false,
        ...(status === 'QUALIFIED' && ['NEW_LEAD', 'RESEARCHING'].includes(lead.stage) ? { stage: 'QUALIFIED' } : {}),
      },
    });
    await logActivity({ userId, leadId, companyId: lead.companyId, type: ActivityType.SCORED, title: `Scored ${score}/100 (${status.replace('_', ' ').toLowerCase()})` }, tx);
    return record;
  });
}

export async function overrideScore(userId: string, leadId: string, score: number, status: QualificationStatus, reason: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, userId } });
  if (!lead) throw notFound('Lead');
  if (!reason.trim()) throw new AppError('VALIDATION', 'Explain why you are overriding the score.');
  return prisma.$transaction(async (tx) => {
    const record = await tx.leadScore.create({ data: { userId, leadId, score, status, reasoning: reason, source: 'MANUAL' } });
    await tx.lead.update({ where: { id: leadId }, data: { score, qualificationStatus: status, scoreReasoning: reason, scoreIsManual: true } });
    await logActivity({ userId, leadId, companyId: lead.companyId, type: ActivityType.SCORE_OVERRIDDEN, title: `Score set manually to ${score}`, details: reason }, tx);
    return record;
  });
}
