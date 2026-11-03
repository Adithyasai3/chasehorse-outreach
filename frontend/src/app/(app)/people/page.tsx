'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Empty, EmailStatus, ErrorState, Input, LinkButton, PageHeader, Select, Source, TableSkeleton } from '@/components/ui';
import { qs } from '@/lib/api';
import { relTime } from '@/lib/format';
import { useApi, useDebounced } from '@/lib/hooks';

interface Row {
  id: string;
  fullName: string;
  title: string | null;
  seniority: string | null;
  email: string | null;
  emailStatus: string;
  emailCertainty: string | null;
  linkedinUrl: string | null;
  source: 'ENRICHO' | 'MANUAL';
  updatedAt: string;
  company: { id: string; name: string; domain: string | null };
}

export default function PeoplePage() {
  const [search, setSearch] = useState('');
  const [hasEmail, setHasEmail] = useState('');
  const q = useDebounced(search);
  const { data, error, loading, reload } = useApi<{ contacts: Row[] }>(`/contacts${qs({ search: q, hasEmail })}`);
  return (
    <>
      <PageHeader
        title="People"
        description="Decision-makers saved across your companies. To find new people, open a company and use Find decision-makers."
        actions={<LinkButton href="/companies">Choose a company</LinkButton>}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search name, title or company" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search people" />
        <Select className="w-40" value={hasEmail} onChange={(e) => setHasEmail(e.target.value)} aria-label="Email filter">
          <option value="">Everyone</option>
          <option value="yes">Has an email</option>
        </Select>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <TableSkeleton />
      ) : !data?.contacts.length ? (
        <Empty title="No people yet">Open a saved company and search for its operations, supply-chain or procurement leaders.</Empty>
      ) : (
        <div className="overflow-x-auto rounded border border-line bg-surface">
          <table className="data-table text-[13px]">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Source</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.contacts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="font-medium">{c.fullName}</div>
                    <div className="text-[12px] text-ink-2">{c.title || '—'}</div>
                    {c.linkedinUrl && <a className="text-[11px] underline" href={c.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn</a>}
                  </td>
                  <td>
                    <Link className="hover:underline" href={`/companies/${c.company.id}`}>{c.company.name}</Link>
                  </td>
                  <td>
                    {c.email && <div className="num text-[12px]">{c.email}</div>}
                    <EmailStatus status={c.emailStatus} certainty={c.emailCertainty} />
                  </td>
                  <td><Source kind={c.source === 'ENRICHO' ? 'enricho' : 'user'} /></td>
                  <td className="text-ink-2">{relTime(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
