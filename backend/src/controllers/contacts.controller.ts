import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { searchPeople } from '../lib/enricho';

export async function listContacts(req: Request, res: Response) {
  try {
    const { search, role, seniority, companyId } = req.query;

    const where: any = {};
    if (search && typeof search === 'string') {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role && typeof role === 'string' && role !== 'ALL') {
      where.role = { equals: role, mode: 'insensitive' };
    }
    if (seniority && typeof seniority === 'string' && seniority !== 'ALL') {
      where.seniority = { equals: seniority, mode: 'insensitive' };
    }
    if (companyId && typeof companyId === 'string') {
      where.companyId = companyId;
    }

    const contacts = await prisma.contact.findMany({
      where,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            domain: true,
            industry: true,
            city: true,
            leadScore: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ contacts, total: contacts.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function createContact(req: Request, res: Response) {
  try {
    const { companyId, fullName, email, phone, title, role, seniority, linkedinUrl, isPrimary } = req.body;
    if (!companyId || !fullName) {
      return res.status(400).json({ error: 'Company ID and Full Name are required' });
    }

    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || undefined;

    const contact = await prisma.contact.create({
      data: {
        companyId,
        fullName,
        firstName,
        lastName,
        email,
        phone,
        title,
        role: role || 'Operations',
        seniority: seniority || 'manager',
        linkedinUrl,
        isPrimary: Boolean(isPrimary),
        source: 'MANUAL',
      },
    });

    await prisma.leadActivity.create({
      data: {
        companyId,
        contactId: contact.id,
        type: 'STATUS_CHANGE',
        title: `Contact added: ${fullName}`,
        description: `${title || 'Decision Maker'} (${email || 'No email'})`,
      },
    });

    return res.status(201).json({ contact });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function updateContact(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { fullName, email, phone, title, role, seniority, linkedinUrl, isPrimary, isEmailVerified } = req.body;

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        fullName,
        email,
        phone,
        title,
        role,
        seniority,
        linkedinUrl,
        isPrimary,
        isEmailVerified,
      },
    });

    return res.json({ contact });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function enrichCompanyContacts(req: Request, res: Response) {
  try {
    const { companyId } = req.params;
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || !company.domain) {
      return res.status(400).json({ error: 'Company with valid domain is required' });
    }

    const people = await searchPeople({
      domain: company.domain,
      requiresEmail: true,
      limit: 3,
    });

    const added = [];
    for (const p of people) {
      const existing = await prisma.contact.findFirst({
        where: {
          companyId,
          OR: [
            ...(p.email ? [{ email: p.email }] : []),
            { fullName: { equals: p.fullName, mode: 'insensitive' as any } },
          ],
        },
      });

      if (!existing) {
        const contact = await prisma.contact.create({
          data: {
            companyId,
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
            source: 'ENRICHO_MCP',
          },
        });
        added.push(contact);
      }
    }

    return res.json({ success: true, count: added.length, contacts: added });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
