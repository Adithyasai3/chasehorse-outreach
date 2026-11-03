import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mock every external provider. No API keys or network needed. -------------------
const enrichoMock = vi.hoisted(() => ({
  searchCompanies: vi.fn(),
  enrichCompany: vi.fn(),
  searchPeople: vi.fn(),
  enrichPerson: vi.fn(),
}));
vi.mock('../src/integrations/enricho/enricho.service', async (orig) => ({ ...(await orig<object>()), ...enrichoMock }));

const geminiMock = vi.hoisted(() => ({ generate: vi.fn(), generateJson: vi.fn(), validateGeminiKey: vi.fn() }));
vi.mock('../src/integrations/gemini.client', () => geminiMock);

const googleMock = vi.hoisted(() => ({ sendGmail: vi.fn(), getThreadMessages: vi.fn(), createCalendarEvent: vi.fn() }));
vi.mock('../src/integrations/google.client', async (orig) => ({ ...(await orig<object>()), ...googleMock }));

import { prisma } from '../src/lib/prisma';
import { computeScore, FACTORS } from '../src/services/scoring.service';
import { newUser } from './helpers';

const company = (n: number) => ({
  providerId: `c_${n}`,
  name: `Freight Co ${n}`,
  domain: `freight${n}.example`,
  website: `https://freight${n}.example`,
  logoUrl: null,
  industry: 'Logistics',
  industries: ['Logistics'],
  categories: ['b2b'],
  description: 'Regional distributor of packaged foods.',
  employeeRange: '51-200',
  revenueRange: null,
  foundedYear: 2015,
  companyType: 'private',
  country: 'India',
  countryCode: 'IN',
  state: null,
  city: 'Pune',
  address: 'Pune, Maharashtra',
  phone: null,
  employeeCountMin: 51,
  employeeCountMax: 200,
  linkedinUrl: null,
  totalFunding: null,
  fundingStage: null,
  fundingDate: null,
  fundingRounds: [],
  keywords: ['distribution'],
  technologies: [],
  providerUpdatedAt: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  enrichoMock.searchCompanies.mockResolvedValue({
    toolName: 'company_search',
    records: [company(1), company(2), company(1)], // includes an in-page duplicate
    preview: true,
    totalItems: null,
    hasMore: true,
    nextPage: null,
    applied: ['Country'],
    notApplied: [],
    rawText: null,
  });
});

async function discoverAndSave(agent: Awaited<ReturnType<typeof newUser>>['agent']) {
  const search = await agent.post('/api/discovery/companies').send({ countries: ['IN'], keywords: ['food distribution'] });
  expect(search.status).toBe(200);
  const save = await agent.post('/api/discovery/save').send({ runId: search.body.runId, resultIndexes: [0] });
  expect(save.status).toBe(200);
  return { search: search.body, save: save.body };
}

