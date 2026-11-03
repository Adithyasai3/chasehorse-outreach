import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { currentUser } from '../middleware/auth';
import { parse } from '../middleware/common';
import { createManualCompany, getOwnedCompany, serializeCompany } from '../services/companies.service';
import * as discovery from '../services/discovery.service';
import * as leads from '../services/leads.service';
import * as people from '../services/people.service';
import * as research from '../services/research.service';
import * as scoring from '../services/scoring.service';

const id = z.string().uuid();
const optStr = (max = 500) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const strList = (max = 20) => z.array(z.string().trim().min(1).max(100)).max(max).optional();

// --- Discovery ---------------------------------------------------------------------

// Enricho validates enum values itself (bands etc.); we only bound sizes and shapes here.
const searchSchema = z
  .object({
    query: z.string().trim().max(250).optional(),
    industries: strList(),
    keywords: strList(),
    countries: z.array(z.string().trim().length(2)).max(20).optional(),
    cityNames: strList(10),
    employees: z.array(z.string().trim().min(1).max(20)).max(12).optional(),
    names: strList(),
    domains: z.array(z.string().trim().min(3).max(253)).max(100).optional(),
    preview: z.boolean().default(true),
    limit: z.number().int().min(1).max(100).default(10),
  })
  .refine(
    (f) => Boolean(f.query || f.industries?.length || f.keywords?.length || f.countries?.length || f.cityNames?.length || f.employees?.length || f.names?.length || f.domains?.length),
    { message: 'Add at least one filter.' }
  );

export async function searchCompanies(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  res.json(await discovery.runCompanySearch(userId, parse(searchSchema, req.body)));
}

export async function nextCompanyPage(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const { runId } = parse(z.object({ runId: id }), req.body);
  res.json(await discovery.loadNextPage(userId, runId));
}

export async function saveFromRun(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const body = parse(z.object({ runId: id, resultIndexes: z.array(z.number().int().min(0).max(5000)).min(1).max(100) }), req.body);
  res.json(await discovery.saveFromRun(userId, body.runId, body.resultIndexes));
}

export async function searchRuns(req: Request, res: Response) {
  res.json({ runs: await discovery.listRuns(currentUser(req).id) });
}

// --- Companies ---------------------------------------------------------------------

export async function listCompanies(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  const researched = req.query.researched === 'yes' ? { not: null } : req.query.researched === 'no' ? null : undefined;
  const companies = await prisma.company.findMany({
    where: {
      userId,
      ...(researched !== undefined ? { lastResearchedAt: researched } : {}),
      ...(search
        ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { domain: { contains: search, mode: 'insensitive' } }, { industry: { contains: search, mode: 'insensitive' } }] }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: 500,
    include: { leads: { select: { id: true, stage: true, score: true, qualificationStatus: true } }, _count: { select: { contacts: true, research: true } } },
  });
  res.json({ companies: companies.map(serializeCompany) });
}

const manualCompanySchema = z.object({
  name: z.string().trim().min(1).max(200),
  domain: optStr(253),
  website: optStr(500),
  industry: optStr(120),
  description: optStr(2000),
  city: optStr(120),
  country: optStr(120),
  employeeRange: optStr(30),
});

export async function createCompany(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const result = await createManualCompany(userId, parse(manualCompanySchema, req.body));
  res.status(201).json({ company: serializeCompany(result.company), lead: result.lead });
}

export async function getCompany(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const companyId = parse(id, req.params.id);
  const company = await prisma.company.findFirst({
    where: { id: companyId, userId },
    include: { contacts: { orderBy: { createdAt: 'asc' } }, leads: { select: { id: true, stage: true, score: true, qualificationStatus: true } } },
  });
  if (!company) throw notFound('Company');
  const [latest, history] = await Promise.all([research.latestResearch(userId, companyId), research.researchHistory(userId, companyId)]);
  res.json({ company: serializeCompany(company), research: latest, researchHistory: history });
}

