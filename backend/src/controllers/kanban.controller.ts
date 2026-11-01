import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export async function getKanbanBoard(req: Request, res: Response) {
  try {
    const stages = await prisma.kanbanStage.findMany({
      orderBy: { order: 'asc' },
      include: {
        companies: {
          where: { isArchived: false },
          include: {
            contacts: {
              where: { isPrimary: true },
              take: 1,
            },
            serviceMatches: {
              include: { service: true },
              orderBy: { relevanceScore: 'desc' },
              take: 1,
            },
            followUps: {
              where: { status: 'PENDING' },
              orderBy: { dueDate: 'asc' },
              take: 1,
            },
            _count: {
              select: { emailThreads: true, contacts: true },
            },
          },
          orderBy: { leadScore: 'desc' },
        },
      },
    });

    const totalLeads = stages.reduce((acc, stage) => acc + stage.companies.length, 0);

    return res.json({ stages, totalLeads });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function moveCompanyStage(req: Request, res: Response) {
  try {
    const { companyId, targetStageId } = req.body;
    if (!companyId || !targetStageId) {
      return res.status(400).json({ error: 'companyId and targetStageId are required' });
    }

    const stage = await prisma.kanbanStage.findUnique({ where: { id: targetStageId } });
    if (!stage) {
      return res.status(404).json({ error: 'Target stage not found' });
    }

    const previous = await prisma.company.findUnique({
      where: { id: companyId },
      include: { kanbanStage: true },
    });

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: { kanbanStageId: targetStageId },
      include: { kanbanStage: true },
    });

    // Record activity
    await prisma.leadActivity.create({
      data: {
        companyId,
        type: 'STATUS_CHANGE',
        title: `Pipeline Stage Updated: ${stage.name}`,
        description: `Moved from "${previous?.kanbanStage?.name || 'Unassigned'}" to "${stage.name}"`,
        metadata: { fromStage: previous?.kanbanStage?.name, toStage: stage.name },
      },
    });

    return res.json({ success: true, company: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function createKanbanStage(req: Request, res: Response) {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Stage name is required' });

    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const highest = await prisma.kanbanStage.findFirst({ orderBy: { order: 'desc' } });
    const order = (highest?.order || 0) + 1;

    const stage = await prisma.kanbanStage.create({
      data: {
        name,
        key,
        order,
        color: color || '#64748b',
        isDefault: false,
      },
    });

    return res.status(201).json({ stage });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
