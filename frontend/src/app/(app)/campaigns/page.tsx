'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Badge, Button, Empty, ErrorState, Field, Input, Modal, PageHeader, Select, TableSkeleton, Textarea } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { campaignTone as statusTone, relTime, TONES } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export interface CampaignStats { enrolled: number; drafts: number; approved: number; sent: number; repliedThreads: number; replyRate: number | null }
interface Campaign { id: string; name: string; objective: string; status: string; tone: string; updatedAt: string; service: { id: string; name: string } | null; stats: CampaignStats }


export default function CampaignsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi<{ campaigns: Campaign[] }>('/campaigns');
  const services = useApi<{ services: { id: string; name: string; isActive: boolean }[] }>('/services');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', objective: '', tone: 'professional', serviceId: '', description: '' });
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const create = async () => {
    if (!f.name.trim()) return setErr('Name the campaign.');
    if (f.objective.trim().length < 5) return setErr('Describe the objective; it is used to write every draft.');
    setPending(true);
    try {
      const r = await api.post<{ campaign: { id: string } }>('/campaigns', { ...f, serviceId: f.serviceId || null });
      router.push(`/campaigns/${r.campaign.id}`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Group leads around one objective and pitch, generate personalised drafts in bulk, and track sends and replies."
        actions={<Button variant="primary" onClick={() => setOpen(true)}>New campaign</Button>}
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <TableSkeleton cols={6} />
      ) : !data?.campaigns.length ? (
        <Empty title="No campaigns yet" action={<Button variant="primary" onClick={() => setOpen(true)}>New campaign</Button>}>
          For example: “Cold chain for dairy brands in Maharashtra”, with the cold chain service and a request for a site visit.
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded border border-line bg-surface">
          <table className="data-table text-[13px]">
            <thead>
              <tr><th>Campaign</th><th>Status</th><th>Leads</th><th>Drafts</th><th>Approved</th><th>Sent</th><th>Replies</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {data.campaigns.map((c) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => router.push(`/campaigns/${c.id}`)}>
                  <td>
                    <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                    <div className="max-w-md truncate text-[12px] text-ink-2">{c.service ? `${c.service.name} · ` : ''}{c.objective}</div>
                  </td>
                  <td><Badge tone={statusTone(c.status)}>{c.status.toLowerCase()}</Badge></td>
                  <td className="num">{c.stats.enrolled}</td>
                  <td className="num">{c.stats.drafts}</td>
                  <td className="num">{c.stats.approved}</td>
                  <td className="num">{c.stats.sent}</td>
                  <td className="num">{c.stats.repliedThreads}{c.stats.replyRate !== null && <span className="text-ink-3"> ({c.stats.replyRate}%)</span>}</td>
                  <td className="text-ink-2">{relTime(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New campaign" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" pending={pending} onClick={create}>Create</Button></>}>
        <div className="space-y-3">
          {err && <Alert tone="bad">{err}</Alert>}
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} /></Field>
          <Field label="Objective" hint="What every email in this campaign should achieve.">
            <Textarea rows={3} value={f.objective} onChange={(e) => setF({ ...f, objective: e.target.value })} placeholder="e.g. Offer a free audit of their inter-city freight costs and book a 20-minute call" maxLength={600} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Service to pitch">
              <Select value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}>
                <option value="">Any relevant service</option>
                {services.data?.services.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Tone">
              <Select value={f.tone} onChange={(e) => setF({ ...f, tone: e.target.value })}>
                {TONES.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Notes (optional)"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  );
}