export async function getResearch(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const r = await prisma.companyResearch.findFirst({ where: { id: parse(id, req.params.researchId), userId, companyId: parse(id, req.params.id) } });
  if (!r) throw notFound('Research');
  res.json({ research: r });
}

export async function updateCompany(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const companyId = parse(id, req.params.id);
  await getOwnedCompany(userId, companyId);
  const body = parse(manualCompanySchema.partial().omit({ domain: true }), req.body);
  const company = await prisma.company.update({ where: { id: companyId }, data: body });
  res.json({ company: serializeCompany(company) });
}

export async function deleteCompany(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const companyId = parse(id, req.params.id);
  await getOwnedCompany(userId, companyId);
  await prisma.company.delete({ where: { id: companyId } });
  res.json({ ok: true });
}

export async function enrichCompany(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const company = await discovery.refreshCompanyFromProvider(userId, parse(id, req.params.id));
  res.json({ company: serializeCompany(company) });
}

export async function researchCompany(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const r = await research.runResearch(userId, parse(id, req.params.id));
  res.json({ research: r });
}

// --- People ------------------------------------------------------------------------

const SENIORITY = ['c_suite', 'vp', 'director', 'head', 'manager', 'founder', 'owner', 'partner', 'senior', 'entry'] as const;

export async function searchPeople(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const body = parse(
    z.object({
      companyId: id,
      titles: strList(10),
      seniority: z.array(z.enum(SENIORITY)).optional(),
      roles: strList(10),
      hasEmail: z.boolean().optional(),
      preview: z.boolean().default(true),
      limit: z.number().int().min(1).max(50).default(5),
    }),
    req.body
  );
  res.json(await people.searchPeopleAtCompany(userId, body));
}

export async function nextPeoplePage(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const { runId } = parse(z.object({ runId: id }), req.body);
  res.json(await people.loadNextPeoplePage(userId, runId));
}

export async function savePeople(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const body = parse(z.object({ runId: id, resultIndexes: z.array(z.number().int().min(0).max(5000)).min(1).max(50) }), req.body);
  res.json(await people.savePeopleFromRun(userId, body.runId, body.resultIndexes));
}

export async function findEmail(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  res.json(await people.findEmailForContact(userId, parse(id, req.params.id)));
}

