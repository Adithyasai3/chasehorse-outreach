'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { DraftEditor, DraftStatusBadge, GenerateDraftModal, type Draft } from '@/components/draft-editor';
import { FollowUpModal } from '@/components/followup-form';
import { ResearchView, type ResearchRecord } from '@/components/research-view';
import { useSession } from '@/components/session';
import {
  Alert, Badge, Button, Checkbox, ChipSelect, Empty, ErrorState, Field, Input, KeyValue, Modal, PageHeader, Panel, ScoreChip, Select, Skeleton, Source,
  StageBadge, Tabs, TagInput, Textarea, EmailStatus, useConfirm, useToast,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { ENRICHO_CREDITS_PER_RECORD, fmtDate, fmtDateTime, fmtMoney, QUAL_LABEL, relTime, SENIORITY, STAGES } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface Contact {
  id: string;
  fullName: string;
  title: string | null;
  seniority: string | null;
  department: string | null;
  email: string | null;
  emailStatus: string;
  emailCertainty: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  source: 'ENRICHO' | 'MANUAL';
  providerId: string | null;
  lastEnrichedAt: string | null;
}
interface Company {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  industries: string[];
  categories: string[];
  description: string | null;
  employeeRange: string | null;
  revenueRange: string | null;
  foundedYear: number | null;
  companyType: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  totalFunding: number | null;
  fundingStage: string | null;
  fundingDate: string | null;
  fundingRounds: { date: string | null; amount: string | null; type: string | null; from: string | null }[] | null;
  keywords: string[];
  technologies: string[];
  source: 'ENRICHO' | 'MANUAL';
  lastEnrichedAt: string | null;
  lastResearchedAt: string | null;
  createdAt: string;
  contacts: Contact[];
  leads: { id: string }[];
}
interface Factor { key: string; label: string; weight: number; score: number | null; reasoning: string; computed?: boolean }
interface Lead {
  id: string;
  stage: string;
  owner: string | null;
  score: number | null;
  qualificationStatus: string;
  scoreReasoning: string | null;
  outreachStrategy: string | null;
  scoreIsManual: boolean;
  estimatedValue: number | null;
  lostReason: string | null;
  primaryContactId: string | null;
  notes: { id: string; content: string; createdAt: string }[];
  tasks: { id: string; title: string; dueDate: string | null; status: 'OPEN' | 'DONE' }[];
  followUps: { id: string; title: string; kind: string; dueAt: string; status: string; contact: { fullName: string } | null; calendarEvent: { htmlLink: string | null } | null }[];
  scores: { id: string; score: number; status: string; reasoning: string; factors: Factor[] | null; strategy: string | null; source: 'AI' | 'MANUAL'; createdAt: string }[];
  activities: { id: string; type: string; title: string; details: string | null; createdAt: string }[];
  drafts: Draft[];
  emailActs: { id: string; direction: string; type: string; subject: string; toEmail: string; fromEmail: string; snippet: string | null; error: string | null; occurredAt: string }[];
}

type Tab = 'overview' | 'research' | 'people' | 'emails' | 'activity';

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { integrations } = useSession();
  const { confirm, dialog } = useConfirm();
  const companyQ = useApi<{ company: Company; research: ResearchRecord | null; researchHistory: { id: string; status: string; createdAt: string; errorMessage: string | null; model: string | null }[] }>(`/companies/${id}`);
  const leadId = companyQ.data?.company.leads[0]?.id;
  const leadQ = useApi<{ lead: Lead }>(leadId ? `/leads/${leadId}` : null);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewResearchId, setViewResearchId] = useState<string | null>(null);
  const [oldResearch, setOldResearch] = useState<ResearchRecord | null>(null);

  const reloadAll = useCallback(async () => {
    await companyQ.reload();
    await leadQ.reload();
  }, [companyQ, leadQ]);

  const action = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setActionError(null);
    try {
      await fn();
      toast(ok);
      await reloadAll();
    } catch (err) {
      setActionError(errorMessage(err));
      await reloadAll();
    } finally {
      setBusy(null);
    }
  };

  if (companyQ.error) return <ErrorState message={companyQ.error} onRetry={companyQ.reload} />;
  if (!companyQ.data)
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-4 w-60" />
        <div className="grid gap-6 pt-4 lg:grid-cols-[1fr_340px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );

  const { company, research, researchHistory } = companyQ.data;
  const lead = leadQ.data?.lead;
  const shownResearch = viewResearchId && oldResearch ? oldResearch : research;

  const remove = async () => {
    if (!(await confirm(`Delete ${company.name}?`, 'This removes the company, its contacts, research, drafts and pipeline history. Sent emails stay in your Gmail.', 'Delete company', true))) return;
    await api.del(`/companies/${company.id}`);
    toast('Company deleted');
    router.replace('/companies');
  };

  return (
    <>
      <PageHeader
        crumbs={[{ href: '/companies', label: 'Companies' }]}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {company.name}
            {lead && <StageBadge stage={lead.stage} />}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            {company.domain && (
              <a href={`https://${company.domain}`} target="_blank" rel="noreferrer" className="num hover:underline">
                {company.domain}
              </a>
            )}
            <Source kind={company.source === 'ENRICHO' ? 'enricho' : 'user'} />
            <span className="text-ink-3">added {fmtDate(company.createdAt)}</span>
          </span>
        }
        actions={
          <>
            <Button
              variant="primary"
              pending={busy === 'research'}
              disabled={integrations ? !integrations.gemini : false}
              title={integrations && !integrations.gemini ? 'Connect Gemini first' : undefined}
              onClick={() => action('research', () => api.post(`/companies/${company.id}/research`), 'Research complete').then(() => setTab('research'))}
            >
              {research ? 'Refresh research' : 'Research with AI'}
            </Button>
            {company.domain && (
              <Button pending={busy === 'enrich'} disabled={integrations ? !integrations.enricho : false} onClick={() => action('enrich', () => api.post(`/companies/${company.id}/enrich`), 'Updated from Enricho')} title="Full record: 5 Enricho credits if new to your account">
                Refresh from Enricho
              </Button>
            )}
            <Button variant="danger" onClick={remove}>
              Delete
            </Button>
          </>
        }
      />
      {actionError && (
        <div className="mb-4">
          <Alert tone="bad">{actionError}</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'overview', label: 'Overview' },
              { key: 'research', label: <>Research {research && <span className="num text-ink-3">· {relTime(research.createdAt)}</span>}</> },
              { key: 'people', label: <>People <span className="num text-ink-3">{company.contacts.length}</span></> },
              { key: 'emails', label: <>Emails <span className="num text-ink-3">{lead?.drafts.length ?? 0}</span></> },
              { key: 'activity', label: 'Activity' },
            ]}
          />

          {tab === 'overview' && <Overview company={company} onSaved={reloadAll} />}

          {tab === 'research' && (
            <div className="space-y-4">
              {researchHistory.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="text-ink-3">History:</span>
                  {researchHistory.map((h, i) => (
                    <button
                      key={h.id}
                      disabled={h.status === 'FAILED'}
                      title={h.errorMessage || undefined}
                      onClick={async () => {
                        if (i === 0 || h.id === research?.id) {
                          setViewResearchId(null);
                          return;
                        }
                        const r = await api.get<{ research: ResearchRecord }>(`/companies/${company.id}/research/${h.id}`);
                        setOldResearch(r.research);
                        setViewResearchId(h.id);
                      }}
                      className={`rounded-sm border px-1.5 py-0.5 ${(viewResearchId || research?.id) === h.id ? 'border-ink' : 'border-line-strong'} ${h.status === 'FAILED' ? 'text-bad line-through' : ''}`}
                    >
                      {fmtDate(h.createdAt, { day: 'numeric', month: 'short' })}
                    </button>
                  ))}
                </div>
              )}
              {shownResearch ? (
                <ResearchView research={shownResearch} />
              ) : (
                <Empty
                  title="Not researched yet"
                  action={
                    <Button variant="primary" pending={busy === 'research'} onClick={() => action('research', () => api.post(`/companies/${company.id}/research`), 'Research complete')}>
                      Research with AI
                    </Button>
                  }
                >
                  Gemini will read the Enricho data, search the web for sourced facts, and analyse logistics needs. Facts, cited findings and AI interpretation are kept separate.
                </Empty>
              )}
            </div>
          )}

          {tab === 'people' && <PeoplePanel company={company} leadId={lead?.id} primaryContactId={lead?.primaryContactId || null} onChanged={reloadAll} />}

          {tab === 'emails' && lead && <EmailsPanel company={company} lead={lead} onChanged={reloadAll} />}

          {tab === 'activity' && lead && <ActivityPanel lead={lead} />}
        </div>

        <aside className="space-y-4">{lead ? <CrmPanel lead={lead} contacts={company.contacts} onChanged={reloadAll} /> : <Skeleton className="h-96" />}</aside>
      </div>
      {dialog}
    </>
  );
}

