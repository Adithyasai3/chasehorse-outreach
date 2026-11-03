'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Badge, Button, ChipSelect, Empty, Field, Input, LinkButton, PageHeader, Panel, Select, Source, TableSkeleton, TagInput, useConfirm, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { COUNTRIES, EMPLOYEE_BANDS, ENRICHO_CREDITS_PER_RECORD, relTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface Result {
  resultIndex: number;
  providerId: string | null;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  employeeRange: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  existingCompanyId: string | null;
  lastResearchedAt: string | null;
}
interface SearchResponse {
  runId: string;
  toolName: string;
  preview: boolean;
  totalItems: number | null;
  hasMore: boolean | null;
  creditsUsed: number | null;
  canLoadMore: boolean;
  applied: string[];
  notApplied: { filter: string; reason: string }[];
  rawText: string | null;
  companies: Result[];
}
interface PropSchema {
  enum?: string[];
  items?: { enum?: string[] };
  anyOf?: PropSchema[];
}
interface ToolSchema {
  name: string;
  inputSchema: { properties?: Record<string, PropSchema> };
}

const emptyFilters = { industries: [] as string[], keywords: [] as string[], countries: [] as string[], cityNames: [] as string[], employees: [] as string[], names: [] as string[] };

function enumOf(schema: PropSchema | undefined): string[] | null {
  if (!schema) return null;
  for (const s of [schema, ...(schema.anyOf || [])]) {
    if (s.enum?.length) return s.enum;
    if (s.items?.enum?.length) return s.items.enum;
  }
  return null;
}

