'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Button, Empty, ErrorState, LinkButton, PageHeader, Select, TableSkeleton, useToast } from '@/components/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { relTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface Row {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  lastResearchedAt: string | null;
  _count: { research: number; contacts: number };
}

export default function ResearchPage() {
  const toast = useToast();
  const { integrations } = useSession();
  const [filter, setFilter] = useState('no');
  const { data, error, loading, reload } = useApi<{ companies: Row[] }>(`/companies${qs({ researched: filter })}`);
  const [running, setRunning] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const run = async (c: Row) => {
    setRunning(c.id);
    setErrors((e) => ({ ...e, [c.id]: '' }));
    try {
      await api.post(`/companies/${c.id}/research`);
      toast(`Research complete for ${c.name}`);
      await reload();
    } catch (err) {
      setErrors((e) => ({ ...e, [c.id]: errorMessage(err) }));
    } finally {
      setRunning(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Research"
        description="Gemini combines Enricho's profile with sourced web findings to assess each company's logistics needs. Each run is kept so you can compare over time."
      />
      {integrations && !integrations.gemini && (
        <div className="mb-4">
          <Alert tone="warn" title="Gemini is not connected" action={<LinkButton size="sm" variant="primary" href="/settings/integrations">Connect Gemini</LinkButton>}>
            Research needs your Gemini API key.
          </Alert>
        </div>
      )}
      <div className="mb-3">
        <Select className="w-52" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter">
          <option value="no">Waiting for research</option>
          <option value="yes">Already researched</option>
          <option value="">All companies</option>
        </Select>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <TableSkeleton />
      ) : !data?.companies.length ? (
        <Empty title={filter === 'no' ? 'Everything is researched' : 'No companies'} action={<LinkButton href="/discover">Discover companies</LinkButton>} />
      ) : (
        <div className="overflow-x-auto rounded border border-line bg-surface">
          <table className="data-table text-[13px]">
            <thead>
              <tr>
                <th>Company</th>
                <th>Industry</th>
                <th>Runs</th>
                <th>Last researched</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.companies.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/companies/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                    {c.domain && <div className="num text-[12px] text-ink-2">{c.domain}</div>}
                    {errors[c.id] && <div className="mt-1 text-[12px] text-bad">{errors[c.id]}</div>}
                  </td>
                  <td className="text-ink-2">{c.industry || '—'}</td>
                  <td className="num">{c._count.research}</td>
                  <td className="text-ink-2">{c.lastResearchedAt ? relTime(c.lastResearchedAt) : 'Never'}</td>
                  <td className="text-right">
                    {c.lastResearchedAt && <LinkButton size="sm" variant="ghost" href={`/companies/${c.id}`}>View</LinkButton>}
                    <Button size="sm" pending={running === c.id} disabled={Boolean(running) || (integrations ? !integrations.gemini : false)} onClick={() => run(c)}>
                      {c.lastResearchedAt ? 'Refresh' : 'Research'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