describe('company discovery', () => {
  it('returns provider results, de-duplicates, and saves selected companies as leads', async () => {
    const { agent } = await newUser();
    const { search, save } = await discoverAndSave(agent);
    expect(search.companies).toHaveLength(2);
    expect(search.companies[0].existingCompanyId).toBeNull();
    expect(save.createdCount).toBe(1);

    const again = await agent.post('/api/discovery/companies').send({ countries: ['IN'] });
    expect(again.body.companies[0].existingCompanyId).toBe(save.saved[0].companyId);
    const resave = await agent.post('/api/discovery/save').send({ runId: again.body.runId, resultIndexes: [0] });
    expect(resave.body.createdCount).toBe(0);
    expect(resave.body.updatedCount).toBe(1);

    const companies = await agent.get('/api/companies');
    expect(companies.body.companies).toHaveLength(1);
    expect(companies.body.companies[0].source).toBe('ENRICHO');
  });

  it('loads the next page by passing next_page.arguments back unchanged', async () => {
    const { agent } = await newUser();
    enrichoMock.searchCompanies.mockResolvedValueOnce({
      toolName: 'company_search', records: [company(1)], preview: false, totalItems: 40, hasMore: true,
      nextPage: { cursor: 'opaque-1', industry: ['Logistics'] }, applied: ['Industry'], notApplied: [], rawText: null,
    });
    const first = await agent.post('/api/discovery/companies').send({ industries: ['Logistics'], preview: false, limit: 1 });
    expect(first.body.canLoadMore).toBe(true);
    enrichoMock.searchCompanies.mockResolvedValueOnce({
      toolName: 'company_search', records: [company(2)], preview: false, totalItems: 40, hasMore: false, nextPage: null, applied: [], notApplied: [], rawText: null,
    });
    const next = await agent.post('/api/discovery/next').send({ runId: first.body.runId });
    expect(next.status).toBe(200);
    expect(enrichoMock.searchCompanies.mock.calls[1][2]).toEqual({ cursor: 'opaque-1', industry: ['Logistics'] });
    expect(next.body.companies[0].resultIndex).toBe(1);
    expect(next.body.canLoadMore).toBe(false);
    // Saving works across pages by global index.
    const save = await agent.post('/api/discovery/save').send({ runId: first.body.runId, resultIndexes: [0, 1] });
    expect(save.body.createdCount).toBe(2);
  });

  it('cannot save from another user’s search run', async () => {
    const a = await newUser();
    const b = await newUser();
    const search = await a.agent.post('/api/discovery/companies').send({ countries: ['IN'] });
    const steal = await b.agent.post('/api/discovery/save').send({ runId: search.body.runId, resultIndexes: [0] });
    expect(steal.status).toBe(404);
  });

  it('surfaces provider errors instead of falling back to fake data', async () => {
    const { AppError } = await import('../src/lib/errors');
    enrichoMock.searchCompanies.mockRejectedValueOnce(new AppError('PROVIDER_RATE_LIMIT', 'Enricho rate limit reached.', { provider: 'ENRICHO' }));
    const { agent } = await newUser();
    const res = await agent.post('/api/discovery/companies').send({ countries: ['IN'] });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('PROVIDER_RATE_LIMIT');
  });
});

describe('contact enrichment', () => {
  it('saves people and records provider email certainty without claiming verification', async () => {
    const { agent } = await newUser();
    const { save } = await discoverAndSave(agent);
    const companyId = save.saved[0].companyId;
    const person = { providerId: 'p_42', fullName: 'Meera Iyer', firstName: 'Meera', lastName: 'Iyer', title: 'Head of Supply Chain', seniority: 'head', department: 'operations', linkedinUrl: null, location: 'Pune, India', imageUrl: null, email: null, emailType: null, phone: null, hasEmail: true, hasPhone: false, currentCompany: null };
    enrichoMock.searchPeople.mockResolvedValue({ toolName: 'person_search', records: [person], preview: true, totalItems: null, hasMore: false, nextPage: null, applied: ['Company'], notApplied: [], rawText: null });
    const found = await agent.post('/api/people/search').send({ companyId, seniority: ['head'], preview: true });
    expect(found.status).toBe(200);
    expect(enrichoMock.searchPeople.mock.calls[0][1]).toMatchObject({ companyDomains: ['freight1.example'], seniority: ['head'], preview: true });
    const saved = await agent.post('/api/people/save').send({ runId: found.body.runId, resultIndexes: [0] });
    const contact = saved.body.saved[0];
    expect(contact.email).toBeNull(); // previews never include contact details
    expect(contact.emailStatus).toBe('NONE');

    enrichoMock.enrichPerson.mockResolvedValueOnce({ ...person, email: 'Meera@freight1.example', emailType: 'work', phone: '+91 20 0000 0000' });
    const email = await agent.post(`/api/contacts/${contact.id}/find-email`).send({});
    expect(email.body.status).toBe('found');
    expect(email.body.contact).toMatchObject({ email: 'meera@freight1.example', emailStatus: 'PROVIDER_FOUND', emailCertainty: 'work', phone: '+91 20 0000 0000' });
    expect(enrichoMock.enrichPerson).toHaveBeenCalledWith(expect.any(String), 'p_42');

    const contact2 = await agent.post('/api/contacts').send({ companyId, fullName: 'Manual Person' });
    expect(contact2.body.contact.emailStatus).toBe('NONE');

    // A manually edited email is no longer a provider result.
    const edited = await agent.patch(`/api/contacts/${contact.id}`).send({ email: 'other@freight1.example' });
    expect(edited.body.contact.emailStatus).toBe('UNVERIFIED');
    expect(edited.body.contact.emailCertainty).toBeNull();
  });
});

