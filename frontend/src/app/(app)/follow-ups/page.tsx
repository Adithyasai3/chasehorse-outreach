'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Badge, Button, Empty, ErrorState, Input, Modal, PageHeader, Tabs, TableSkeleton, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, relTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

type Scope = 'overdue' | 'today' | 'upcoming' | 'completed';
interface FU {
  id: string;
  kind: 'FOLLOW_UP' | 'CALL' | 'MEETING';
  title: string;
  notes: string | null;
  dueAt: string;
  status: string;
  completedAt: string | null;
  lead: { id: string; stage: string; company: { id: string; name: string } };
  contact: { id: string; fullName: string; email: string | null } | null;
  calendarEvent: { htmlLink: string | null } | null;
}

export default function FollowUpsPage() {
  const toast = useToast();
  const { integrations } = useSession();
  const [scope, setScope] = useState<Scope>('overdue');
  const { data, error, loading, reload } = useApi<{ followUps: FU[] }>(`/followups?scope=${scope}`);
  const counts = {
    overdue: useApi<{ followUps: FU[] }>('/followups?scope=overdue'),
    today: useApi<{ followUps: FU[] }>('/followups?scope=today'),
  };
  const [busy, setBusy] = useState<string | null>(null);
  const [resched, setResched] = useState<FU | null>(null);
  const [newDue, setNewDue] = useState('');

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast(ok);
      await Promise.all([reload(), counts.overdue.reload(), counts.today.reload()]);
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Follow-ups" description="Scheduled follow-ups, calls and meetings across all leads. Follow-up emails are drafted on request and never sent automatically." />
      <Tabs
        value={scope}
        onChange={setScope}
        tabs={[
          { key: 'overdue', label: <>Overdue {counts.overdue.data && <span className="num text-bad">{counts.overdue.data.followUps.length}</span>}</> },
          { key: 'today', label: <>Today {counts.today.data && <span className="num">{counts.today.data.followUps.length}</span>}</> },
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'completed', label: 'Completed' },
        ]}
      />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <TableSkeleton cols={4} />
      ) : !data?.followUps.length ? (
        <Empty title={scope === 'overdue' ? 'Nothing overdue' : scope === 'today' ? 'Nothing due today' : 'Nothing here'}>Schedule follow-ups from a company page.</Empty>
      ) : (
        <ul className="divide-y divide-line rounded border border-line bg-surface">
          {data.followUps.map((f) => (
            <li key={f.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={f.kind === 'MEETING' ? 'accent' : 'neutral'}>{f.kind === 'FOLLOW_UP' ? 'Follow-up' : f.kind === 'CALL' ? 'Call' : 'Meeting'}</Badge>
                  <span className="font-medium">{f.title}</span>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-2">
                  <Link href={`/companies/${f.lead.company.id}`} className="underline">{f.lead.company.name}</Link>
                  {f.contact && ` · ${f.contact.fullName}`} · <span className={f.status === 'PENDING' && new Date(f.dueAt) < new Date() ? 'text-bad' : ''}>{fmtDateTime(f.dueAt)} ({relTime(f.dueAt)})</span>
                  {f.calendarEvent?.htmlLink && <> · <a href={f.calendarEvent.htmlLink} target="_blank" rel="noreferrer" className="underline">calendar</a></>}
                </p>
                {f.notes && <p className="mt-1 text-[12px] text-ink-2">{f.notes}</p>}
              </div>
              {f.status === 'PENDING' && (
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Button size="sm" variant="primary" pending={busy === `done-${f.id}`} onClick={() => act(`done-${f.id}`, () => api.patch(`/followups/${f.id}`, { status: 'COMPLETED' }), 'Marked complete')}>Complete</Button>
                  <Button size="sm" onClick={() => { setResched(f); setNewDue(''); }}>Reschedule</Button>
                  {!f.calendarEvent && integrations?.calendar && (
                    <Button size="sm" variant="ghost" pending={busy === `cal-${f.id}`} onClick={() => act(`cal-${f.id}`, () => api.post(`/followups/${f.id}/calendar`, { durationMinutes: 30 }), 'Added to Google Calendar')}>Add to calendar</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => act(`x-${f.id}`, () => api.patch(`/followups/${f.id}`, { status: 'CANCELLED' }), 'Cancelled')}>Cancel</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={Boolean(resched)}
        onClose={() => setResched(null)}
        title="Reschedule"
        footer={
          <>
            <Button onClick={() => setResched(null)}>Cancel</Button>
            <Button variant="primary" disabled={!newDue} onClick={() => resched && act('re', () => api.patch(`/followups/${resched.id}`, { dueAt: new Date(newDue).toISOString() }), 'Rescheduled').then(() => setResched(null))}>Save</Button>
          </>
        }
      >
        <Input type="datetime-local" value={newDue} onChange={(e) => setNewDue(e.target.value)} aria-label="New due date" />
        {resched?.calendarEvent && <p className="mt-2 text-[12px] text-ink-3">The existing Google Calendar event is not moved automatically; update it in Calendar.</p>}
      </Modal>
    </>
  );
}