// --- Overview -----------------------------------------------------------------------

function Overview({ company: c, onSaved }: { company: Company; onSaved: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: c.name, industry: c.industry || '', description: c.description || '', city: c.city || '', country: c.country || '', employeeRange: c.employeeRange || '' });
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const src = c.source === 'ENRICHO' ? 'enricho' : 'user';
  const save = async () => {
    if (!form.name.trim()) return setErr('Name is required.');
    setPending(true);
    try {
      await api.patch(`/companies/${c.id}`, form);
      toast('Company updated');
      setEditing(false);
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="space-y-4">
      <Panel
        title={<span className="flex items-center gap-2">Company profile <Source kind={src} /></span>}
        actions={<Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}
      >
        {c.description && <p className="mb-4 max-w-3xl text-[14px] leading-relaxed">{c.description}</p>}
        <KeyValue
          items={[
            ['Industry', [c.industry, ...c.industries.filter((i) => i !== c.industry)].filter(Boolean).join(', ') || null],
            ['Categories', c.categories.length ? c.categories.join(', ') : null],
            ['Address', c.address || [c.city, c.state, c.country].filter(Boolean).join(', ') || null],
            ['Phone', c.phone && <span className="num">{c.phone}</span>],
            ['Employees', c.employeeRange && <span className="num">{c.employeeRange}</span>],
            ['Revenue', c.revenueRange && <span className="num">{c.revenueRange}</span>],
            ['Founded', c.foundedYear && <span className="num">{c.foundedYear}</span>],
            ['Type', c.companyType],
            ['LinkedIn', c.linkedinUrl && <a className="underline" href={c.linkedinUrl} target="_blank" rel="noreferrer">Profile</a>],
            ['Data last refreshed', c.lastEnrichedAt ? fmtDateTime(c.lastEnrichedAt) : 'Never from a provider'],
          ]}
        />
      </Panel>
      <Panel title={<span className="flex items-center gap-2">Funding <Source kind={src} /></span>}>
        {c.totalFunding || c.fundingRounds?.length ? (
          <>
            <KeyValue
              items={[
                ['Total raised', c.totalFunding ? <span className="num">{fmtMoney(c.totalFunding)}</span> : null],
                ['Latest stage', c.fundingStage?.replace(/_/g, ' ')],
                ['Latest round date', c.fundingDate ? fmtDate(c.fundingDate) : null],
              ]}
            />
            {c.fundingRounds && c.fundingRounds.length > 0 && (
              <table className="data-table mt-3 text-[12px]">
                <thead>
                  <tr><th>Date</th><th>Round</th><th>Amount</th><th>Investors</th></tr>
                </thead>
                <tbody>
                  {c.fundingRounds.map((r, i) => (
                    <tr key={i}>
                      <td className="num">{r.date ? fmtDate(r.date) : '—'}</td>
                      <td>{r.type?.replace(/_/g, ' ') || '—'}</td>
                      <td className="num">{r.amount || '—'}</td>
                      <td>{r.from || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <p className="text-[13px] text-ink-3">Enricho does not provide funding data. Research with AI may find funding news from cited web sources.</p>
        )}
      </Panel>
      {(c.keywords.length > 0 || c.technologies.length > 0) && (
        <Panel title={<span className="flex items-center gap-2">Signals <Source kind={src} /></span>}>
          <KeyValue items={[['Keywords', c.keywords.join(', ') || null], ['Technologies', c.technologies.join(', ') || null]]} />
        </Panel>
      )}
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit company" footer={<><Button onClick={() => setEditing(false)}>Cancel</Button><Button variant="primary" pending={pending} onClick={save}>Save</Button></>}>
        <div className="space-y-3">
          {err && <Alert tone="bad">{err}</Alert>}
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Industry"><Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></Field>
          <Field label="Description"><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="Country"><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
            <Field label="Employees"><Input value={form.employeeRange} onChange={(e) => setForm({ ...form, employeeRange: e.target.value })} /></Field>
          </div>
          <p className="text-[12px] text-ink-3">A later refresh from Enricho will overwrite provider fields.</p>
        </div>
      </Modal>
    </div>
  );
}

// --- People -------------------------------------------------------------------------

interface PersonResult {
  resultIndex: number;
  providerId: string;
  fullName: string;
  title: string | null;
  seniority: string | null;
  department: string | null;
  linkedinUrl: string | null;
  location: string | null;
  email: string | null;
  emailType: string | null;
  phone: string | null;
  hasEmail: boolean | null;
  hasPhone: boolean | null;
  existingContactId: string | null;
}
interface PeopleRun {
  runId: string;
  toolName: string;
  preview: boolean;
  totalItems: number | null;
  hasMore: boolean | null;
  canLoadMore: boolean;
  notApplied: { filter: string; reason: string }[];
  people: PersonResult[];
}

function PeoplePanel({ company, leadId, primaryContactId, onChanged }: { company: Company; leadId?: string; primaryContactId: string | null; onChanged: () => void }) {
  const toast = useToast();
  const { integrations } = useSession();
  const { confirm, dialog } = useConfirm();
  const [titles, setTitles] = useState<string[]>(['operations', 'supply chain', 'logistics', 'procurement']);
  const [seniority, setSeniority] = useState<string[]>(['founder', 'c_suite', 'vp', 'head', 'director']);
  const [roles, setRoles] = useState<string[]>([]);
  const [hasEmail, setHasEmail] = useState(true);
  const [limit, setLimit] = useState('5');
  const [results, setResults] = useState<PeopleRun | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const cost = Number(limit) * ENRICHO_CREDITS_PER_RECORD;

  const search = async (preview: boolean) => {
    if (!preview && !(await confirm('Run a full people search?', <>Full records include contact details when Enricho has them, at <strong>{ENRICHO_CREDITS_PER_RECORD} credits per new person</strong>: up to <strong className="num">{cost}</strong> credits for this page. Empty results are free.</>, 'Run full search'))) return;
    setBusy(preview ? 'preview' : 'full');
    setError(null);
    setSelected([]);
    try {
      setResults(await api.post<PeopleRun>('/people/search', { companyId: company.id, titles, seniority, roles, hasEmail, preview, limit: Number(limit) }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const more = async () => {
    if (!results || !(await confirm('Load more people?', <>Up to <strong className="num">{cost}</strong> credits.</>, 'Load more'))) return;
    setBusy('more');
    try {
      const next = await api.post<{ canLoadMore: boolean; people: PersonResult[] }>('/people/next', { runId: results.runId });
      setResults({ ...results, canLoadMore: next.canLoadMore, people: [...results.people, ...next.people] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    if (!results) return;
    setBusy('save');
    try {
      await api.post('/people/save', { runId: results.runId, resultIndexes: selected });
      toast(`Saved ${selected.length} contact${selected.length === 1 ? '' : 's'}`);
      setResults(null);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const fetchDetails = async (c: Contact) => {
    if (!(await confirm(`Get ${c.fullName}'s contact details?`, `Enricho returns the full record, including email and phone when on file, for ${ENRICHO_CREDITS_PER_RECORD} credits if it is new to your account. Unmatched lookups are free.`, 'Get details'))) return;
    setBusy(`email-${c.id}`);
    try {
      const r = await api.post<{ status: string; message?: string }>(`/contacts/${c.id}/find-email`);
      toast(r.status === 'found' ? 'Contact details added' : r.message || 'No email on file', r.status === 'found' ? 'good' : 'info');
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(null);
    }
  };
  const makePrimary = async (c: Contact) => {
    if (!leadId) return;
    await api.patch(`/leads/${leadId}`, { primaryContactId: c.id });
    toast(`${c.fullName} is now the primary contact`);
    onChanged();
  };
  const remove = async (c: Contact) => {
    if (!(await confirm(`Remove ${c.fullName}?`, 'The contact will be deleted from this company.', 'Remove', true))) return;
    await api.del(`/contacts/${c.id}`);
    onChanged();
  };

  return (
    <div className="space-y-4">
      <Panel title="Saved contacts" actions={<Button size="sm" onClick={() => setAddOpen(true)}>Add manually</Button>} bodyClassName="p-0">
        {company.contacts.length === 0 ? (
          <p className="p-4 text-[13px] text-ink-3">No contacts yet. Search Enricho below or add someone you already know.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table text-[13px]">
              <thead>
                <tr><th>Name</th><th>Email and phone</th><th>Source</th><th /></tr>
              </thead>
              <tbody>
                {company.contacts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="font-medium">
                        {c.fullName} {c.id === primaryContactId && <Badge tone="accent">Primary</Badge>}
                      </div>
                      <div className="text-[12px] text-ink-2">{c.title || '—'}</div>
                      {c.linkedinUrl && <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="text-[11px] underline">LinkedIn</a>}
                    </td>
                    <td>
                      {c.email && <div className="num text-[12px]">{c.email}</div>}
                      <EmailStatus status={c.emailStatus} certainty={c.emailCertainty} />
                      {c.phone && <div className="num text-[12px] text-ink-2">{c.phone}</div>}
                    </td>
                    <td><Source kind={c.source === 'ENRICHO' ? 'enricho' : 'user'} /></td>
                    <td className="whitespace-nowrap text-right">
                      {!c.email && c.providerId && (
                        <Button size="sm" pending={busy === `email-${c.id}`} onClick={() => fetchDetails(c)}>Get contact details</Button>
                      )}
                      {c.id !== primaryContactId && <Button size="sm" variant="ghost" onClick={() => makePrimary(c)}>Make primary</Button>}
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-bad" onClick={() => remove(c)}>Remove</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={<span className="flex items-center gap-2">Find decision-makers <Source kind="enricho" /></span>}>
        {!company.domain ? (
          <p className="text-[13px] text-ink-3">People search needs the company domain. Edit the company to add one.</p>
        ) : (
          <div className="space-y-3">
            <Field label="Job title contains"><TagInput value={titles} onChange={setTitles} placeholder="e.g. operations" /></Field>
            <Field label="Seniority"><ChipSelect options={SENIORITY} value={seniority} onChange={setSeniority} /></Field>
            <Field label="Job function" hint="Optional, e.g. operations, procurement."><TagInput value={roles} onChange={setRoles} /></Field>
            <Checkbox checked={hasEmail} onChange={setHasEmail} label="Only people with an email on file" />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" pending={busy === 'preview'} disabled={Boolean(busy) || (integrations ? !integrations.enricho : false)} onClick={() => search(true)}>Free preview</Button>
              <Select className="w-20" value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="People per page">
                {['3', '5', '10', '25'].map((n) => <option key={n}>{n}</option>)}
              </Select>
              <Button pending={busy === 'full'} disabled={Boolean(busy) || (integrations ? !integrations.enricho : false)} onClick={() => search(false)}>Full search · up to {cost} credits</Button>
            </div>
            <p className="text-[12px] text-ink-3">Previews show up to 3 people without contact details. Full records include email and phone when Enricho has them.</p>
            {error && <Alert tone="bad">{error}</Alert>}
            {results && results.notApplied.length > 0 && <Alert tone="warn">{results.notApplied.map((n) => `${n.filter}: ${n.reason}`).join('. ')}</Alert>}
            {results &&
              (results.people.length === 0 ? (
                <Empty title="Nobody matched">Try fewer title keywords, more seniority levels, or untick the email filter. Empty searches are free.</Empty>
              ) : (
                <div className="rounded border border-line">
                  <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[12px] text-ink-2">
                    <span className="flex items-center gap-2">
                      {results.preview ? <Badge tone="info">Free preview</Badge> : <Badge tone="accent">Full records</Badge>}
                      {results.people.length}{results.totalItems !== null && ` of ${results.totalItems}`} · via <span className="num">{results.toolName}</span>
                    </span>
                    <Button size="sm" variant="primary" disabled={!selected.length} pending={busy === 'save'} onClick={save}>Save {selected.length || ''}</Button>
                  </div>
                  <ul className="divide-y divide-line">
                    {results.people.map((p) => (
                      <li key={p.resultIndex} className="flex items-start gap-3 px-3 py-2 text-[13px]">
                        <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={selected.includes(p.resultIndex)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.resultIndex] : s.filter((x) => x !== p.resultIndex)))} aria-label={`Select ${p.fullName}`} />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{p.fullName} {p.existingContactId && <Badge>Saved</Badge>}</div>
                          <div className="text-[12px] text-ink-2">{[p.title, p.seniority, p.department, p.location].filter(Boolean).join(' · ')}</div>
                          {(p.email || p.phone) ? (
                            <div className="num text-[12px]">{[p.email, p.phone].filter(Boolean).join(' · ')}</div>
                          ) : results.preview && (p.hasEmail !== null || p.hasPhone !== null) ? (
                            <div className="text-[11px] text-ink-3">On file at Enricho: {[p.hasEmail ? 'email' : null, p.hasPhone ? 'phone' : null].filter(Boolean).join(', ') || 'no email or phone'}</div>
                          ) : null}
                        </div>
                        {p.linkedinUrl && <a href={p.linkedinUrl} target="_blank" rel="noreferrer" className="text-[12px] underline">LinkedIn</a>}
                      </li>
                    ))}
                  </ul>
                  {results.preview && results.hasMore && (
                    <p className="border-t border-line px-3 py-2 text-[12px] text-ink-2">More people match. Run a full search to see them with contact details.</p>
                  )}
                  {results.canLoadMore && (
                    <div className="border-t border-line px-3 py-2 text-right">
                      <Button size="sm" pending={busy === 'more'} onClick={more}>Load more · up to {cost} credits</Button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </Panel>
      <ContactModal open={addOpen || Boolean(editing)} contact={editing} companyId={company.id} onClose={() => { setAddOpen(false); setEditing(null); }} onSaved={onChanged} />
      {dialog}
    </div>
  );
}

function ContactModal({ open, contact, companyId, onClose, onSaved }: { open: boolean; contact: Contact | null; companyId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ fullName: '', title: '', email: '', phone: '', linkedinUrl: '' });
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lastId, setLastId] = useState<string | null | undefined>(undefined);
  if (open && lastId !== (contact?.id ?? null)) {
    setLastId(contact?.id ?? null);
    setForm({ fullName: contact?.fullName || '', title: contact?.title || '', email: contact?.email || '', phone: contact?.phone || '', linkedinUrl: contact?.linkedinUrl || '' });
    setErr(null);
  }
  const submit = async () => {
    if (!form.fullName.trim()) return setErr('Name is required.');
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return setErr('That email address looks wrong.');
    if (form.linkedinUrl && !/^https?:\/\//.test(form.linkedinUrl)) return setErr('LinkedIn URL must start with https://');
    setPending(true);
    try {
      if (contact) await api.patch(`/contacts/${contact.id}`, form);
      else await api.post('/contacts', { ...form, companyId });
      onSaved();
      onClose();
      setLastId(undefined);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open={open} onClose={() => { onClose(); setLastId(undefined); }} title={contact ? 'Edit contact' : 'Add contact'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" pending={pending} onClick={submit}>Save</Button></>}>
      <div className="space-y-3">
        {err && <Alert tone="bad">{err}</Alert>}
        <Field label="Full name"><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
        <Field label="Job title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Email" hint={contact?.emailStatus === 'PROVIDER_FOUND' ? 'Changing this replaces the Enricho result and marks it unverified.' : 'Manually entered emails are marked unverified.'}>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="LinkedIn URL"><Input value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} /></Field>
        </div>
      </div>
    </Modal>
  );
}

// --- Emails -------------------------------------------------------------------------

function EmailsPanel({ company, lead, onChanged }: { company: Company; lead: Lead; onChanged: () => void }) {
  const [genOpen, setGenOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(lead.drafts.find((d) => d.status !== 'SENT')?.id || null);
  const open = lead.drafts.find((d) => d.id === openId) || null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-2">Drafts are never sent automatically. Approve a draft, then send it from your Gmail.</p>
        <Button variant="primary" onClick={() => setGenOpen(true)}>New AI draft</Button>
      </div>
      {lead.drafts.length === 0 ? (
        <Empty title="No drafts yet">Research the company first for better personalisation, then generate a draft.</Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
          <ul className="divide-y divide-line rounded border border-line bg-surface">
            {lead.drafts.map((d) => (
              <li key={d.id}>
                <button onClick={() => setOpenId(d.id)} className={`w-full px-3 py-2 text-left ${openId === d.id ? 'bg-sunken' : 'hover:bg-sunken/60'}`}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-[13px] font-medium">{d.subject}</span><DraftStatusBadge status={d.status} /></div>
                  <div className="text-[11px] text-ink-3">{d.contact?.fullName || 'No contact'} · {relTime(d.updatedAt)}</div>
                </button>
              </li>
            ))}
          </ul>
          <Panel>{open ? <DraftEditor draft={{ ...open, company: { id: company.id, name: company.name } }} onChange={(d) => { if (d) setOpenId(d.id); onChanged(); }} onClose={() => setOpenId(null)} /> : <p className="text-[13px] text-ink-3">Select a draft.</p>}</Panel>
        </div>
      )}
      {lead.emailActs.length > 0 && (
        <Panel title={<span className="flex items-center gap-2">Email history <Source kind="gmail" /></span>} bodyClassName="p-0">
          <table className="data-table text-[13px]">
            <thead><tr><th>When</th><th>Event</th><th>Subject</th></tr></thead>
            <tbody>
              {lead.emailActs.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-ink-2">{fmtDateTime(e.occurredAt)}</td>
                  <td className="whitespace-nowrap">
                    {e.type === 'SENT' ? <Badge tone="good">Sent to {e.toEmail}</Badge> : e.type === 'REPLY_RECEIVED' ? <Badge tone="accent">Reply from {e.fromEmail}</Badge> : <Badge tone="bad">Send failed</Badge>}
                  </td>
                  <td>{e.subject}{e.snippet && e.type === 'REPLY_RECEIVED' && <div className="text-[12px] text-ink-2">{e.snippet}</div>}{e.error && <div className="text-[12px] text-bad">{e.error}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      <GenerateDraftModal open={genOpen} onClose={() => setGenOpen(false)} companyId={company.id} contacts={company.contacts} defaultContactId={lead.primaryContactId} onCreated={(d) => { setOpenId(d.id); onChanged(); }} />
    </div>
  );
}

// --- Activity -----------------------------------------------------------------------

function ActivityPanel({ lead }: { lead: Lead }) {
  if (!lead.activities.length) return <Empty title="No activity yet" />;
  return (
    <ol className="space-y-0 border-l border-line-strong pl-4">
      {lead.activities.map((a) => (
        <li key={a.id} className="relative pb-4">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border border-line-strong bg-surface" />
          <p className="text-[13px] font-medium">{a.title}</p>
          {a.details && <p className="text-[12px] text-ink-2">{a.details}</p>}
          <p className="text-[11px] text-ink-3">{fmtDateTime(a.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}

// --- CRM side panel -----------------------------------------------------------------

function CrmPanel({ lead, contacts, onChanged }: { lead: Lead; contacts: Contact[]; onChanged: () => void }) {
  const toast = useToast();
  const { integrations } = useSession();
  const [owner, setOwner] = useState(lead.owner || '');
  const [value, setValue] = useState(lead.estimatedValue?.toString() || '');
  const [note, setNote] = useState('');
  const [task, setTask] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [fuOpen, setFuOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [showFactors, setShowFactors] = useState(false);
  const latest = lead.scores[0];

  const go = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast(ok);
      onChanged();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Panel title="Pipeline">
        <div className="space-y-3">
          <Field label="Stage">
            <Select value={lead.stage} onChange={(e) => go('stage', () => api.post(`/leads/${lead.id}/move`, { stage: e.target.value, index: 0 }), 'Stage updated')}>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Owner">
              <Input value={owner} onChange={(e) => setOwner(e.target.value)} onBlur={() => owner !== (lead.owner || '') && go('owner', () => api.patch(`/leads/${lead.id}`, { owner: owner.trim() || null }), 'Owner saved')} placeholder="Unassigned" />
            </Field>
            <Field label="Est. value (USD)">
              <Input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))} onBlur={() => value !== (lead.estimatedValue?.toString() || '') && go('value', () => api.patch(`/leads/${lead.id}`, { estimatedValue: value ? Number(value) : null }), 'Value saved')} />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel
        title={<span className="flex items-center gap-2">Qualification <ScoreChip score={lead.score} status={lead.qualificationStatus} manual={lead.scoreIsManual} /></span>}
        actions={<Button size="sm" variant="ghost" onClick={() => setOverrideOpen(true)}>Adjust</Button>}
      >
        <div className="space-y-3 text-[13px]">
          <p className="font-medium">{QUAL_LABEL[lead.qualificationStatus]}</p>
          {lead.scoreReasoning && <p className="text-ink-2">{lead.scoreReasoning}</p>}
          {latest?.factors && (
            <div>
              <button className="text-[12px] underline" onClick={() => setShowFactors((v) => !v)}>{showFactors ? 'Hide' : 'Show'} how this was scored</button>
              {showFactors && (
                <ul className="mt-2 space-y-2">
                  {latest.factors.map((f) => (
                    <li key={f.key}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium">{f.label}</span>
                        <span className="num text-[12px]">{f.score === null ? 'n/a' : `${f.score}/10`} <span className="text-ink-3">×{f.weight}</span></span>
                      </div>
                      <div className="mt-0.5 h-1 rounded-sm bg-sunken"><div className="h-1 rounded-sm bg-ink-2" style={{ width: `${(f.score ?? 0) * 10}%` }} /></div>
                      <p className="mt-0.5 text-[11px] text-ink-2">{f.reasoning} {f.computed ? <Source kind="user">computed</Source> : <Source kind="ai" />}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {lead.outreachStrategy && (
            <div className="rounded-sm bg-sunken p-2 text-[12px]"><span className="font-medium">Strategy</span> <Source kind="ai" /><p className="mt-1 text-ink-2">{lead.outreachStrategy}</p></div>
          )}
          <Button size="sm" pending={busy === 'score'} disabled={integrations ? !integrations.gemini : false} onClick={() => go('score', () => api.post(`/leads/${lead.id}/score`), 'Lead scored')}>
            {lead.score === null ? 'Score with AI' : 'Re-score'}
          </Button>
        </div>
      </Panel>

      <Panel title="Follow-ups" actions={<Button size="sm" onClick={() => setFuOpen(true)}>Schedule</Button>}>
        {lead.followUps.filter((f) => f.status === 'PENDING').length === 0 ? (
          <p className="text-[13px] text-ink-3">Nothing scheduled.</p>
        ) : (
          <ul className="space-y-2 text-[13px]">
            {lead.followUps.filter((f) => f.status === 'PENDING').map((f) => {
              const overdue = new Date(f.dueAt) < new Date();
              return (
                <li key={f.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{f.title}</p>
                    <p className={`text-[12px] ${overdue ? 'text-bad' : 'text-ink-2'}`}>{fmtDateTime(f.dueAt)}{overdue && ' · overdue'}{f.contact && ` · ${f.contact.fullName}`}</p>
                    {f.calendarEvent?.htmlLink && <a href={f.calendarEvent.htmlLink} target="_blank" rel="noreferrer" className="text-[11px] underline">On calendar</a>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => go(`fu-${f.id}`, () => api.patch(`/followups/${f.id}`, { status: 'COMPLETED' }), 'Marked done')}>Done</Button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Tasks">
        <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!task.trim()) return; void go('task', () => api.post('/tasks', { leadId: lead.id, title: task.trim(), dueDate: taskDue || null })).then(() => { setTask(''); setTaskDue(''); }); }}>
          <Input value={task} onChange={(e) => setTask(e.target.value)} placeholder="Add a task" maxLength={300} />
          <Input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className="w-36" aria-label="Due date" />
        </form>
        <ul className="space-y-1 text-[13px]">
          {lead.tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <input type="checkbox" className="accent-[var(--accent)]" checked={t.status === 'DONE'} onChange={(e) => go(`t-${t.id}`, () => api.patch(`/tasks/${t.id}`, { done: e.target.checked }))} aria-label={t.title} />
              <span className={`flex-1 ${t.status === 'DONE' ? 'text-ink-3 line-through' : ''}`}>{t.title}</span>
              {t.dueDate && <span className="num text-[11px] text-ink-3">{fmtDate(t.dueDate, { day: 'numeric', month: 'short' })}</span>}
              <button className="text-[12px] text-ink-3 hover:text-bad" aria-label="Delete task" onClick={() => go(`td-${t.id}`, () => api.del(`/tasks/${t.id}`))}>×</button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Notes">
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (!note.trim()) return; void go('note', () => api.post(`/leads/${lead.id}/notes`, { content: note.trim() }), 'Note added').then(() => setNote('')); }}>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you learn?" maxLength={5000} />
          <Button size="sm" type="submit" pending={busy === 'note'} disabled={!note.trim()}>Add note</Button>
        </form>
        <ul className="mt-3 space-y-3 text-[13px]">
          {lead.notes.map((n) => (
            <li key={n.id} className="group">
              <p className="whitespace-pre-wrap">{n.content}</p>
              <p className="text-[11px] text-ink-3">{fmtDateTime(n.createdAt)} <button className="ml-2 hidden text-bad group-hover:inline" onClick={() => go(`n-${n.id}`, () => api.del(`/notes/${n.id}`))}>Delete</button></p>
            </li>
          ))}
        </ul>
      </Panel>

      <FollowUpModal open={fuOpen} onClose={() => setFuOpen(false)} leadId={lead.id} contacts={contacts} onCreated={onChanged} />
      <OverrideModal open={overrideOpen} onClose={() => setOverrideOpen(false)} lead={lead} onSaved={onChanged} />
    </>
  );
}

function OverrideModal({ open, onClose, lead, onSaved }: { open: boolean; onClose: () => void; lead: Lead; onSaved: () => void }) {
  const toast = useToast();
  const [score, setScore] = useState(String(lead.score ?? 50));
  const [status, setStatus] = useState(lead.qualificationStatus === 'UNSCORED' ? 'NEEDS_REVIEW' : lead.qualificationStatus);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    const n = Number(score);
    if (!Number.isInteger(n) || n < 0 || n > 100) return setErr('Score must be a whole number from 0 to 100.');
    if (reason.trim().length < 3) return setErr('Explain the change so teammates understand it.');
    setPending(true);
    try {
      await api.post(`/leads/${lead.id}/score/override`, { score: n, status, reason: reason.trim() });
      toast('Score updated');
      onSaved();
      onClose();
      setReason('');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Adjust score" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" pending={pending} onClick={submit}>Save</Button></>}>
      <div className="space-y-3">
        {err && <Alert tone="bad">{err}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Score (0–100)"><Input inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value.replace(/[^\d]/g, ''))} /></Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="QUALIFIED">Qualified</option>
              <option value="NEEDS_REVIEW">Needs review</option>
              <option value="NOT_A_FIT">Not a fit</option>
            </Select>
          </Field>
        </div>
        <Field label="Reason"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Spoke to their COO; they run an in-house fleet." /></Field>
        {lead.scores.length > 0 && (
          <div>
            <p className="mb-1 text-[12px] font-medium text-ink-2">History</p>
            <ul className="space-y-1 text-[12px]">
              {lead.scores.map((s) => (
                <li key={s.id} className="flex gap-2"><span className="num w-8">{s.score}</span><span className="w-14">{s.source === 'AI' ? 'AI' : 'Manual'}</span><span className="flex-1 truncate text-ink-2" title={s.reasoning}>{s.reasoning}</span><span className="text-ink-3">{fmtDate(s.createdAt, { day: 'numeric', month: 'short' })}</span></li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