describe('lead qualification', () => {
  it('treats missing data as neutral and never auto-rejects for it', () => {
    const factors = Object.entries(FACTORS).map(([key, f]) => ({ key: key as keyof typeof FACTORS, ...f, score: null, reasoning: '' }));
    const result = computeScore(factors);
    expect(result.score).toBe(50);
    expect(result.status).toBe('NEEDS_REVIEW');
    // Assessed poorly on most factors (only 2 missing): a genuine poor fit can still be NOT_A_FIT.
    const weak = computeScore(factors.map((f, i) => ({ ...f, score: i < 5 ? 1 : null })));
    expect(weak.score).toBe(16);
    expect(weak.status).toBe('NOT_A_FIT');
    // Same scores but 3+ factors missing: held for review rather than rejected.
    const sparse = computeScore(factors.map((f, i) => ({ ...f, score: i < 4 ? 1 : null })));
    expect(sparse.status).toBe('NEEDS_REVIEW');
  });

  it('scores with explainable factors and allows a manual override', async () => {
    const { agent } = await newUser();
    const { save } = await discoverAndSave(agent);
    const leadId = save.saved[0].leadId;
    const f = (score: number | null) => ({ score, reasoning: 'Based on description.' });
    geminiMock.generateJson.mockResolvedValueOnce({
      relevance: f(8), logisticsNeed: f(9), growthSignals: f(null), operationalComplexity: f(7), companySize: f(6), outreachOpportunity: f(7),
      strategy: 'Lead with inter-city distribution.',
    });
    const scored = await agent.post(`/api/leads/${leadId}/score`).send({});
    expect(scored.status).toBe(200);
    expect(scored.body.score.factors).toHaveLength(7);
    expect(scored.body.score.factors.find((x: any) => x.key === 'contactAvailability').computed).toBe(true);
    expect(scored.body.score.score).toBeGreaterThan(0);

    const override = await agent.post(`/api/leads/${leadId}/score/override`).send({ score: 30, status: 'NOT_A_FIT', reason: 'They run their own fleet.' });
    expect(override.status).toBe(200);
    const lead = await agent.get(`/api/leads/${leadId}`);
    expect(lead.body.lead.score).toBe(30);
    expect(lead.body.lead.scoreIsManual).toBe(true);
    expect(lead.body.lead.scores).toHaveLength(2);
  });
});