export async function listContacts(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  const hasEmail = req.query.hasEmail === 'yes';
  const contacts = await prisma.contact.findMany({
    where: {
      userId,
      ...(hasEmail ? { email: { not: null } } : {}),
      ...(search
        ? { OR: [{ fullName: { contains: search, mode: 'insensitive' } }, { title: { contains: search, mode: 'insensitive' } }, { company: { name: { contains: search, mode: 'insensitive' } } }] }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: 500,
    include: { company: { select: { id: true, name: true, domain: true } } },
  });
  res.json({ contacts });
}

const contactSchema = z.object({
  companyId: id,
  fullName: z.string().trim().min(1).max(200),
  title: optStr(200),
  email: z.string().trim().email().max(254).optional().nullable().or(z.literal('').transform(() => null)),
  phone: optStr(40),
  linkedinUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal('').transform(() => null)),
});

export async function createContact(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  res.status(201).json({ contact: await people.createManualContact(userId, parse(contactSchema, req.body)) });
}

export async function updateContact(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const body = parse(contactSchema.omit({ companyId: true }).partial(), req.body);
  res.json({ contact: await people.updateContact(userId, parse(id, req.params.id), body) });
}

export async function deleteContact(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const r = await prisma.contact.deleteMany({ where: { id: parse(id, req.params.id), userId } });
  if (!r.count) throw notFound('Contact');
  res.json({ ok: true });
}

// --- Leads -------------------------------------------------------------------------

const stageEnum = z.enum(['NEW_LEAD', 'RESEARCHING', 'QUALIFIED', 'CONTACTED', 'FOLLOW_UP', 'MEETING_SCHEDULED', 'NEGOTIATION', 'WON', 'LOST']);
const statusEnum = z.enum(['UNSCORED', 'QUALIFIED', 'NEEDS_REVIEW', 'NOT_A_FIT']);

export async function listLeads(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const q = parse(
    z.object({
      search: z.string().trim().max(100).optional(),
      stage: stageEnum.optional(),
      status: statusEnum.optional(),
      owner: z.string().trim().max(100).optional(),
      minScore: z.coerce.number().int().min(0).max(100).optional(),
      sort: z.enum(['updated', 'score', 'name']).optional(),
    }),
    req.query
  );
  res.json({ leads: await leads.listLeads(userId, q), stages: leads.STAGES });
}

export async function board(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const q = parse(z.object({ search: z.string().trim().max(100).optional(), owner: z.string().trim().max(100).optional() }), req.query);
  res.json({ columns: await leads.board(userId, q) });
}

export async function getLead(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const lead = await leads.getLead(userId, parse(id, req.params.id));
  const latest = await research.latestResearch(userId, lead.companyId);
  res.json({ lead: { ...lead, company: serializeCompany(lead.company) }, research: latest, factors: scoring.FACTORS });
}

export async function updateLead(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const body = parse(
    z.object({
      owner: optStr(100),
      estimatedValue: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
      lostReason: optStr(500),
      primaryContactId: id.optional().nullable(),
    }),
    req.body
  );
  res.json({ lead: await leads.updateLead(userId, parse(id, req.params.id), body) });
}

export async function moveLead(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const body = parse(z.object({ stage: stageEnum, index: z.number().int().min(0).max(10000) }), req.body);
  res.json({ lead: await leads.moveLead(userId, parse(id, req.params.id), body.stage, body.index) });
}

export async function deleteLead(req: Request, res: Response) {
  await leads.deleteLead(currentUser(req).id, parse(id, req.params.id));
  res.json({ ok: true });
}

export async function scoreLead(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  res.json({ score: await scoring.scoreLead(userId, parse(id, req.params.id)) });
}

export async function overrideScore(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const body = parse(z.object({ score: z.number().int().min(0).max(100), status: statusEnum.exclude(['UNSCORED']), reason: z.string().trim().min(3).max(1000) }), req.body);
  res.json({ score: await scoring.overrideScore(userId, parse(id, req.params.id), body.score, body.status, body.reason) });
}

export async function addNote(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const { content } = parse(z.object({ content: z.string().trim().min(1).max(5000) }), req.body);
  res.status(201).json({ note: await leads.addNote(userId, parse(id, req.params.id), content) });
}

export async function deleteNote(req: Request, res: Response) {
  await leads.deleteNote(currentUser(req).id, parse(id, req.params.noteId));
  res.json({ ok: true });
}

// --- Tasks -------------------------------------------------------------------------

export async function listTasks(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const tasks = await prisma.task.findMany({
    where: { userId, ...(req.query.status === 'done' ? { status: 'DONE' } : req.query.status === 'all' ? {} : { status: 'OPEN' }) },
    orderBy: [{ status: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }],
    take: 300,
    include: { lead: { select: { id: true, company: { select: { name: true } } } } },
  });
  res.json({ tasks });
}

export async function createTask(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const body = parse(z.object({ leadId: id.optional().nullable(), title: z.string().trim().min(1).max(300), dueDate: z.coerce.date().optional().nullable() }), req.body);
  res.status(201).json({ task: await leads.addTask(userId, body) });
}

export async function updateTask(req: Request, res: Response) {
  const { id: userId } = currentUser(req);
  const { done } = parse(z.object({ done: z.boolean() }), req.body);
  res.json({ task: await leads.setTaskStatus(userId, parse(id, req.params.id), done) });
}

export async function deleteTask(req: Request, res: Response) {
  await leads.deleteTask(currentUser(req).id, parse(id, req.params.id));
  res.json({ ok: true });
}

export function assertOwnership(found: unknown, what: string) {
  if (!found) throw new AppError('NOT_FOUND', `${what} not found`);
}
