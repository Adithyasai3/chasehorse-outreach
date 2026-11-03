'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Empty, ErrorState, Input, LinkButton, Modal, PageHeader, ScoreChip, Select, StageBadge, TableSkeleton, useToast } from '@/components/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { fmtDate, QUAL_LABEL, relTime, STAGES } from '@/lib/format';
import { useApi, useDebounced } from '@/lib/hooks';

export interface LeadCard {
  id: string;
  stage: string;
  position: number;
  owner: string | null;
  score: number | null;
  qualificationStatus: string;
  scoreIsManual: boolean;
  estimatedValue: number | null;
  updatedAt: string;
  company: { id: string; name: string; domain: string | null; industry: string | null; city: string | null; country: string | null; employeeRange: string | null };
  primaryContact: { id: string; fullName: string; title: string | null; email: string | null } | null;
  followUps: { id: string; dueAt: string; title: string }[];
  _count: { drafts: number; emailActs: number; tasks: number };
}

export default function LeadsPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [status, setStatus] = useState('');
  const [owner, setOwner] = useState('');
  const [sort, setSort] = useState('updated');
  const q = useDebounced(search);
  const o = useDebounced(owner);
  const { data, error, loading, reload } = useApi<{ leads: LeadCard[] }>(`/leads${qs({ search: q, stage, status, owner: o, sort })}`);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('status')) setStatus(p.get('status') as string);
    if (p.get('stage')) setStage(p.get('stage') as string);
  }, []);
  const [selected, setSelected] = useState<string[]>([]);
  const [campaignOpen, setCampaignOpen] = useState(false);

  const bulkMove = async (target: string) => {
    if (!target) return;
    try {
      for (const id of selected) await api.post(`/leads/${id}/move`, { stage: target, index: 0 });
      toast(`Moved ${selected.length} lead${selected.length === 1 ? '' : 's'}`);
      setSelected([]);
      reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    }
  };

  return (
    <>
      <PageHeader title="Leads" description="One lead per saved company. Filter, sort and act on them in bulk." actions={<LinkButton href="/pipeline">Open board</LinkButton>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search company, industry or contact" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search leads" />
        <Select className="w-44" value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Stage">
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Select>
        <Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Qualification">
          <option value="">Any qualification</option>
          {Object.entries(QUAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Input className="w-36" placeholder="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner" />
        <Select className="w-40" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="updated">Recently updated</option>
          <option value="score">Highest score</option>
          <option value="name">Name A–Z</option>
        </Select>
      </div>
      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-line bg-sunken px-3 py-2 text-[13px]">
          <span className="num">{selected.length}</span> selected
          <Select className="w-44" value="" onChange={(e) => bulkMove(e.target.value)} aria-label="Move selected to stage">
            <option value="">Move to stage…</option>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
          <Button size="sm" onClick={() => setCampaignOpen(true)}>Add to campaign</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
        </div>
      )}
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <TableSkeleton />
      ) : !data?.leads.length ? (
        <Empty title="No leads match" action={<LinkButton href="/discover" variant="primary">Discover companies</LinkButton>} />
      ) : (
        <div className="overflow-x-auto rounded border border-line bg-surface">
          <table className="data-table text-[13px]">
            <thead>
              <tr>
                <th className="w-8">
                  <input type="checkbox" aria-label="Select all" className="accent-[var(--accent)]" checked={selected.length === data.leads.length} onChange={(e) => setSelected(e.target.checked ? data.leads.map((l) => l.id) : [])} />
                </th>
                <th>Company</th>
                <th>Primary contact</th>
                <th>Stage</th>
                <th>Score</th>
                <th>Owner</th>
                <th>Next follow-up</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.leads.map((l) => (
                <tr key={l.id}>
                  <td><input type="checkbox" aria-label={`Select ${l.company.name}`} className="accent-[var(--accent)]" checked={selected.includes(l.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, l.id] : s.filter((x) => x !== l.id)))} /></td>
                  <td>
                    <Link href={`/companies/${l.company.id}`} className="font-medium hover:underline">{l.company.name}</Link>
                    <div className="text-[12px] text-ink-2">{[l.company.industry, l.company.city].filter(Boolean).join(' · ') || l.company.domain}</div>
                  </td>
                  <td>{l.primaryContact ? <><div>{l.primaryContact.fullName}</div><div className="text-[12px] text-ink-2">{l.primaryContact.title}</div></> : <span className="text-ink-3">—</span>}</td>
                  <td><StageBadge stage={l.stage} /></td>
                  <td><ScoreChip score={l.score} status={l.qualificationStatus} manual={l.scoreIsManual} /></td>
                  <td className="text-ink-2">{l.owner || '—'}</td>
                  <td className="whitespace-nowrap">{l.followUps[0] ? <span className={new Date(l.followUps[0].dueAt) < new Date() ? 'text-bad' : ''}>{fmtDate(l.followUps[0].dueAt, { day: 'numeric', month: 'short' })}</span> : <span className="text-ink-3">—</span>}</td>
                  <td className="whitespace-nowrap text-ink-2">{relTime(l.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AddToCampaignModal open={campaignOpen} onClose={() => setCampaignOpen(false)} leadIds={selected} onDone={() => setSelected([])} />
    </>
  );
}

function AddToCampaignModal({ open, onClose, leadIds, onDone }: { open: boolean; onClose: () => void; leadIds: string[]; onDone: () => void }) {
  const toast = useToast();
  const { data } = useApi<{ campaigns: { id: string; name: string; status: string }[] }>(open ? '/campaigns' : null);
  const [id, setId] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (!id) return;
    setPending(true);
    try {
      const r = await api.post<{ enrolled: number }>(`/campaigns/${id}/leads`, { leadIds });
      toast(`Added ${r.enrolled} lead${r.enrolled === 1 ? '' : 's'} (already-enrolled leads skipped)`);
      onDone();
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add to campaign" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!id} pending={pending} onClick={submit}>Add {leadIds.length}</Button></>}>
      {data && !data.campaigns.length ? (
        <p className="text-[13px] text-ink-2">No campaigns yet. <Link href="/campaigns" className="underline">Create one</Link> first.</p>
      ) : (
        <Select value={id} onChange={(e) => setId(e.target.value)} aria-label="Campaign">
          <option value="">Choose a campaign</option>
          {data?.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status.toLowerCase()})</option>)}
        </Select>
      )}
    </Modal>
  );
}