describe('email drafting, approval and sending', () => {
  it('generates a draft, requires approval, and sends through Gmail only when approved', async () => {
    const { agent } = await newUser();
    const { save } = await discoverAndSave(agent);
    const { companyId, leadId } = save.saved[0];
    const contact = (await agent.post('/api/contacts').send({ companyId, fullName: 'Ravi Kumar', email: 'ravi@freight1.example' })).body.contact;

    geminiMock.generateJson.mockResolvedValueOnce({ subject: 'Pune distribution', body: 'Hi Ravi,\n\nShort note.\n\nAsha', personalizationNotes: 'Used: city' });
    const gen = await agent.post('/api/emails/drafts/generate').send({ companyId, contactId: contact.id, objective: 'Book an intro call', tone: 'professional', length: 'short' });
    expect(gen.status).toBe(201);
    const draft = gen.body.draft;
    expect(draft.status).toBe('DRAFT');
    expect(draft.toEmail).toBe('ravi@freight1.example');
    expect(googleMock.sendGmail).not.toHaveBeenCalled();

    // Not approved yet.
    expect((await agent.post(`/api/emails/drafts/${draft.id}/send`).send({ confirm: true })).status).toBe(409);
    // Approve, then edit: approval must reset.
    expect((await agent.post(`/api/emails/drafts/${draft.id}/approve`).send({})).body.draft.status).toBe('APPROVED');
    expect((await agent.patch(`/api/emails/drafts/${draft.id}`).send({ body: 'Hi Ravi,\n\nEdited.\n\nAsha' })).body.draft.status).toBe('DRAFT');
    await agent.post(`/api/emails/drafts/${draft.id}/approve`).send({});

    // Sending requires explicit confirmation.
    expect((await agent.post(`/api/emails/drafts/${draft.id}/send`).send({})).status).toBe(400);

    googleMock.sendGmail.mockResolvedValueOnce({ from: 'me@company.example', messageId: 'gm-1', threadId: 'th-1' });
    const sent = await agent.post(`/api/emails/drafts/${draft.id}/send`).send({ confirm: true });
    expect(sent.status).toBe(200);
    expect(sent.body.draft.status).toBe('SENT');
    expect(googleMock.sendGmail).toHaveBeenCalledTimes(1);
    expect(googleMock.sendGmail.mock.calls[0][1].body).toContain('Edited.');

    // No double send.
    expect((await agent.post(`/api/emails/drafts/${draft.id}/send`).send({ confirm: true })).status).toBe(409);
    expect(googleMock.sendGmail).toHaveBeenCalledTimes(1);

    const lead = await agent.get(`/api/leads/${leadId}`);
    expect(lead.body.lead.stage).toBe('CONTACTED');
    expect(lead.body.lead.emailActs[0]).toMatchObject({ type: 'SENT', gmailMessageId: 'gm-1', gmailThreadId: 'th-1' });
  });

  it('records a failed send and blocks suppressed recipients', async () => {
    const { agent } = await newUser();
    const { save } = await discoverAndSave(agent);
    const { companyId } = save.saved[0];
    const contact = (await agent.post('/api/contacts').send({ companyId, fullName: 'Ravi', email: 'ravi@freight1.example' })).body.contact;
    geminiMock.generateJson.mockResolvedValue({ subject: 'S', body: 'B', personalizationNotes: '' });
    const d1 = (await agent.post('/api/emails/drafts/generate').send({ companyId, contactId: contact.id, objective: 'Intro call', tone: 'direct', length: 'short' })).body.draft;
    await agent.post(`/api/emails/drafts/${d1.id}/approve`).send({});

    const { AppError } = await import('../src/lib/errors');
    googleMock.sendGmail.mockRejectedValueOnce(new AppError('NOT_CONFIGURED', 'Connect Gmail', { provider: 'GOOGLE' }));
    const fail = await agent.post(`/api/emails/drafts/${d1.id}/send`).send({ confirm: true });
    expect(fail.status).toBe(412);
    const after = await agent.get(`/api/emails/drafts/${d1.id}`);
    expect(after.body.draft.status).toBe('FAILED');

    await agent.post('/api/suppression').send({ domain: 'freight1.example', reason: 'Asked not to be contacted' });
    await agent.patch(`/api/emails/drafts/${d1.id}`).send({ subject: 'S2' });
    await agent.post(`/api/emails/drafts/${d1.id}/approve`).send({});
    const blocked = await agent.post(`/api/emails/drafts/${d1.id}/send`).send({ confirm: true });
    expect(blocked.status).toBe(403);
    expect(googleMock.sendGmail).toHaveBeenCalledTimes(1);
  });

  it('detects replies in sent threads', async () => {
    const { agent, user } = await newUser();
    const { save } = await discoverAndSave(agent);
    await prisma.emailActivity.create({
      data: { userId: user.id, leadId: save.saved[0].leadId, companyId: save.saved[0].companyId, direction: 'OUTBOUND', type: 'SENT', gmailMessageId: 'm1', gmailThreadId: 't1', fromEmail: 'me@x.example', toEmail: 'ravi@freight1.example', subject: 'Hi' },
    });
    googleMock.getThreadMessages.mockResolvedValue([
      { id: 'm1', from: 'Me <me@x.example>', to: 'ravi@freight1.example', subject: 'Hi', snippet: '', internalDate: Date.now() },
      { id: 'm2', from: 'Ravi <ravi@freight1.example>', to: 'me@x.example', subject: 'Re: Hi', snippet: 'Sounds good', internalDate: Date.now() },
    ]);
    const r1 = await agent.post('/api/emails/sync-replies').send({});
    expect(r1.body.newReplies).toBe(1);
    const r2 = await agent.post('/api/emails/sync-replies').send({});
    expect(r2.body.newReplies).toBe(0);
  });
});

