import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { researchAndQualifyCompany, matchServicesToCompany } from '../lib/gemini';

export async function listCompanies(req: Request, res: Response) {
  try {
    const { search, industry, priority, stageId, sortBy = 'leadScore', sortOrder = 'desc' } = req.query;

    const where: any = { isArchived: false };

    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { domain: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (industry && typeof industry === 'string' && industry !== 'ALL') {
      where.industry = { equals: industry, mode: 'insensitive' };
    }

    if (priority && typeof priority === 'string' && priority !== 'ALL') {
      where.qualificationPriority = priority;
    }

    if (stageId && typeof stageId === 'string' && stageId !== 'ALL') {
      where.kanbanStageId = stageId;
    }

    const companies = await prisma.company.findMany({
      where,
      include: {
        contacts: true,
        research: true,
        serviceMatches: { include: { service: true } },
        kanbanStage: true,
        _count: {
          select: { contacts: true, emailThreads: true, followUps: true, notes: true },
        },
      },
      orderBy: { [sortBy as string]: sortOrder === 'asc' ? 'asc' : 'desc' },
    });

    return res.json({ companies, total: companies.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function getCompanyById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: { isPrimary: 'desc' } },
        research: true,
        fundingRounds: true,
        serviceMatches: { include: { service: true } },
        kanbanStage: true,
        emailDrafts: { include: { contact: true, service: true }, orderBy: { createdAt: 'desc' } },
        emailThreads: {
          include: { messages: { orderBy: { createdAt: 'asc' } } },
          orderBy: { lastMessageAt: 'desc' },
        },
        activities: { orderBy: { createdAt: 'desc' } },
        followUps: { orderBy: { dueDate: 'asc' } },
        notes: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    return res.json({ company });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function updateCompany(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, industry, headcount, city, state, country, description, kanbanStageId, leadScore } = req.body;

    const updated = await prisma.company.update({
      where: { id },
      data: {
        name,
        industry,
        headcount,
        city,
        state,
        country,
        description,
        kanbanStageId,
        leadScore: leadScore !== undefined ? Number(leadScore) : undefined,
      },
    });

    return res.json({ company: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteCompany(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await prisma.company.update({
      where: { id },
      data: { isArchived: true },
    });
    return res.json({ success: true, message: 'Company archived successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function triggerCompanyResearch(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const activeServices = await prisma.service.findMany({ where: { isActive: true } });
    const qualification = await researchAndQualifyCompany(
      {
        name: company.name,
        domain: company.domain,
        industry: company.industry,
        headcount: company.headcount,
        description: company.description,
        city: company.city,
        country: company.country,
      },
      activeServices
    );

    // Upsert research
    await prisma.companyResearch.upsert({
      where: { companyId: company.id },
      update: {
        operationalChallenges: qualification.operationalChallenges,
        expansionSignals: qualification.expansionSignals,
        growthIndicators: qualification.growthIndicators,
        businessDevelopments: qualification.businessDevelopments,
        verifiedClaims: qualification.verifiedClaims,
        unverifiedInferences: qualification.unverifiedInferences,
        researchSources: qualification.researchSources,
      },
      create: {
        companyId: company.id,
        operationalChallenges: qualification.operationalChallenges,
        expansionSignals: qualification.expansionSignals,
        growthIndicators: qualification.growthIndicators,
        businessDevelopments: qualification.businessDevelopments,
        verifiedClaims: qualification.verifiedClaims,
        unverifiedInferences: qualification.unverifiedInferences,
        researchSources: qualification.researchSources,
      },
    });

    // Update company lead score and priority
    await prisma.company.update({
      where: { id: company.id },
      data: {
        leadScore: qualification.leadScore,
        qualificationPriority: qualification.qualificationPriority,
        qualificationReason: qualification.qualificationReason,
      },
    });

    // Re-match services
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
          update: {
            relevanceScore: m.relevanceScore,
            whyRelevant: m.whyRelevant,
            supportingEvidence: m.supportingEvidence,
            targetDecisionMaker: m.targetDecisionMaker,
            outreachAngle: m.outreachAngle,
            confidenceScore: m.confidenceScore,
          },
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

    await prisma.leadActivity.create({
      data: {
        companyId: company.id,
        type: 'RESEARCH_UPDATED',
        title: 'AI Research Re-evaluated',
        description: `Updated score to ${qualification.leadScore}/100 with fresh evidence.`,
      },
    });

    const fullCompany = await prisma.company.findUnique({
      where: { id },
      include: {
        contacts: true,
        research: true,
        serviceMatches: { include: { service: true } },
        kanbanStage: true,
      },
    });

    return res.json({ success: true, company: fullCompany });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function addCompanyNote(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { content, author = 'Adiii' } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });

    const note = await prisma.note.create({
      data: {
        companyId: id,
        content,
        author,
      },
    });

    await prisma.leadActivity.create({
      data: {
        companyId: id,
        type: 'NOTE_ADDED',
        title: 'Note added',
        description: content.substring(0, 100),
      },
    });

    return res.json({ note });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
