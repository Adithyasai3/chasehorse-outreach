import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { generatePersonalizedEmail } from '../lib/gemini';

export async function listFollowUps(req: Request, res: Response) {
  try {
    const now = new Date();
    const followUps = await prisma.followUp.findMany({
      include: {
        company: { select: { id: true, name: true, domain: true, industry: true, leadScore: true } },
        contact: { select: { id: true, fullName: true, email: true, title: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const pending = followUps.filter((f) => f.status === 'PENDING');
    const overdue = pending.filter((f) => new Date(f.dueDate) < now);
    const upcoming = pending.filter((f) => new Date(f.dueDate) >= now);
    const completed = followUps.filter((f) => f.status === 'COMPLETED');

    return res.json({
      all: followUps,
      pending,
      overdue,
      upcoming,
      completed,
      stats: {
        total: followUps.length,
        pendingCount: pending.length,
        overdueCount: overdue.length,
        upcomingCount: upcoming.length,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function createFollowUp(req: Request, res: Response) {
  try {
    const { companyId, contactId, title, dueDate, sequenceStep = 1, reminderDays = 3, notes } = req.body;
    if (!companyId || !title || !dueDate) {
      return res.status(400).json({ error: 'companyId, title, and dueDate are required' });
    }

    const followUp = await prisma.followUp.create({
      data: {
        companyId,
        contactId,
        title,
        dueDate: new Date(dueDate),
        sequenceStep: Number(sequenceStep),
        reminderDays: Number(reminderDays),
        notes,
        status: 'PENDING',
      },
      include: { company: true, contact: true },
    });

    await prisma.leadActivity.create({
      data: {
        companyId,
        contactId,
        type: 'FOLLOW_UP_CREATED',
        title: `Follow-up Scheduled: ${title}`,
        description: `Due on ${new Date(dueDate).toLocaleDateString()}`,
      },
    });

    return res.status(201).json({ followUp });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function completeFollowUp(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const followUp = await prisma.followUp.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    return res.json({ followUp });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function generateFollowUpEmail(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const followUp = await prisma.followUp.findUnique({
      where: { id },
      include: {
        company: { include: { serviceMatches: { include: { service: true } } } },
        contact: true,
      },
    });

    if (!followUp) return res.status(404).json({ error: 'Follow-up not found' });
    if (!followUp.contact) return res.status(400).json({ error: 'No contact assigned to this follow-up' });

    const service = followUp.company.serviceMatches[0]?.service || (await prisma.service.findFirst({ where: { isActive: true } }));
    if (!service) return res.status(400).json({ error: 'No service configured' });

    const draft = await generatePersonalizedEmail({
      company: { name: followUp.company.name, industry: followUp.company.industry },
      contact: { fullName: followUp.contact.fullName, firstName: followUp.contact.firstName, title: followUp.contact.title },
      service: { name: service.name, valueProposition: service.valueProposition },
      outreachStyle: 'FOLLOW_UP',
      previousContext: `Follow-up Step ${followUp.sequenceStep}: ${followUp.notes || 'Gentle check-in regarding our previous conversation'}`,
    });

    const savedDraft = await prisma.emailDraft.create({
      data: {
        companyId: followUp.companyId,
        contactId: followUp.contactId,
        serviceId: service.id,
        outreachStyle: 'FOLLOW_UP',
        subject: draft.subject,
        bodyText: draft.bodyText,
        bodyHtml: draft.bodyHtml,
        personalizationEvidence: draft.personalizationEvidence,
        status: 'DRAFT',
        isApproved: false,
      },
    });

    return res.json({ draft: savedDraft });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
