'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DraftEditor, DraftStatusBadge, type Draft } from '@/components/draft-editor';
import { useSession } from '@/components/session';
import { Alert, Badge, Button, Empty, ErrorState, LinkButton, PageHeader, Panel, Select, Skeleton, Tabs, TableSkeleton, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, relTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface HistoryItem {
  id: string;
  type: 'SENT' | 'SEND_FAILED' | 'REPLY_RECEIVED';
  subject: string;
  toEmail: string;
  fromEmail: string;
  snippet: string | null;
  error: string | null;
  occurredAt: string;
  company: { id: string; name: string } | null;
  contact: { id: string; fullName: string } | null;
}

export default function OutreachPage() {
  const toast = useToast();
  const { integrations } = useSession();
  const [tab, setTab] = useState<'drafts' | 'history'>('drafts');
  const [status, setStatus] = useState('ALL');
  const drafts = useApi<{ drafts: Draft[] }>(`/emails/drafts?status=${status}`);
  const history = useApi<{ items: HistoryItem[] }>(tab === 'history' ? '/emails/history' : null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const open = drafts.data?.drafts.find((d) => d.id === openId) || null;

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.post<{ threadsChecked: number; newReplies: number }>('/emails/sync-replies');
      toast(`Checked ${r.threadsChecked} thread${r.threadsChecked === 1 ? '' : 's'}: ${r.newReplies} new repl${r.newReplies === 1 ? 'y' : 'ies'}`, 'info');
      history.reload();
    } catch (e) {
      toast(errorMessage(e), 'bad');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Emails"
        description="Review, edit and approve AI drafts, then send them from your Gmail. Replies to sent emails are detected automatically every few minutes."
        actions={<Button pending={syncing} disabled={!integrations?.gmail} onClick={sync}>Check for replies</Button>}
      />
      {integrations && !integrations.gmail && (
        <div className="mb-4">
          <Alert tone="warn" title="Gmail is not connected" action={<LinkButton size="sm" variant="primary" href="/settings/integrations">Connect Gmail</LinkButton>}>
            You can draft and approve emails now; sending needs your Gmail account.
          </Alert>
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'drafts', label: 'Drafts and approvals' }, { key: 'history', label: 'Sent and replies' }]} />

      {tab === 'drafts' && (
        <>
          <Select className="mb-3 w-48" value={status} onChange={(e) => { setStatus(e.target.value); setOpenId(null); }} aria-label="Status">
            <option value="ALL">All drafts</option>
            <option value="DRAFT">Needs review</option>
            <option value="APPROVED">Approved, not sent</option>
            <option value="FAILED">Failed to send</option>
            <option value="SENT">Sent</option>
          </Select>
          {drafts.error ? (
            <ErrorState message={drafts.error} onRetry={drafts.reload} />
          ) : drafts.loading && !drafts.data ? (
            <TableSkeleton />
          ) : !drafts.data?.drafts.length ? (
            <Empty title="No drafts" action={<LinkButton href="/leads">Go to leads</LinkButton>}>Generate drafts from a company page or in bulk from a campaign.</Empty>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
              <ul className="max-h-[75vh] divide-y divide-line overflow-y-auto rounded border border-line bg-surface">
                {drafts.data.drafts.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => setOpenId(d.id)} className={`w-full px-3 py-2.5 text-left ${openId === d.id ? 'bg-sunken' : 'hover:bg-sunken/60'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-medium">{d.company?.name}</span>
                        <DraftStatusBadge status={d.status} />
                      </div>
                      <p className="truncate text-[12px]">{d.subject}</p>
                      <p className="text-[11px] text-ink-3">{d.contact?.fullName || 'No contact'} · {relTime(d.updatedAt)}</p>
                    </button>
                  </li>
                ))}
              </ul>
              <Panel title={open ? <Link className="hover:underline" href={`/companies/${open.companyId}`}>{open.company?.name}</Link> : 'Select a draft'}>
                {open ? <DraftEditor draft={open} onChange={(d) => { drafts.reload(); setOpenId(d?.id || null); }} onClose={() => setOpenId(null)} /> : drafts.loading ? <Skeleton className="h-64" /> : <p className="text-[13px] text-ink-3">Choose a draft on the left to review it.</p>}
              </Panel>
            </div>
          )}
        </>
      )}

      {tab === 'history' &&
        (history.error ? (
          <ErrorState message={history.error} onRetry={history.reload} />
        ) : history.loading && !history.data ? (
          <TableSkeleton />
        ) : !history.data?.items.length ? (
          <Empty title="Nothing sent yet" />
        ) : (
          <div className="overflow-x-auto rounded border border-line bg-surface">
            <table className="data-table text-[13px]">
              <thead>
                <tr><th>When</th><th>Event</th><th>Company</th><th>Subject</th></tr>
              </thead>
              <tbody>
                {history.data.items.map((h) => (
                  <tr key={h.id}>
                    <td className="whitespace-nowrap text-ink-2">{fmtDateTime(h.occurredAt)}</td>
                    <td className="whitespace-nowrap">
                      {h.type === 'SENT' ? <Badge tone="good">Sent</Badge> : h.type === 'REPLY_RECEIVED' ? <Badge tone="accent">Reply</Badge> : <Badge tone="bad">Failed</Badge>}
                      <div className="num mt-0.5 text-[11px] text-ink-3">{h.type === 'REPLY_RECEIVED' ? h.fromEmail : h.toEmail}</div>
                    </td>
                    <td>{h.company ? <Link className="hover:underline" href={`/companies/${h.company.id}`}>{h.company.name}</Link> : '—'}{h.contact && <div className="text-[12px] text-ink-2">{h.contact.fullName}</div>}</td>
                    <td>
                      {h.subject}
                      {h.type === 'REPLY_RECEIVED' && h.snippet && <p className="text-[12px] text-ink-2">{h.snippet}</p>}
                      {h.error && <p className="text-[12px] text-bad">{h.error}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-line px-3 py-2 text-[11px] text-ink-3">Open and click tracking is not collected. Replies are detected by reading the Gmail threads of emails you sent.</p>
          </div>
        ))}
    </>
  );
}
