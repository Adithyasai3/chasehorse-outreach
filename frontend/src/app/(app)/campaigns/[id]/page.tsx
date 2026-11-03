'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { DraftStatusBadge } from '@/components/draft-editor';
import { Alert, Badge, Button, Empty, ErrorState, KeyValue, Modal, PageHeader, Panel, ScoreChip, Select, Skeleton, StageBadge, useConfirm, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { campaignTone as statusTone, fmtDate, LENGTHS } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { CampaignStats } from '../page';

interface Detail {
  id: string;
  name: string;
  objective: string;
  description: string | null;
  tone: string;
  status: string;
  service: { name: string } | null;
  stats: CampaignStats;
  leads: { id: string; enrolledAt: string; lead: { id: string; stage: string; score: number | null; company: { id: string; name: string; domain: string | null }; primaryContact: { fullName: string; email: string | null } | null } }[];
  drafts: { id: string; leadId: string | null; status: 'DRAFT' | 'APPROVED' | 'SENT' | 'FAILED' | 'DISCARDED'; subject: string }[];
}

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { data, error, loading, reload } = useApi<{ campaign: Detail }>(`/campaigns/${id}`);
  const [length, setLength] = useState('short');
  const [busy, setBusy] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<{ created: number; skipped: { leadId: string; reason: string }[]; failed: { leadId: string; reason: string }[] } | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton className="h-96" />;
  if (!data) return null;
  const c = data.campaign;

  const setStatus = async (status: string) => {
    setBusy('status');
    try {
      await api.patch(`/campaigns/${c.id}`, { status });
      reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(null);
    }
  };
  const generate = async () => {
    const eligible = c.leads.filter((l) => l.lead.primaryContact?.email && !c.drafts.some((d) => d.leadId === l.lead.id && d.status !== 'DISCARDED')).length;
    if (!(await confirm('Generate drafts?', <>Gemini will write up to <strong>{eligible}</strong> personalised drafts using each company&apos;s latest research. Nothing is sent; every draft waits for your approval.</>, 'Generate drafts'))) return;
    setBusy('gen');
    try {
      setGenResult(await api.post(`/campaigns/${c.id}/generate-drafts`, { length }));
      reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!(await confirm('Delete campaign?', 'Leads and drafts are kept; only the campaign grouping is removed.', 'Delete', true))) return;
    await api.del(`/campaigns/${c.id}`);
    router.replace('/campaigns');
  };
  const nameOf = (leadId: string) => c.leads.find((l) => l.lead.id === leadId)?.lead.company.name || 'Lead';

  return (
    <>
      <PageHeader
        crumbs={[{ href: '/campaigns', label: 'Campaigns' }]}
        title={<span className="flex items-center gap-2">{c.name} <Badge tone={statusTone(c.status)}>{c.status.toLowerCase()}</Badge></span>}
        description={c.objective}
        actions={
          <>
            <Select className="w-36" value={c.status} disabled={busy === 'status'} onChange={(e) => setStatus(e.target.value)} aria-label="Campaign status">
              {['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'].map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
            </Select>
            <Button variant="danger" onClick={remove}>Delete</Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-5">
        {[
          ['Leads', c.stats.enrolled],
          ['Drafts to review', c.stats.drafts],
          ['Approved', c.stats.approved],
          ['Sent', c.stats.sent],
          ['Replied', c.stats.replyRate !== null ? `${c.stats.repliedThreads} (${c.stats.replyRate}%)` : c.stats.repliedThreads],
        ].map(([k, v]) => (
          <div key={k as string} className="bg-surface px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-ink-3">{k}</p>
            <p className="num mt-1 text-xl">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Panel title="Enrolled leads" actions={<Button size="sm" onClick={() => setEnrollOpen(true)}>Add leads</Button>} bodyClassName="p-0">
          {!c.leads.length ? (
            <div className="p-4"><Empty title="No leads enrolled" action={<Button onClick={() => setEnrollOpen(true)}>Add leads</Button>} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table text-[13px]">
                <thead><tr><th>Company</th><th>Contact</th><th>Stage</th><th>Score</th><th>Draft</th><th /></tr></thead>
                <tbody>
                  {c.leads.map(({ lead, id: enrollId }) => {
                    const d = c.drafts.find((x) => x.leadId === lead.id);
                    return (
                      <tr key={enrollId}>
                        <td><Link className="font-medium hover:underline" href={`/companies/${lead.company.id}`}>{lead.company.name}</Link></td>
                        <td>{lead.primaryContact ? <>{lead.primaryContact.fullName}{!lead.primaryContact.email && <div className="text-[11px] text-warn">no email</div>}</> : <span className="text-[12px] text-warn">no contact</span>}</td>
                        <td><StageBadge stage={lead.stage} /></td>
                        <td><ScoreChip score={lead.score} /></td>
                        <td>{d ? <Link href="/outreach" className="inline-flex"><DraftStatusBadge status={d.status} /></Link> : <span className="text-ink-3">—</span>}</td>
                        <td className="text-right"><Button size="sm" variant="ghost" onClick={async () => { await api.del(`/campaigns/${c.id}/leads/${lead.id}`); reload(); }}>Remove</Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel title="Generate drafts">
            <div className="space-y-3 text-[13px]">
              <p className="text-ink-2">Writes one draft per enrolled lead that has a primary contact with an email and no draft in this campaign yet.</p>
              <Select value={length} onChange={(e) => setLength(e.target.value)} aria-label="Length">
                {LENGTHS.map((l) => <option key={l}>{l}</option>)}
              </Select>
              <Button variant="primary" pending={busy === 'gen'} onClick={generate} disabled={!c.leads.length}>Generate drafts</Button>
              {genResult && (
                <Alert tone={genResult.failed.length ? 'warn' : 'good'} title={`${genResult.created} draft${genResult.created === 1 ? '' : 's'} created`}>
                  {[...genResult.skipped.map((s) => `${nameOf(s.leadId)}: skipped (${s.reason})`), ...genResult.failed.map((f) => `${nameOf(f.leadId)}: failed (${f.reason})`)].slice(0, 8).map((t) => <div key={t}>{t}</div>)}
                  {genResult.created > 0 && <Link href="/outreach" className="mt-1 inline-block underline">Review drafts</Link>}
                </Alert>
              )}
            </div>
          </Panel>
          <Panel title="Details">
            <KeyValue items={[['Service', c.service?.name || 'Any'], ['Tone', c.tone], ['Notes', c.description]]} />
          </Panel>
        </div>
      </div>
      <EnrollModal open={enrollOpen} onClose={() => setEnrollOpen(false)} campaignId={c.id} enrolled={c.leads.map((l) => l.lead.id)} onDone={reload} />
      {dialog}
    </>
  );
}

function EnrollModal({ open, onClose, campaignId, enrolled, onDone }: { open: boolean; onClose: () => void; campaignId: string; enrolled: string[]; onDone: () => void }) {
  const toast = useToast();
  const { data } = useApi<{ leads: { id: string; stage: string; score: number | null; qualificationStatus: string; company: { name: string }; primaryContact: { email: string | null } | null; updatedAt: string }[] }>(open ? '/leads?sort=score' : null);
  const [sel, setSel] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const available = data?.leads.filter((l) => !enrolled.includes(l.id)) || [];
  const submit = async () => {
    setPending(true);
    try {
      const r = await api.post<{ enrolled: number }>(`/campaigns/${campaignId}/leads`, { leadIds: sel });
      toast(`Enrolled ${r.enrolled}`);
      setSel([]);
      onDone();
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal wide open={open} onClose={onClose} title="Add leads to campaign" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!sel.length} pending={pending} onClick={submit}>Add {sel.length || ''}</Button></>}>
      {!data ? <Skeleton className="h-40" /> : !available.length ? <p className="text-[13px] text-ink-3">All your leads are already in this campaign.</p> : (
        <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded border border-line">
          {available.map((l) => (
            <li key={l.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] hover:bg-sunken/60">
                <input type="checkbox" className="accent-[var(--accent)]" checked={sel.includes(l.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, l.id] : s.filter((x) => x !== l.id)))} />
                <span className="flex-1 font-medium">{l.company.name}</span>
                {!l.primaryContact?.email && <span className="text-[11px] text-warn">no email</span>}
                <StageBadge stage={l.stage} />
                <ScoreChip score={l.score} status={l.qualificationStatus} />
                <span className="w-20 text-right text-[11px] text-ink-3">{fmtDate(l.updatedAt, { day: 'numeric', month: 'short' })}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
