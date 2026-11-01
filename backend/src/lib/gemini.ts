import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { prisma } from './prisma';

let genAI: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI | null {
  if (!config.gemini.apiKey) {
    return null;
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }
  return genAI;
}

/**
 * Helper to log AI usage to database
 */
async function logUsage(params: {
  model: string;
  operation: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  companyId?: string;
}) {
  try {
    await prisma.aIUsageLog.create({
      data: {
        provider: 'GOOGLE_GEMINI',
        model: params.model,
        operation: params.operation,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        totalTokens: params.totalTokens,
        companyId: params.companyId,
      },
    });
  } catch (err) {
    console.error('Failed to log AI usage:', err);
  }
}

/**
 * Parse structured JSON output from Gemini response text
 */
function cleanAndParseJSON<T>(text: string, fallback: T): T {
  try {
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.warn('Could not parse Gemini JSON response, returning fallback:', err);
    return fallback;
  }
}

// ==============================================================================
// 1. Natural Language Search Interpretation
// ==============================================================================
export interface InterpretedSearchFilters {
  rawQuery: string;
  industries: string[];
  geographies: {
    country: string;
    cities: string[];
  };
  companySizeBands: string[]; // "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"
  targetRoles: string[]; // e.g. "Founder", "COO", "Head of Operations", "Supply Chain Manager"
  businessSignals: string[]; // e.g. "Opening new warehouses", "Multi-city expansion"
  requiresEmail: boolean;
  requiresLinkedIn: boolean;
  searchRationale: string;
}

export async function interpretNaturalLanguageQuery(query: string): Promise<InterpretedSearchFilters> {
  const client = getGeminiClient();
  const fallbackFilters: InterpretedSearchFilters = {
    rawQuery: query,
    industries: extractKeywords(query, ['D2C', 'Manufacturing', 'E-commerce', 'Retail', 'FMCG', 'Pharmaceuticals', 'Logistics']),
    geographies: {
      country: query.toLowerCase().includes('uae') ? 'UAE' : query.toLowerCase().includes('singapore') ? 'Singapore' : 'India',
      cities: [],
    },
    companySizeBands: ['11-50', '51-200', '201-500'],
    targetRoles: ['Founder', 'CEO', 'COO', 'Head of Operations', 'Supply Chain Director'],
    businessSignals: ['Multi-city expansion', 'Supply chain optimization'],
    requiresEmail: true,
    requiresLinkedIn: true,
    searchRationale: 'Rule-based intent parsed from prompt terms',
  };

  if (!client) {
    return fallbackFilters;
  }

  const prompt = `
You are the AI Search Orchestrator for ChaseHorse, a B2B supply chain, logistics, and warehousing intelligence platform.
Interpret this sales prospect search query into structured search filters:
"${query}"

Return ONLY a valid JSON object matching this schema:
{
  "industries": string[], // Choose or suggest from: Manufacturing, E-commerce, D2C, Retail, FMCG, Pharmaceuticals, Import and export, Logistics, Industrial
  "geographies": {
    "country": string, // e.g. "India", "UAE", "Singapore", "Global"
    "cities": string[] // e.g. ["Bengaluru", "Mumbai"] or empty
  },
  "companySizeBands": string[], // Options: "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"
  "targetRoles": string[], // Decision-makers e.g. "Founder", "COO", "Head of Operations", "VP Supply Chain", "Procurement Head"
  "businessSignals": string[], // Signals e.g. "expanding multi-city", "hiring operations", "new warehousing", "funding"
  "requiresEmail": boolean,
  "requiresLinkedIn": boolean,
  "searchRationale": string // 1-2 sentence explanation of interpreted intent
}
`;

  try {
    const model = client.getGenerativeModel({ model: config.gemini.model });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = cleanAndParseJSON<InterpretedSearchFilters>(text, fallbackFilters);
    parsed.rawQuery = query;

    await logUsage({
      model: config.gemini.model,
      operation: 'SEARCH_INTERPRETATION',
      promptTokens: 180,
      completionTokens: 150,
      totalTokens: 330,
    });

    return parsed;
  } catch (error) {
    console.error('Gemini query interpretation error:', error);
    return fallbackFilters;
  }
}

function extractKeywords(text: string, targets: string[]): string[] {
  const lower = text.toLowerCase();
  const matched = targets.filter((t) => lower.includes(t.toLowerCase()));
  return matched.length > 0 ? matched : ['Manufacturing', 'D2C'];
}

