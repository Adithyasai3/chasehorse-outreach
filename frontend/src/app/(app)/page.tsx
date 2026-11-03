'use client';

import Link from 'next/link';
import { HBarList } from '@/components/charts';
import { useSession } from '@/components/session';
import { Badge, ErrorState, LinkButton, PageHeader, Panel, ScoreChip, Skeleton, StageBadge } from '@/components/ui';
import { fmtDateTime, relTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface FU { id: string; title: string; dueAt: string; lead: { id: string; company: { id: string; name: string } }; calendarEvent?: { htmlLink: string | null } | null }
interface Dashboard {
  totals: { companies: number; researched: number; contacts: number; contactsWithEmail: number; qualified: number; draftsOpen: number; sent: number; replies: number; followUpsPending: number; meetingsUpcoming: number };
  byStage: { key: string; label: string; count: number }[];
  overdue: FU[];
  today: FU[];
  meetings: FU[];
  recent: { id: string; title: string; details: string | null; createdAt: string; company: { id: string; name: string } | null }[];
  tasks: { id: string; title: string; dueDate: string | null; lead: { id: string; company: { id: string; name: string } } | null }[];
  needsAction: { id: string; stage: string; score: number | null; company: { id: string; name: string }; _count: { drafts: number } }[];
}

function Setup() {
  const { integrations } = useSession();
  if (!integrations || (integrations.enricho && integrations.gemini && integrations.gmail)) return null;
  const steps = [
    { done: integrations.enricho, label: 'Connect Enricho', why: 'to find companies and decision-makers' },
    { done: integrations.gemini, label: 'Add a Gemini API key', why: 'for research, scoring and drafting' },
    { done: integrations.gmail, label: 'Connect Gmail', why: 'to send approved emails and see replies' },
  ];
  return (
    <Panel title="Finish setting up" className="mb-6" actions={<LinkButton size="sm" variant="primary" href="/settings/integrations">Open integrations</LinkButton>}>
      <ol className="grid gap-2 text-[13px] md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.label} className="flex gap-2">
            <span className={`num mt-px text-[12px] ${s.done ? 'text-good' : 'text-ink-3'}`}>{s.done ? 'done' : `0${i + 1}`}</span>
            <span className={s.done ? 'text-ink-3 line-through' : ''}>
              <span className="font-medium">{s.label}</span> <span className="text-ink-2">{s.why}</span>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function FollowUpRow({ f, overdue }: { f: FU; overdue?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
      <span className="min-w-0 truncate">
        <Link className="font-medium hover:underline" href={`/companies/${f.lead.company.id}`}>
          {f.lead.company.name}
        </Link>{' '}
        <span className="text-ink-2">{f.title}</span>
      </span>
      <span className={`shrink-0 text-[12px] ${overdue ? 'text-bad' : 'text-ink-2'}`}>{overdue ? relTime(f.dueAt) : fmtDateTime(f.dueAt)}</span>
    </li>
  );
}

export default function DashboardPage() {
  const { user } = useSession();
  const { data, error, loading, reload } = useApi<Dashboard>('/analytics/dashboard');

  if (error) return <ErrorState message={error} onRetry={reload} />;
  const t = data?.totals;
  const ledger: [string, number | undefined, string, string?][] = [
    ['Companies', t?.companies, '/companies', t ? `${t.researched} researched` : undefined],
    ['Contacts', t?.contacts, '/people', t ? `${t.contactsWithEmail} with email` : undefined],
    ['Qualified', t?.qualified, '/leads?status=QUALIFIED'],
    ['Drafts to review', t?.draftsOpen, '/outreach'],
    ['Emails sent', t?.sent, '/outreach', t ? `${t.replies} replies` : undefined],
    ['Follow-ups due', t?.followUpsPending, '/follow-ups', t ? `${t.meetingsUpcoming} meetings this week` : undefined],
  ];

  return (
    <>
      <PageHeader title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}`} description="What needs doing today, then where the pipeline stands." actions={<LinkButton variant="primary" href="/discover">Discover companies</LinkButton>} />
      <Setup />

      {/* Ledger strip: one row of real counts, each a link to the list behind it */}
      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
        {ledger.map(([label, value, href, sub]) => (
          <Link key={label} href={href} className="bg-surface px-4 py-3 hover:bg-sunken/60">
            <p className="text-[11px] uppercase tracking-wide text-ink-3">{label}</p>
            {value === undefined ? <Skeleton className="mt-2 h-6 w-12" /> : <p className="num mt-1 text-2xl">{value}</p>}
            {sub && <p className="text-[11px] text-ink-2">{sub}</p>}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Panel title="Needs attention">
            {loading && !data ? (
              <Skeleton className="h-32" />
            ) : !data?.overdue.length && !data?.today.length && !data?.needsAction.length ? (
              <p className="text-[13px] text-ink-3">Nothing overdue, nothing due today, no approved emails waiting.</p>
            ) : (
              <div className="space-y-4">
                {data!.overdue.length > 0 && (
                  <div>
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-bad">Overdue follow-ups</h3>
                    <ul className="divide-y divide-line">{data!.overdue.map((f) => <FollowUpRow key={f.id} f={f} overdue />)}</ul>
                  </div>
                )}
                {data!.today.length > 0 && (
                  <div>
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Due today</h3>
                    <ul className="divide-y divide-line">{data!.today.map((f) => <FollowUpRow key={f.id} f={f} />)}</ul>
                  </div>
                )}
                {data!.needsAction.length > 0 && (
                  <div>
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Ready for outreach</h3>
                    <ul className="divide-y divide-line">
                      {data!.needsAction.map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
                          <Link href={`/companies/${l.company.id}`} className="truncate font-medium hover:underline">{l.company.name}</Link>
                          <span className="flex shrink-0 items-center gap-2">
                            {l._count.drafts > 0 ? <Badge tone="info">{l._count.drafts} approved, not sent</Badge> : <StageBadge stage={l.stage} />}
                            <ScoreChip score={l.score} status="QUALIFIED" />
                          </span>
                        </li>
                      ))}
                    </ul>
                    <Link href="/leads?status=QUALIFIED" className="mt-1 inline-block text-[12px] underline">All qualified leads</Link>
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Leads by stage" actions={<LinkButton size="sm" variant="ghost" href="/pipeline">Board</LinkButton>}>
            {data ? <HBarList rows={data.byStage.map((s) => ({ label: s.label, value: s.count }))} emptyLabel="No leads yet. Save companies from Discover to start the pipeline." /> : <Skeleton className="h-40" />}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Meetings, next 7 days">
            {!data ? <Skeleton className="h-16" /> : !data.meetings.length ? <p className="text-[13px] text-ink-3">No meetings scheduled.</p> : (
              <ul className="divide-y divide-line">
                {data.meetings.map((m) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-2 py-1.5 text-[13px]">
                    <span className="truncate"><Link href={`/companies/${m.lead.company.id}`} className="font-medium hover:underline">{m.lead.company.name}</Link> <span className="text-ink-2">{m.title}</span></span>
                    <span className="shrink-0 text-[12px] text-ink-2">{fmtDateTime(m.dueAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Open tasks">
            {!data ? <Skeleton className="h-16" /> : !data.tasks.length ? <p className="text-[13px] text-ink-3">No open tasks.</p> : (
              <ul className="divide-y divide-line">
                {data.tasks.map((t) => (
                  <li key={t.id} className="flex items-baseline justify-between gap-2 py-1.5 text-[13px]">
                    <span className="truncate">{t.title}{t.lead && <> · <Link href={`/companies/${t.lead.company.id}`} className="text-ink-2 hover:underline">{t.lead.company.name}</Link></>}</span>
                    {t.dueDate && <span className={`num shrink-0 text-[12px] ${new Date(t.dueDate) < new Date() ? 'text-bad' : 'text-ink-3'}`}>{new Date(t.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Recent activity">
            {!data ? <Skeleton className="h-40" /> : !data.recent.length ? <p className="text-[13px] text-ink-3">Activity appears here as you work.</p> : (
              <ul className="space-y-2">
                {data.recent.map((a) => (
                  <li key={a.id} className="text-[13px]">
                    <p>
                      {a.company ? <Link href={`/companies/${a.company.id}`} className="font-medium hover:underline">{a.company.name}</Link> : null} <span className="text-ink-2">{a.title}</span>
                    </p>
                    <p className="text-[11px] text-ink-3">{relTime(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
