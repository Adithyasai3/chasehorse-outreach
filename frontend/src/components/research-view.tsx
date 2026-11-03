'use client';

import { fmtDateTime } from '@/lib/format';
import { Source } from './ui';

interface Point {
  text: string;
  evidence: string[];
}
export interface ResearchRecord {
  id: string;
  status: 'COMPLETED' | 'FAILED';
  model: string | null;
  grounded: boolean;
  createdAt: string;
  errorMessage?: string | null;
  content: {
    facts: { key: string; label: string; value: string; origin: 'ENRICHO' | 'USER' }[];
    findings: { id: string; statement: string; sourceIndexes: number[] }[];
    analysis: {
      overview: Point;
      productsAndServices: Point[];
      businessModel: Point | null;
      growthIndicators: Point[];
      logisticsRequirements: Point[];
      supplyChainChallenges: Point[];
      opportunities: Point[];
      outreachAngle: Point;
    };
    unknowns: string[];
    searchQueries: string[];
  } | null;
  sources: { title: string; url: string }[] | null;
}

function Evidence({ refs, facts }: { refs: string[]; facts: { key: string; label: string }[] }) {
  if (!refs.length) return <span className="ml-1 text-[11px] text-ink-3">(no cited basis)</span>;
  return (
    <span className="ml-1 text-[11px] text-ink-3">
      based on{' '}
      {refs.map((r, i) => {
        const fact = facts.find((f) => f.key === r);
        return (
          <span key={r}>
            {i > 0 && ', '}
            {fact ? fact.label.toLowerCase() : <a href={`#finding-${r}`} className="num underline">{r}</a>}
          </span>
        );
      })}
    </span>
  );
}

function PointList({ title, points, facts }: { title: string; points: Point[]; facts: { key: string; label: string }[] }) {
  if (!points.length) return null;
  return (
    <div>
      <h4 className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-3">{title}</h4>
      <ul className="space-y-1.5 text-[13px]">
        {points.map((p, i) => (
          <li key={i} className="border-l border-line-strong pl-3">
            {p.text}
            <Evidence refs={p.evidence} facts={facts} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResearchView({ research }: { research: ResearchRecord }) {
  const c = research.content;
  if (!c) return null;
  const sources = research.sources || [];
  const a = c.analysis;
  return (
    <div className="space-y-6">
      <p className="text-[12px] text-ink-3">
        Generated {fmtDateTime(research.createdAt)} with <span className="num">{research.model}</span>
        {research.grounded ? ' · web search on' : ' · web search off or unavailable, so no external findings'}
      </p>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="font-semibold">Analysis</h3>
          <Source kind="ai" />
        </div>
        <div className="space-y-4 rounded border border-dashed border-warn/40 bg-surface p-4">
          <p className="text-[14px] leading-relaxed">
            {a.overview.text}
            <Evidence refs={a.overview.evidence} facts={c.facts} />
          </p>
          <div className="grid gap-5 lg:grid-cols-2">
            <PointList title="Logistics requirements" points={a.logisticsRequirements} facts={c.facts} />
            <PointList title="Supply-chain challenges" points={a.supplyChainChallenges} facts={c.facts} />
            <PointList title="Opportunities for us" points={a.opportunities} facts={c.facts} />
            <PointList title="Growth indicators" points={a.growthIndicators} facts={c.facts} />
            <PointList title="Products and services" points={a.productsAndServices} facts={c.facts} />
            {a.businessModel && <PointList title="Business model" points={[a.businessModel]} facts={c.facts} />}
          </div>
          <div className="border-t border-line pt-3">
            <h4 className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-3">Suggested outreach angle</h4>
            <p className="text-[13px]">
              {a.outreachAngle.text}
              <Evidence refs={a.outreachAngle.evidence} facts={c.facts} />
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="font-semibold">Findings from the web</h3>
          <Source kind="web" />
        </div>
        {c.findings.length === 0 ? (
          <p className="text-[13px] text-ink-3">No sourced findings. {research.grounded ? 'Search returned nothing attributable to this company.' : 'Enable Google Search grounding in Settings to collect them.'}</p>
        ) : (
          <ol className="space-y-2 text-[13px]">
            {c.findings.map((f) => (
              <li key={f.id} id={`finding-${f.id}`} className="grid grid-cols-[2.5rem_1fr] gap-2">
                <span className="num text-[12px] text-ink-3">{f.id}</span>
                <span>
                  {f.statement}{' '}
                  {f.sourceIndexes.map((i) =>
                    sources[i] ? (
                      <a key={i} href={sources[i].url} target="_blank" rel="noreferrer" className="num text-[11px] text-good underline" title={sources[i].title}>
                        [{i + 1}]
                      </a>
                    ) : null
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
        {sources.length > 0 && (
          <details className="mt-3 text-[12px]">
            <summary className="cursor-pointer text-ink-2">{sources.length} sources</summary>
            <ol className="mt-2 space-y-1">
              {sources.map((s, i) => (
                <li key={s.url}>
                  <span className="num text-ink-3">[{i + 1}]</span>{' '}
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </details>
        )}
      </section>

      {c.unknowns.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="font-semibold">Not known</h3>
            <Source kind="unknown" />
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-[13px] text-ink-2">
            {c.unknowns.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