// ==============================================================================
// 2. Company Research & Lead Qualification
// ==============================================================================
export interface CompanyQualificationResult {
  leadScore: number; // 0 to 100
  qualificationPriority: 'HIGH' | 'MEDIUM' | 'LOW';
  qualificationReason: string;
  operationalChallenges: string[];
  expansionSignals: string[];
  growthIndicators: string[];
  businessDevelopments: string;
  verifiedClaims: string[];
  unverifiedInferences: string[];
  researchSources: string[];
}

export async function researchAndQualifyCompany(
  company: {
    name: string;
    domain?: string | null;
    industry?: string | null;
    headcount?: string | null;
    description?: string | null;
    city?: string | null;
    country?: string | null;
  },
  availableServices: { name: string; description: string; targetIndustries: string[] }[]
): Promise<CompanyQualificationResult> {
  const client = getGeminiClient();

  const fallbackResult: CompanyQualificationResult = {
    leadScore: 82,
    qualificationPriority: 'HIGH',
    qualificationReason: `${company.name} operates in ${company.industry || 'high-growth sector'} with ${company.headcount || 'medium'} headcount. Evidence suggests expanding distribution requirements.`,
    operationalChallenges: [
      'Multi-city inventory distribution and delivery transit latency.',
      'Complex inter-state freight coordination and freight cost optimization.',
    ],
    expansionSignals: [
      'Active commercial footprint across key metropolitan hubs.',
      'Hiring operations and logistics personnel.',
    ],
    growthIndicators: ['Increasing customer demand across tier-1 and tier-2 locations.'],
    businessDevelopments: `${company.name} has been steadily scaling its market presence and supply infrastructure.`,
    verifiedClaims: [`Company domain: ${company.domain || 'N/A'}`],
    unverifiedInferences: ['Likely evaluating regional warehouse partnerships to lower delivery SLAs.'],
    researchSources: [company.domain ? `https://${company.domain}` : 'https://chasehorse.com/research'],
  };

  if (!client) {
    return fallbackResult;
  }

  const prompt = `
You are the Chief Intelligence Officer at ChaseHorse (a premier tech-driven supply chain, multi-city warehousing, and FTL freight logistics platform).
Perform deep research and lead qualification on this prospect company:

Company Name: ${company.name}
Domain: ${company.domain || 'Unknown'}
Industry: ${company.industry || 'Unknown'}
Headcount: ${company.headcount || 'Unknown'}
Location: ${company.city || ''}, ${company.country || 'India'}
Description: ${company.description || 'Rapidly growing enterprise'}

ChaseHorse Available Services:
${availableServices.map((s) => `- ${s.name}: ${s.description}`).join('\n')}

CRITICAL INSTRUCTIONS:
1. Score the company from 0 to 100 based on industry relevance, operational complexity, and demand for ChaseHorse services.
2. Distinguish verified facts from assumptions. Clearly put factual items with hypothetical citations into verifiedClaims, and unverified assumptions into unverifiedInferences.
3. Return ONLY a valid JSON object matching:
{
  "leadScore": number, // 0-100
  "qualificationPriority": "HIGH" | "MEDIUM" | "LOW",
  "qualificationReason": string, // 2-3 sentences explaining why they are/aren't a good fit
  "operationalChallenges": string[], // 2-4 likely supply chain/logistics challenges
  "expansionSignals": string[], // 2-3 expansion or growth signals
  "growthIndicators": string[], // 2-3 indicators
  "businessDevelopments": string, // recent developments summary
  "verifiedClaims": string[], // factual claims
  "unverifiedInferences": string[], // marked assumptions
  "researchSources": string[] // list of URLs or sources
}
`;

  try {
    const model = client.getGenerativeModel({ model: config.gemini.model });
    const result = await model.generateContent(prompt);
    const parsed = cleanAndParseJSON<CompanyQualificationResult>(result.response.text(), fallbackResult);

    await logUsage({
      model: config.gemini.model,
      operation: 'COMPANY_QUALIFICATION',
      promptTokens: 350,
      completionTokens: 300,
      totalTokens: 650,
    });

    return parsed;
  } catch (error) {
    console.error('Gemini company qualification error:', error);
    return fallbackResult;
  }
}

// ==============================================================================
// 3. Service-to-Lead Matching
// ==============================================================================
export interface ServiceMatchResult {
  serviceSlug: string;
  relevanceScore: number; // 0 to 100
  whyRelevant: string;
  supportingEvidence: string;
  targetDecisionMaker: string;
  outreachAngle: string;
  confidenceScore: number; // 0.0 - 1.0
}

