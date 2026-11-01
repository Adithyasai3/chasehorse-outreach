import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { matchServicesToCompany } from '../lib/gemini';

export async function listServices(req: Request, res: Response) {
  try {
    const services = await prisma.service.findMany({
      include: {
        _count: {
          select: { serviceMatches: true, emailDrafts: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return res.json({ services });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function createService(req: Request, res: Response) {
  try {
    const {
      name,
      slug,
      description,
      targetIndustries = [],
      targetCompanySizes = [],
      businessProblems = [],
      valueProposition,
      caseStudies,
    } = req.body;

    if (!name || !description || !valueProposition) {
      return res.status(400).json({ error: 'Name, description, and valueProposition are required' });
    }

    const calculatedSlug =
      slug ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-');

    const service = await prisma.service.create({
      data: {
        name,
        slug: calculatedSlug,
        description,
        targetIndustries,
        targetCompanySizes,
        businessProblems,
        valueProposition,
        caseStudies,
        isActive: true,
      },
    });

    return res.status(201).json({ service });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function updateService(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      targetIndustries,
      targetCompanySizes,
      businessProblems,
      valueProposition,
      caseStudies,
      isActive,
    } = req.body;

    const service = await prisma.service.update({
      where: { id },
      data: {
        name,
        description,
        targetIndustries,
        targetCompanySizes,
        businessProblems,
        valueProposition,
        caseStudies,
        isActive,
      },
    });

    return res.json({ service });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteService(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await prisma.service.delete({ where: { id } });
    return res.json({ success: true, message: 'Service deleted' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function matchAllLeads(req: Request, res: Response) {
  try {
    const activeServices = await prisma.service.findMany({ where: { isActive: true } });
    const companies = await prisma.company.findMany({
      where: { isArchived: false },
      include: { research: true },
      take: 20,
    });

    let totalMatches = 0;
    for (const c of companies) {
      const matches = await matchServicesToCompany(
        {
          name: c.name,
          industry: c.industry,
          headcount: c.headcount,
          description: c.description,
          research: c.research,
        },
        activeServices
      );

      for (const m of matches) {
        const s = activeServices.find((asv) => asv.slug === m.serviceSlug);
        if (s) {
          await prisma.companyServiceMatch.upsert({
            where: { companyId_serviceId: { companyId: c.id, serviceId: s.id } },
            update: {
              relevanceScore: m.relevanceScore,
              whyRelevant: m.whyRelevant,
              supportingEvidence: m.supportingEvidence,
              targetDecisionMaker: m.targetDecisionMaker,
              outreachAngle: m.outreachAngle,
              confidenceScore: m.confidenceScore,
            },
            create: {
              companyId: c.id,
              serviceId: s.id,
              relevanceScore: m.relevanceScore,
              whyRelevant: m.whyRelevant,
              supportingEvidence: m.supportingEvidence,
              targetDecisionMaker: m.targetDecisionMaker,
              outreachAngle: m.outreachAngle,
              confidenceScore: m.confidenceScore,
            },
          });
          totalMatches++;
        }
      }
    }

    return res.json({ success: true, companiesProcessed: companies.length, totalMatches });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
