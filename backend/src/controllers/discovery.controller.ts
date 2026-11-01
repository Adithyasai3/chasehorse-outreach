import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { interpretNaturalLanguageQuery, researchAndQualifyCompany, matchServicesToCompany } from '../lib/gemini';
import { searchCompanies, searchPeople, EnrichoCompanyResult } from '../lib/enricho';

export async function interpretQuery(req: Request, res: Response) {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const filters = await interpretNaturalLanguageQuery(query);
    return res.json({ filters });
  } catch (err: any) {
    console.error('Interpret query error:', err);
    return res.status(500).json({ error: err.message || 'Failed to interpret search query' });
  }
}

export async function estimateCredits(req: Request, res: Response) {
  try {
    const { maxCompanies = 5, enrichPeople = true, targetRolesCount = 2 } = req.body;
    // Enricho preview is 0 credits. Full person record lookup is 1 credit per contact.
    const estimatedCredits = enrichPeople ? Number(maxCompanies) * Number(targetRolesCount) : 0;
    return res.json({
      estimatedCredits,
      breakdown: {
        companyDiscovery: 0,
        personEnrichment: estimatedCredits,
        totalEstimatedCredits: estimatedCredits,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function executeSearch(req: Request, res: Response) {
  const startTime = Date.now();
  try {
    const {
      query,
      filters,
      enrichContacts = true,
      maxCompanies = 5,
    } = req.body;

    // 1. If raw natural language query provided, interpret it
    let activeFilters = filters;
    if (!activeFilters && query) {
      activeFilters = await interpretNaturalLanguageQuery(query);
    }

    // 2. Query Enricho MCP for company matches
    const enrichoCompanies: EnrichoCompanyResult[] = await searchCompanies({
      query: activeFilters?.rawQuery || query,
      industries: activeFilters?.industries,
      country: activeFilters?.geographies?.country || 'India',
      cities: activeFilters?.geographies?.cities,
      sizeBands: activeFilters?.companySizeBands,
      limit: Math.min(Number(maxCompanies) || 5, 10),
    });

    // Fetch active ChaseHorse services for matching
    const activeServices = await prisma.service.findMany({ where: { isActive: true } });
    const discoveredStage = await prisma.kanbanStage.findFirst({
      where: { key: 'discovered' },
      orderBy: { order: 'asc' },
    });

    const savedCompanies = [];
    let totalCreditsUsed = 0;

    // 3. Process each discovered company
    for (const ec of enrichoCompanies) {
      // Duplicate detection by domain
      let company = await prisma.company.findUnique({
        where: { domain: ec.domain },
        include: { contacts: true, research: true, serviceMatches: true },
      });

      if (!company) {
        // AI Research & Qualification
        const qualification = await researchAndQualifyCompany(
          {
            name: ec.name,
            domain: ec.domain,
            industry: ec.industry,
            headcount: ec.headcount,
            description: ec.description,
            city: ec.city,
            country: ec.country,
          },
          activeServices
        );

        // Save company
        company = await prisma.company.create({
          data: {
            name: ec.name,
            domain: ec.domain,
            website: ec.website,
            industry: ec.industry,
            subIndustry: ec.subIndustry,
            country: ec.country,
            state: ec.state,
            city: ec.city,
            headcount: ec.headcount,
            employeeCount: ec.employeeCount,
            foundedYear: ec.foundedYear,
            description: ec.description,
            businessModel: ec.businessModel,
            leadScore: qualification.leadScore,
            qualificationPriority: qualification.qualificationPriority,
            qualificationReason: qualification.qualificationReason,
            source: 'ENRICHO_MCP',
            sourceQuery: query || activeFilters?.rawQuery,
            kanbanStageId: discoveredStage?.id,
            research: {
              create: {
                operationalChallenges: qualification.operationalChallenges,
                expansionSignals: qualification.expansionSignals,
                growthIndicators: qualification.growthIndicators,
                businessDevelopments: qualification.businessDevelopments,
                verifiedClaims: qualification.verifiedClaims,
                unverifiedInferences: qualification.unverifiedInferences,
                researchSources: qualification.researchSources,
              },
            },
          },
          include: { contacts: true, research: true, serviceMatches: true },
        });

        // 4. Enrich Contacts if requested
        if (enrichContacts && ec.domain) {
          const people = await searchPeople({
            domain: ec.domain,
            roles: activeFilters?.targetRoles,
            requiresEmail: activeFilters?.requiresEmail !== false,
            limit: 2,
          });

          for (let i = 0; i < people.length; i++) {
            const p = people[i];
            await prisma.contact.create({
              data: {
                companyId: company.id,
                fullName: p.fullName,
                firstName: p.firstName,
                lastName: p.lastName,
                email: p.email,
                isEmailVerified: p.isEmailVerified,
                phone: p.phone,
                title: p.title,
                role: p.role,
                seniority: p.seniority,
                linkedinUrl: p.linkedinUrl,
                isPrimary: i === 0,
              },
            });
            totalCreditsUsed += 1;
          }
        }

        // 5. Service-to-lead matching
        const matches = await matchServicesToCompany(
          {
            name: company.name,
            industry: company.industry,
            headcount: company.headcount,
            description: company.description,
            research: qualification,
          },
          activeServices
        );

        for (const m of matches) {
          const s = activeServices.find((asv) => asv.slug === m.serviceSlug);
          if (s) {
            await prisma.companyServiceMatch.upsert({
              where: { companyId_serviceId: { companyId: company.id, serviceId: s.id } },
              update: {},
              create: {
                companyId: company.id,
                serviceId: s.id,
                relevanceScore: m.relevanceScore,
                whyRelevant: m.whyRelevant,
                supportingEvidence: m.supportingEvidence,
                targetDecisionMaker: m.targetDecisionMaker,
                outreachAngle: m.outreachAngle,
                confidenceScore: m.confidenceScore,
              },
            });
          }
        }

        // Log initial activity
        await prisma.leadActivity.create({
          data: {
            companyId: company.id,
            type: 'STATUS_CHANGE',
            title: 'Lead Discovered & AI Qualified',
            description: `Discovered via Enricho MCP. Lead score: ${qualification.leadScore}/100.`,
          },
        });
      }

      // Re-fetch complete company object
      const fullCompany = await prisma.company.findUnique({
        where: { id: company.id },
        include: {
          contacts: true,
          research: true,
          serviceMatches: { include: { service: true } },
          kanbanStage: true,
        },
      });

      if (fullCompany) savedCompanies.push(fullCompany);
    }

    // Record LeadSearch history
    const executionTimeMs = Date.now() - startTime;
    await prisma.leadSearch.create({
      data: {
        rawQuery: query || activeFilters?.rawQuery || 'Manual Filter Search',
        interpretedFilters: activeFilters || {},
        searchType: query ? 'NATURAL_LANGUAGE' : 'MANUAL_FILTERS',
        resultsCount: savedCompanies.length,
        creditsUsed: totalCreditsUsed,
        executionTimeMs,
      },
    });

    return res.json({
      success: true,
      count: savedCompanies.length,
      creditsUsed: totalCreditsUsed,
      executionTimeMs,
      interpretedFilters: activeFilters,
      companies: savedCompanies,
    });
  } catch (err: any) {
    console.error('Search execution error:', err);
    return res.status(500).json({ error: err.message || 'Search execution failed' });
  }
}

export async function getSearchHistory(req: Request, res: Response) {
  try {
    const history = await prisma.leadSearch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return res.json({ history });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