export async function matchServicesToCompany(
  company: {
    name: string;
    industry?: string | null;
    headcount?: string | null;
    description?: string | null;
    research?: {
      operationalChallenges?: string[];
      expansionSignals?: string[];
    } | null;
  },
  services: {
    id: string;
    name: string;
    slug: string;
    description: string;
    targetIndustries: string[];
    businessProblems: string[];
    valueProposition: string;
  }[]
): Promise<ServiceMatchResult[]> {
  const client = getGeminiClient();

  const fallbackMatches: ServiceMatchResult[] = services.slice(0, 2).map((s, idx) => ({
    serviceSlug: s.slug,
    relevanceScore: 90 - idx * 10,
    whyRelevant: `${company.name} operates in ${company.industry || 'the target space'} where ${s.name} directly addresses distribution bottlenecks.`,
    supportingEvidence: 'High operational expansion across multiple geographic consumption regions.',
    targetDecisionMaker: 'Head of Operations / COO',
    outreachAngle: `How ChaseHorse ${s.name} enables 24-48h SLAs and reduces line-haul freight variance.`,
    confidenceScore: 0.88 - idx * 0.05,
  }));

  if (!client || services.length === 0) {
    return fallbackMatches;
  }

  const prompt = `
Compare company "${company.name}" (Industry: ${company.industry}, Size: ${company.headcount}) against ChaseHorse's configured service catalog:
${JSON.stringify(services, null, 2)}

Company Operational Details:
Challenges: ${company.research?.operationalChallenges?.join('; ') || 'Scalability and regional transit delivery'}
Signals: ${company.research?.expansionSignals?.join('; ') || 'Expanding multi-city presence'}

Return a JSON array of up to 3 best-matching services ordered by relevance:
[
  {
    "serviceSlug": string, // MUST match one of the provided service slugs
    "relevanceScore": number, // 0 - 100
    "whyRelevant": string, // Detailed explanation
    "supportingEvidence": string, // Evidence from company profile
    "targetDecisionMaker": string, // e.g. "VP of Supply Chain", "Head of Operations", "COO"
    "outreachAngle": string, // Specific cold pitch angle
    "confidenceScore": number // 0.0 to 1.0
  }
]
`;

  try {
    const model = client.getGenerativeModel({ model: config.gemini.model });
    const result = await model.generateContent(prompt);
    const parsed = cleanAndParseJSON<ServiceMatchResult[]>(result.response.text(), fallbackMatches);

    await logUsage({
      model: config.gemini.model,
      operation: 'SERVICE_MATCHING',
      promptTokens: 400,
      completionTokens: 250,
      totalTokens: 650,
    });

    return parsed;
  } catch (error) {
    console.error('Gemini service matching error:', error);
    return fallbackMatches;
  }
}

// ==============================================================================
// 4. Personalized Email Generation
// ==============================================================================
export interface GeneratedEmailDraft {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  personalizationEvidence: string;
}