describe('CRM pipeline and follow-ups', () => {
  it('moves leads between stages and persists order', async () => {
    const { agent } = await newUser();
    const a = (await agent.post('/api/companies').send({ name: 'A Co', domain: 'a-co.example' })).body.lead;
    const b = (await agent.post('/api/companies').send({ name: 'B Co', domain: 'b-co.example' })).body.lead;
    await agent.post(`/api/leads/${a.id}/move`).send({ stage: 'QUALIFIED', index: 0 });
    await agent.post(`/api/leads/${b.id}/move`).send({ stage: 'QUALIFIED', index: 0 });
    const board = await agent.get('/api/leads/board');
    const qualified = board.body.columns.find((c: any) => c.key === 'QUALIFIED');
    expect(qualified.leads.map((l: any) => l.id)).toEqual([b.id, a.id]);
    const lead = await agent.get(`/api/leads/${a.id}`);
    expect(lead.body.lead.activities.some((x: any) => x.type === 'STAGE_CHANGED')).toBe(true);
    expect((await agent.post(`/api/leads/${a.id}/move`).send({ stage: 'NOPE', index: 0 })).status).toBe(400);
  });

  it('creates follow-ups, only touches the calendar when asked, and completes them', async () => {
    const { agent } = await newUser();
    const lead = (await agent.post('/api/companies').send({ name: 'F Co', domain: 'f-co.example' })).body.lead;
    const due = new Date(Date.now() - 3600 * 1000).toISOString(); // overdue
    const created = await agent.post('/api/followups').send({ leadId: lead.id, title: 'Check in', dueAt: due, kind: 'FOLLOW_UP' });
    expect(created.status).toBe(201);
    expect(googleMock.createCalendarEvent).not.toHaveBeenCalled();

    googleMock.createCalendarEvent.mockResolvedValueOnce({ id: 'ev1', htmlLink: 'https://calendar.google.com/x' });
    const meeting = await agent.post('/api/followups').send({ leadId: lead.id, title: 'Intro meeting', dueAt: new Date(Date.now() + 86400000).toISOString(), kind: 'MEETING', addToCalendar: true });
    expect(meeting.body.followUp.calendarEvent.googleEventId).toBe('ev1');
    expect((await agent.get(`/api/leads/${lead.id}`)).body.lead.stage).toBe('MEETING_SCHEDULED');

    const dash = await agent.get('/api/analytics/dashboard');
    expect(dash.body.totals.followUpsPending).toBe(2);
    expect(dash.body.meetings).toHaveLength(1);

    const done = await agent.patch(`/api/followups/${created.body.followUp.id}`).send({ status: 'COMPLETED' });
    expect(done.body.followUp.status).toBe('COMPLETED');
    expect((await agent.get('/api/analytics/dashboard')).body.totals.followUpsPending).toBe(1);
  });

  it('computes dashboard metrics from real records only', async () => {
    const { agent } = await newUser();
    const empty = await agent.get('/api/analytics/dashboard');
    expect(empty.body.totals).toMatchObject({ companies: 0, contacts: 0, sent: 0, qualified: 0 });
    await agent.post('/api/companies').send({ name: 'One', domain: 'one.example' });
    expect((await agent.get('/api/analytics/dashboard')).body.totals.companies).toBe(1);
  });
});