export default function DiscoverPage() {
  const toast = useToast();
  const { integrations } = useSession();
  const { confirm, dialog } = useConfirm();
  const status = useApi<{ enricho: { metadata: { tools: ToolSchema[]; capabilities: Record<string, string | null> } } | null }>('/integrations');
  const [f, setF] = useState(emptyFilters);
  const [limit, setLimit] = useState('10');
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState<null | 'preview' | 'full' | 'more'>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const set = <K extends keyof typeof emptyFilters>(k: K, v: (typeof emptyFilters)[K]) => setF((x) => ({ ...x, [k]: v }));

  // Use the size bands the live tool declares, if it declares them.
  const bands = useMemo(() => {
    const tools = status.data?.enricho?.metadata.tools || [];
    const cs = tools.find((t) => t.name === status.data?.enricho?.metadata.capabilities.companySearch);
    return enumOf(cs?.inputSchema.properties?.employee_size_band) || EMPLOYEE_BANDS;
  }, [status.data]);

  const hasFilters = Object.values(f).some((v) => v.length);

  const run = async (preview: boolean) => {
    setFormErr(null);
    if (!hasFilters) return setFormErr('Add at least one filter: industry, country, size or keywords.');
    const n = Number(limit);
    if (!preview) {
      const ok = await confirm(
        'Run a full search?',
        <>
          Enricho charges <strong>{ENRICHO_CREDITS_PER_RECORD} credits per new full record</strong>, so this page can cost up to <strong className="num">{n * ENRICHO_CREDITS_PER_RECORD}</strong> credits.
          Records you have already paid for and empty results are free. If your balance can&apos;t cover the page, Enricho returns nothing and charges nothing.
        </>,
        'Run full search'
      );
      if (!ok) return;
    }
    setLoading(preview ? 'preview' : 'full');
    setError(null);
    setSelected([]);
    try {
      setRes(await api.post<SearchResponse>('/discovery/companies', { ...f, preview, limit: n }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(null);
    }
  };

  const more = async () => {
    if (!res) return;
    const ok = await confirm('Load the next page?', <>This is a paid page: up to <strong className="num">{Number(limit) * ENRICHO_CREDITS_PER_RECORD}</strong> credits.</>, 'Load next page');
    if (!ok) return;
    setLoading('more');
    try {
      const next = await api.post<{ canLoadMore: boolean; companies: Result[] }>('/discovery/next', { runId: res.runId });
      setRes({ ...res, canLoadMore: next.canLoadMore, companies: [...res.companies, ...next.companies] });
    } catch (err) {
      toast(errorMessage(err), 'bad');
    } finally {
      setLoading(null);
    }
  };

  const save = async () => {
    if (!res || !selected.length) return;
    setSaving(true);
    try {
      const out = await api.post<{ createdCount: number; updatedCount: number; saved: { companyId: string }[] }>('/discovery/save', { runId: res.runId, resultIndexes: selected });
      toast(`Saved ${out.createdCount} new compan${out.createdCount === 1 ? 'y' : 'ies'}${out.updatedCount ? `, refreshed ${out.updatedCount}` : ''}`);
      setRes({
        ...res,
        companies: res.companies.map((c) => {
          const i = selected.indexOf(c.resultIndex);
          return i >= 0 ? { ...c, existingCompanyId: out.saved[i]?.companyId ?? c.existingCompanyId } : c;
        }),
      });
      setSelected([]);
    } catch (err) {
      toast(errorMessage(err), 'bad');
    } finally {
      setSaving(false);
    }
  };

  const notReady = integrations && !integrations.enricho;

  return (
    <>
      <PageHeader
        title="Discover companies"
        description="Search Enricho's company database. Start with a free preview of up to 3 matches, then run a paid full search when the filters look right."
        actions={<LinkButton href="/companies">Saved companies</LinkButton>}
      />
      {notReady && (
        <div className="mb-4">
          <Alert tone="warn" title="Enricho is not connected" action={<LinkButton size="sm" variant="primary" href="/settings/integrations">Connect Enricho</LinkButton>}>
            Discovery needs your Enricho API key or an Enricho sign-in.
          </Alert>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Panel title="Filters" bodyClassName="space-y-4">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(true);
            }}
          >
            <Field label="Industry" hint="Partial match on Enricho's industry name.">
              <TagInput value={f.industries} onChange={(v) => set('industries', v)} placeholder="e.g. dairy, pharmaceuticals" />
            </Field>
            <Field label="Country (headquarters)">
              <Select value="" onChange={(e) => e.target.value && !f.countries.includes(e.target.value) && set('countries', [...f.countries, e.target.value])}>
                <option value="">{f.countries.length ? 'Add another country…' : 'Any country'}</option>
                {COUNTRIES.map(([c, n]) => (
                  <option key={c} value={c}>{n}</option>
                ))}
              </Select>
            </Field>
            {f.countries.length > 0 && (
              <div className="-mt-2 flex flex-wrap gap-1">
                {f.countries.map((c) => (
                  <button key={c} type="button" className="rounded-sm bg-sunken px-1.5 py-0.5 text-[12px]" onClick={() => set('countries', f.countries.filter((x) => x !== c))}>
                    {COUNTRIES.find((x) => x[0] === c)?.[1] || c} ×
                  </button>
                ))}
              </div>
            )}
            <Field label="Employees">
              <ChipSelect options={bands} value={f.employees} onChange={(v) => set('employees', v)} />
            </Field>
            <Field label="Keywords" hint="Every word must appear in the company's name, website, industry, country or address.">
              <TagInput value={f.keywords} onChange={(v) => set('keywords', v)} placeholder="e.g. foods, logistics" />
            </Field>
            <Field label="City" hint="Matched against the company address.">
              <TagInput value={f.cityNames} onChange={(v) => set('cityNames', v)} placeholder="e.g. Pune" />
            </Field>
            <Field label="Company name contains">
              <TagInput value={f.names} onChange={(v) => set('names', v)} />
            </Field>
            <p className="text-[12px] text-ink-3">Enricho has no funding or revenue filters, so this search doesn&apos;t offer them.</p>
            {formErr && <Alert tone="bad">{formErr}</Alert>}
            <div className="space-y-2 border-t border-line pt-3">
              <Button type="submit" variant="primary" className="w-full" pending={loading === 'preview'} disabled={Boolean(notReady) || Boolean(loading)}>
                Free preview (up to 3)
              </Button>
              <div className="flex items-center gap-2">
                <Select className="w-24" value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Results per page">
                  {['5', '10', '25', '50'].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </Select>
                <Button type="button" className="flex-1" pending={loading === 'full'} disabled={Boolean(notReady) || Boolean(loading)} onClick={() => run(false)}>
                  Full search · up to {Number(limit) * ENRICHO_CREDITS_PER_RECORD} credits
                </Button>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setF(emptyFilters); setRes(null); setFormErr(null); }}>
                Clear filters
              </Button>
            </div>
          </form>
        </Panel>

        <div className="min-w-0 space-y-3">
          {error && <Alert tone="bad" title="Search failed">{error}</Alert>}
          {(loading === 'preview' || loading === 'full') && <TableSkeleton rows={6} cols={5} />}
          {!loading && !res && !error && (
            <Empty title="No search yet">Set a few filters and run a free preview to see what Enricho has. Nothing is saved until you choose to.</Empty>
          )}
          {loading !== 'preview' && loading !== 'full' && res && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-2">
                <p className="flex flex-wrap items-center gap-x-2">
                  {res.preview ? <Badge tone="info">Free preview</Badge> : <Badge tone="accent">Full results</Badge>}
                  <span><span className="num text-ink">{res.companies.length}</span> shown{res.totalItems !== null && <> of <span className="num text-ink">{res.totalItems.toLocaleString()}</span></>}</span>
                  <span>· via <span className="num">{res.toolName}</span></span>
                  {res.creditsUsed !== null && <span>· credits used: <span className="num text-ink">{res.creditsUsed}</span></span>}
                  {res.applied.length > 0 && <span>· filters: {res.applied.join(', ')}</span>}
                </p>
                <Button size="sm" disabled={!selected.length} pending={saving} variant="primary" onClick={save}>
                  Save {selected.length || ''} to CRM
                </Button>
              </div>
              {res.preview && res.hasMore && (
                <Alert tone="info" title="More companies match these filters" action={<Button size="sm" onClick={() => run(false)}>Run full search</Button>}>
                  The preview shows a sample only. A full search returns pages of {limit} at {ENRICHO_CREDITS_PER_RECORD} credits per new record.
                </Alert>
              )}
              {res.notApplied.length > 0 && (
                <Alert tone="warn" title="Some filters were not applied">{res.notApplied.map((n) => `${n.filter}: ${n.reason}`).join('. ')}</Alert>
              )}
              {res.rawText && (
                <Alert tone="warn" title="Enricho returned text instead of structured data">
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[12px]">{res.rawText}</pre>
                </Alert>
              )}
              {res.companies.length === 0 && !res.rawText ? (
                <Empty title="No companies matched">Try fewer filters: drop the city or the size band first. Empty searches are free.</Empty>
              ) : (
                <div className="overflow-x-auto rounded border border-line bg-surface">
                  <table className="data-table text-[13px]">
                    <thead>
                      <tr>
                        <th className="w-8">
                          <input type="checkbox" aria-label="Select all" className="accent-[var(--accent)]" checked={selected.length > 0 && selected.length === res.companies.length} onChange={(e) => setSelected(e.target.checked ? res.companies.map((c) => c.resultIndex) : [])} />
                        </th>
                        <th>Company</th>
                        <th>Industry</th>
                        <th>Location</th>
                        <th>Employees</th>
                        <th>In CRM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {res.companies.map((c) => (
                        <tr key={c.resultIndex}>
                          <td>
                            <input type="checkbox" aria-label={`Select ${c.name}`} className="accent-[var(--accent)]" checked={selected.includes(c.resultIndex)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.resultIndex] : s.filter((x) => x !== c.resultIndex)))} />
                          </td>
                          <td className="max-w-md">
                            <div className="flex items-center gap-2"><span className="font-medium">{c.name}</span><Source kind="enricho" /></div>
                            {c.domain && <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="num text-[12px] text-ink-2 hover:underline">{c.domain}</a>}
                          </td>
                          <td className="text-ink-2">{c.industry || <span className="text-ink-3">—</span>}</td>
                          <td className="text-ink-2">{c.address || [c.city, c.country].filter(Boolean).join(', ') || <span className="text-ink-3">—</span>}</td>
                          <td className="num whitespace-nowrap">{c.employeeRange || <span className="text-ink-3">—</span>}</td>
                          <td className="whitespace-nowrap">
                            {c.existingCompanyId ? (
                              <div>
                                <Link href={`/companies/${c.existingCompanyId}`} className="text-[12px] underline">Saved</Link>
                                <div className="text-[11px] text-ink-3">{c.lastResearchedAt ? `researched ${relTime(c.lastResearchedAt)}` : 'not researched'}</div>
                              </div>
                            ) : (
                              <Badge>New</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {res.canLoadMore && (
                <div className="flex justify-end">
                  <Button size="sm" pending={loading === 'more'} onClick={more}>Load next page · up to {Number(limit) * ENRICHO_CREDITS_PER_RECORD} credits</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {dialog}
    </>
  );
}