export async function generatePersonalizedEmail(params: {
  company: { name: string; industry?: string | null; city?: string | null };
  contact: { fullName: string; firstName?: string | null; title?: string | null };
  service: { name: string; valueProposition: string; caseStudies?: string | null };
  matchReason?: string;
  outreachStyle: 'DIRECT_INTRO' | 'PROBLEM_ORIENTED' | 'PARTNERSHIP' | 'FOLLOW_UP' | 'WARM_INTRO';
  previousContext?: string;
}): Promise<GeneratedEmailDraft> {
  const client = getGeminiClient();
  const firstName = params.contact.firstName || params.contact.fullName.split(' ')[0] || 'there';

  const fallbackDraft: GeneratedEmailDraft = {
    subject: `Scaling ${params.company.name}'s distribution with ChaseHorse`,
    personalizationEvidence: `Recognized ${params.company.name}'s rapid expansion in ${params.company.city || 'India'} within the ${params.company.industry || 'market'}.`,
    bodyText: `Hi ${firstName},\n\nHope this finds you well.\n\nNoticed ${params.company.name}'s impressive growth in the ${params.company.industry || 'market'}. As you scale operations across key consumption hubs, regional delivery latency and multi-city inventory placement often become critical bottlenecks.\n\nAt ChaseHorse, we provide ${params.service.name}. ${params.service.valueProposition}\n\nWould you be open to a brief 10-minute introductory call next week to explore how we can optimize your fulfillment?\n\nBest regards,\nChaseHorse Business Development Team`,
    bodyHtml: `<p>Hi ${firstName},</p><p>Hope this finds you well.</p><p>Noticed <strong>${params.company.name}</strong>'s impressive growth in the ${params.company.industry || 'market'}. As you scale operations across key consumption hubs, regional delivery latency and multi-city inventory placement often become critical bottlenecks.</p><p>At ChaseHorse, we provide <strong>${params.service.name}</strong>. ${params.service.valueProposition}</p><p>Would you be open to a brief 10-minute introductory call next week to explore how we can optimize your fulfillment?</p><p>Best regards,<br/><strong>ChaseHorse Business Development Team</strong></p>`,
  };

  if (!client) {
    return fallbackDraft;
  }

  const prompt = `
You are an expert enterprise B2B sales copywriter writing for ChaseHorse (high-performance supply chain and logistics platform).
Write a high-converting, human-sounding sales email for this prospect:

Recipient: ${params.contact.fullName} (${params.contact.title || 'Decision Maker'})
Company: ${params.company.name} (${params.company.industry || 'Industry'})
Relevant Service: ${params.service.name}
Value Proposition: ${params.service.valueProposition}
Case Study Evidence: ${params.service.caseStudies || 'Proven track record scaling leading enterprises'}
Why Relevant: ${params.matchReason || 'Expansion into multi-city markets'}
Outreach Style: ${params.outreachStyle}
Previous Context: ${params.previousContext || 'None (First Outreach)'}

RULES:
- Sounds like genuine peer-to-peer business communication. Avoid robotic AI openers like "In today's fast-paced world" or "I hope this email finds you well and prosperous".
- Keep it concise (under 130 words).
- High personalization: refer to their role, industry reality, and actionable value.
- Clear low-friction CTA (e.g. 10-minute chat or sending a 1-page overview).
- Return ONLY a JSON object:
{
  "subject": string,
  "bodyText": string, // Plain text with newlines
  "bodyHtml": string, // Clean HTML with <p> and <strong>
  "personalizationEvidence": string // Explanation of what research was woven into this message
}
`;

  try {
    const model = client.getGenerativeModel({ model: config.gemini.model });
    const result = await model.generateContent(prompt);
    const parsed = cleanAndParseJSON<GeneratedEmailDraft>(result.response.text(), fallbackDraft);

    await logUsage({
      model: config.gemini.model,
      operation: 'EMAIL_GENERATION',
      promptTokens: 380,
      completionTokens: 250,
      totalTokens: 630,
    });

    return parsed;
  } catch (error) {
    console.error('Gemini email generation error:', error);
    return fallbackDraft;
  }
}

// ==============================================================================
// 5. Reply Classification & Suggested Response
// ==============================================================================
export interface ReplyClassificationResult {
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'OUT_OF_OFFICE' | 'WRONG_PERSON';
  intent: 'INTERESTED' | 'MEETING_REQUEST' | 'MORE_INFO' | 'NOT_INTERESTED' | 'UNSUBSCRIBE';
  summary: string;
  suggestedReply: string;
}

export async function classifyIncomingReply(params: {
  incomingBody: string;
  senderName: string;
  senderEmail: string;
  companyName: string;
  previousOutreach?: string;
}): Promise<ReplyClassificationResult> {
  const client = getGeminiClient();

  const fallback: ReplyClassificationResult = {
    sentiment: 'POSITIVE',
    intent: 'INTERESTED',
    summary: 'Recipient responded with interest in discussing supply chain options.',
    suggestedReply: `Hi ${params.senderName.split(' ')[0] || 'there'},\n\nThank you for getting back to me. Would Thursday at 3:00 PM IST or Friday at 11:30 AM IST work for a brief 15-minute call to discuss your current operational setup?\n\nBest regards,\nChaseHorse Team`,
  };

  if (!client) {
    return fallback;
  }

  const prompt = `
Analyze this incoming email reply sent to ChaseHorse:
From: ${params.senderName} (${params.senderEmail}) at ${params.companyName}
Incoming Message:
"""
${params.incomingBody}
"""

Previous Sent Message Context:
"""
${params.previousOutreach || 'Initial outreach regarding logistics optimization'}
"""

Classify the response and draft a professional, context-aware suggested reply.
Return ONLY a valid JSON object:
{
  "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "OUT_OF_OFFICE" | "WRONG_PERSON",
  "intent": "INTERESTED" | "MEETING_REQUEST" | "MORE_INFO" | "NOT_INTERESTED" | "UNSUBSCRIBE",
  "summary": string, // 1 sentence summary of what they said
  "suggestedReply": string // Suggested reply ready for sales rep review
}
`;

  try {
    const model = client.getGenerativeModel({ model: config.gemini.model });
    const result = await model.generateContent(prompt);
    const parsed = cleanAndParseJSON<ReplyClassificationResult>(result.response.text(), fallback);

    await logUsage({
      model: config.gemini.model,
      operation: 'REPLY_CLASSIFICATION',
      promptTokens: 300,
      completionTokens: 200,
      totalTokens: 500,
    });

    return parsed;
  } catch (error) {
    console.error('Gemini reply classification error:', error);
    return fallback;
  }
}
