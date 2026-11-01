import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export async function getSuppressionList(req: Request, res: Response) {
  try {
    const list = await prisma.suppressionList.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ list });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function addSuppression(req: Request, res: Response) {
  try {
    const { email, domain, reason = 'MANUAL_EXCLUSION' } = req.body;
    if (!email && !domain) {
      return res.status(400).json({ error: 'Either email or domain is required' });
    }

    const item = await prisma.suppressionList.create({
      data: {
        email: email ? email.toLowerCase() : undefined,
        domain: domain ? domain.toLowerCase() : undefined,
        reason,
        addedBy: 'USER',
      },
    });

    return res.status(201).json({ item });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function removeSuppression(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await prisma.suppressionList.delete({ where: { id } });
    return res.json({ success: true, message: 'Removed from suppression list' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
