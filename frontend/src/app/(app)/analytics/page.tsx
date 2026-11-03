'use client';

import { useState } from 'react';
import { HBarList, WeekColumns } from '@/components/charts';
import { Badge, ErrorState, PageHeader, Panel, Skeleton } from '@/components/ui';
import { useApi } from '@/lib/hooks';

interface Trends {
  series: { weekStart: string; companies: number; drafts: number; sent: number; replies: number }[];
  research: Record<string, number>;
  scoreBands: { label: string; count: number }[];
  providerCalls: { provider: string; status: string; count: number }[];
}
interface Dash {
  totals: { companies: number; researched: number; contacts: number; contactsWithEmail: number; qualified: number; draftsOpen: number; sent: number; replies: number; followUpsPending: number };
  byStage: { key: string; label: string; count: number }[];
}

function pct(a: number, b: number) {
  return b ? `${Math.round((a / b) * 100)}%` : '—';
}

export default function AnalyticsPage() {
  const trends = useApi<Trends>('/analytics/trends');
  const dash = useApi<Dash>('/analytics/dashboard');
  const [showTable, setShowTable] = useState(false);
  if (trends.error || dash.error) return <ErrorState message={(trends.error || dash.error) as string} onRetry={() => { trends.reload(); dash.reload(); }} />;
  const t = dash.data?.totals;
  const s = trends.data?.series || [];

  const funnel: [string, number | undefined, string][] = t
    ? [
        ['Companies saved', t.companies, ''],
        ['Researched', t.researched, pct(t.researched, t.companies)],
        ['Qualified', t.qualified, pct(t.qualified, t.companies)],
        ['Emails sent', t.sent, ''],
        ['Replies received', t.replies, pct(t.replies, t.sent)],
      ]
    : [];

  return (
    <>
      <PageHeader title="Analytics" description="Calculated from your own records. Open and click tracking is not collected, so replies are the engagement measure." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Outreach funnel">
          {!t ? <Skeleton className="h-32" /> : (
            <table className="w-full text-[13px]">
              <tbody>
                {funnel.map(([k, v, rate]) => (
                  <tr key={k} className="border-b border-line last:border-0">
                    <td className="py-2 text-ink-2">{k}</td>
                    <td className="num py-2 text-right text-lg">{v}</td>
                    <td className="num w-20 py-2 text-right text-[12px] text-ink-3">{rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Leads by stage">{dash.data ? <HBarList rows={dash.data.byStage.map((x) => ({ label: x.label, value: x.count }))} /> : <Skeleton className="h-40" />}</Panel>

        <Panel title="Weekly activity, last 12 weeks" className="xl:col-span-2" actions={<button className="text-[12px] underline" onClick={() => setShowTable((v) => !v)}>{showTable ? 'Show charts' : 'Show table'}</button>}>
          {!trends.data ? <Skeleton className="h-24" /> : showTable ? (
            <div className="overflow-x-auto">
              <table className="data-table text-[12px]">
                <thead><tr><th>Week of</th><th>Companies saved</th><th>Drafts created</th><th>Emails sent</th><th>Replies</th></tr></thead>
                <tbody>{s.map((w) => <tr key={w.weekStart}><td>{w.weekStart}</td><td className="num">{w.companies}</td><td className="num">{w.drafts}</td><td className="num">{w.sent}</td><td className="num">{w.replies}</td></tr>)}</tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <WeekColumns title="Companies saved" series={s} valueKey="companies" />
              <WeekColumns title="Drafts created" series={s} valueKey="drafts" />
              <WeekColumns title="Emails sent" series={s} valueKey="sent" />
              <WeekColumns title="Replies" series={s} valueKey="replies" />
            </div>
          )}
        </Panel>

        <Panel title="Lead score distribution">
          {trends.data ? <HBarList rows={trends.data.scoreBands.map((b) => ({ label: `Score ${b.label}`, value: b.count }))} emptyLabel="No leads scored yet." /> : <Skeleton className="h-32" />}
        </Panel>
        <Panel title="Provider calls, last 12 weeks">
          {!trends.data ? <Skeleton className="h-32" /> : !trends.data.providerCalls.length ? <p className="text-[13px] text-ink-3">No calls to Enricho, Gemini or Google yet.</p> : (
            <table className="w-full text-[13px]">
              <tbody>
                {trends.data.providerCalls.sort((a, b) => b.count - a.count).map((p) => (
                  <tr key={`${p.provider}-${p.status}`} className="border-b border-line last:border-0">
                    <td className="py-1.5">{p.provider === 'ENRICHO' ? 'Enricho' : p.provider === 'GEMINI' ? 'Gemini' : 'Google'}</td>
                    <td className="py-1.5">{p.status === 'OK' ? <Badge tone="good">OK</Badge> : <Badge tone="bad">{p.status.toLowerCase().replace(/_/g, ' ')}</Badge>}</td>
                    <td className="num py-1.5 text-right">{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}
