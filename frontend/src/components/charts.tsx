'use client';

import { useState } from 'react';

/*
 * Small, dependency-free charts. Single series each, so no legend: the panel title names it.
 * One hue (ink) for magnitude, values printed in text tokens, hover reveals exact values.
 */

const BAR = 'var(--ink-2)';
const BAR_HOVER = 'var(--ink)';

export function HBarList({ rows, emptyLabel = 'No data yet' }: { rows: { label: string; value: number; href?: string }[]; emptyLabel?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!total) return <p className="text-[13px] text-ink-3">{emptyLabel}</p>;
  return (
    <ul className="space-y-1.5" role="list">
      {rows.map((r) => (
        <li key={r.label} className="group grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 text-[12px]" title={`${r.label}: ${r.value} (${Math.round((r.value / total) * 100)}%)`}>
          <span className="truncate text-ink-2">{r.label}</span>
          <span className="relative h-3">
            <span className="absolute inset-y-0 left-0 rounded-r-[4px] transition-colors" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 2 : 0, background: BAR }} />
            <span className="absolute inset-y-0 left-0 rounded-r-[4px] opacity-0 transition-opacity group-hover:opacity-100" style={{ width: `${(r.value / max) * 100}%`, background: BAR_HOVER }} />
          </span>
          <span className="num text-right text-ink">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** Weekly column chart with a hover tooltip. Baseline-anchored bars, 2px gaps. */
export function WeekColumns({ title, series, valueKey }: { title: string; series: { weekStart: string; [k: string]: number | string }[]; valueKey: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = series.map((s) => Number(s[valueKey]) || 0);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const H = 64;
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 flex items-baseline justify-between text-[12px]">
        <span className="text-ink-2">{title}</span>
        <span className="num text-ink">{total}</span>
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${series.length * 10} ${H}`} preserveAspectRatio="none" className="h-16 w-full" role="img" aria-label={`${title} per week, total ${total}`}>
          <line x1="0" x2={series.length * 10} y1={H - 0.5} y2={H - 0.5} stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {values.map((v, i) => {
            const h = v ? Math.max(2, (v / max) * (H - 4)) : 0;
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={i * 10} y={0} width={10} height={H} fill="transparent" />
                <rect x={i * 10 + 1} y={H - h} width={8} height={h} fill={hover === i ? BAR_HOVER : BAR} />
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute -top-8 z-10 whitespace-nowrap rounded-sm border border-line bg-surface px-1.5 py-0.5 text-[11px] shadow-sm" style={{ left: `${((hover + 0.5) / series.length) * 100}%`, transform: 'translateX(-50%)' }}>
            Week of {new Date(series[hover].weekStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: <span className="num">{values[hover]}</span>
          </div>
        )}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-ink-3">
        <span>{new Date(series[0]?.weekStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        <span>this week</span>
      </div>
    </figure>
  );
}
