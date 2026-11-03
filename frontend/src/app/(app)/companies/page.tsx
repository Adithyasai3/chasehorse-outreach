'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Empty, ErrorState, Field, Input, LinkButton, Modal, PageHeader, ScoreChip, Select, Source, StageBadge, TableSkeleton, Textarea } from '@/components/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { relTime } from '@/lib/format';
import { useApi, useDebounced } from '@/lib/hooks';

interface Row {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  city: string | null;
  country: string | null;
  employeeRange: string | null;
  source: 'ENRICHO' | 'MANUAL';
  lastResearchedAt: string | null;
  updatedAt: string;
  leads: { id: string; stage: string; score: number | null; qualificationStatus: string }[];
  _count: { contacts: number; research: number };
}

export default function CompaniesPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [researched, setResearched] = useState('');
  const q = useDebounced(search);
  const { data, error, loading, reload } = useApi<{ companies: Row[] }>(`/companies${qs({ search: q, researched })}`);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Companies"
        description="Every company you have saved, from Enricho or entered by hand. Each one has a lead in your pipeline."
        actions={
          <>
            <Button onClick={() => setAddOpen(true)}>Add manually</Button>
            <LinkButton href="/discover" variant="primary">Discover companies</LinkButton>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search name, domain or industry" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search companies" />
        <Select className="w-44" value={researched} onChange={(e) => setResearched(e.target.value)} aria-label="Research status">
          <option value="">Any research status</option>
          <option value="yes">Researched</option>
          <option value="no">Not researched</option>
        </Select>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <TableSkeleton />
      ) : !data?.companies.length ? (
        <Empty title={q || researched ? 'No companies match' : 'No companies yet'} action={!q && <LinkButton variant="primary" href="/discover">Discover companies</LinkButton>}>
          {!q && !researched && 'Search Enricho for companies that fit your customer profile, then save the ones worth pursuing.'}
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded border border-line bg-surface">
          <table className="data-table text-[13px]">
            <thead>
              <tr>
                <th>Company</th>
                <th>Industry</th>
                <th>Location</th>
                <th>Size</th>
                <th>Contacts</th>
                <th>Stage</th>
                <th>Score</th>
                <th>Researched</th>
              </tr>
            </thead>
            <tbody>
              {data.companies.map((c) => {
                const lead = c.leads[0];
                return (
                  <tr key={c.id} className="cursor-pointer" onClick={() => router.push(`/companies/${c.id}`)}>
                    <td>
                      <Link href={`/companies/${c.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>{' '}
                      <Source kind={c.source === 'ENRICHO' ? 'enricho' : 'user'} />
                      {c.domain && <div className="num text-[12px] text-ink-2">{c.domain}</div>}
                    </td>
                    <td className="text-ink-2">{c.industry || '—'}</td>
                    <td className="text-ink-2">{[c.city, c.country].filter(Boolean).join(', ') || '—'}</td>
                    <td className="num">{c.employeeRange || '—'}</td>
                    <td className="num">{c._count.contacts}</td>
                    <td>{lead && <StageBadge stage={lead.stage} />}</td>
                    <td>{lead && <ScoreChip score={lead.score} status={lead.qualificationStatus} />}</td>
                    <td className="whitespace-nowrap text-ink-2">{c.lastResearchedAt ? relTime(c.lastResearchedAt) : <span className="text-ink-3">No</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <AddCompanyModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={(id) => router.push(`/companies/${id}`)} />
    </>
  );
}

function AddCompanyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ name: '', domain: '', industry: '', city: '', country: '', description: '' });
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (!f.name.trim()) return setErr('Company name is required.');
    if (f.domain && !/^(https?:\/\/)?(www\.)?[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(f.domain.trim())) return setErr('That domain looks wrong. Use something like example.com');
    setPending(true);
    setErr(null);
    try {
      const r = await api.post<{ company: { id: string } }>('/companies', f);
      onCreated(r.company.id);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add a company" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" pending={pending} onClick={submit}>Add company</Button></>}>
      <div className="space-y-3">
        {err && <Alert tone="bad">{err}</Alert>}
        <Field label="Company name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Website domain" hint="Needed for enrichment, people search and duplicate detection."><Input value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} placeholder="example.com" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Industry"><Input value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} /></Field>
          <Field label="City"><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
          <Field label="Country"><Input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} /></Field>
        </div>
        <Field label="What they do"><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
