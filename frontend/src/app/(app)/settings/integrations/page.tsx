'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useSession } from '@/components/session';
import { Alert, Badge, Button, ErrorState, Field, Input, KeyValue, PageHeader, Panel, Skeleton, useConfirm, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, relTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';

interface CredView {
  authType: 'API_KEY' | 'OAUTH';
  configured: boolean;
  maskedHint: string | null;
  status: 'UNTESTED' | 'CONNECTED' | 'ERROR';
  lastTestedAt: string | null;
  lastError: string | null;
}
interface Status {
  gemini: (CredView & { metadata: { models?: string[] } }) | null;
  enricho:
    | (CredView & {
        metadata: {
          tools: { name: string; description?: string; inputSchema: { properties?: Record<string, { description?: string }>; required?: string[] } }[];
          capabilities: Record<string, string | null>;
          toolsFetchedAt: string | null;
          account: Record<string, unknown> | null;
          accountCheckedAt: string | null;
        };
      })
    | null;
  google: {
    serverConfigured: boolean;
    redirectUri: string;
    connection: (CredView & { metadata: { email?: string; gmail: boolean; calendar: boolean } }) | null;
  };
  enrichoEndpoint: string;
}

function StatusBadge({ c }: { c: CredView | null | undefined }) {
  if (!c) return <Badge>Not connected</Badge>;
  if (c.status === 'CONNECTED') return <Badge tone="good">Connected</Badge>;
  if (c.status === 'ERROR') return <Badge tone="bad">Error</Badge>;
  return <Badge tone="warn">Not tested</Badge>;
}

const CAP_LABEL: Record<string, string> = {
  companySearch: 'Company search and lookup',
  peopleSearch: 'People search and contact details',
  account: 'Credit balance',
};

function IntegrationsInner() {
  const params = useSearchParams();
  const toast = useToast();
  const { refreshIntegrations } = useSession();
  const { confirm, dialog } = useConfirm();
  const { data, error, loading, reload } = useApi<Status>('/integrations');
  const [geminiKey, setGeminiKey] = useState('');
  const [enrichoKey, setEnrichoKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string | null>>({});
  const [openTool, setOpenTool] = useState<string | null>(null);

  useEffect(() => {
    const provider = params.get('provider');
    if (!provider) return;
    if (params.get('error')) toast(`${provider === 'google' ? 'Google' : 'Enricho'}: ${params.get('error')}`, 'bad');
    else if (params.get('connected')) toast(`${provider === 'google' ? `Google ${params.get('connected')}` : 'Enricho'} connected`);
    window.history.replaceState(null, '', '/settings/integrations');
  }, [params, toast]);

  const act = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    setErrs((e) => ({ ...e, [key]: null }));
    try {
      await fn();
      if (success) toast(success);
      await reload();
      refreshIntegrations();
    } catch (err) {
      setErrs((e) => ({ ...e, [key]: errorMessage(err) }));
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (provider: 'gemini' | 'enricho' | 'google', label: string) => {
    if (!(await confirm(`Disconnect ${label}?`, `The stored credentials for ${label} will be deleted from ChaseHorse Outreach. Your saved companies and contacts are not affected.`, 'Disconnect', true))) return;
    await act(`${provider}-del`, () => api.del(`/integrations/${provider}`), `${label} disconnected`);
  };

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>;
  if (!data) return null;
  const { gemini, enricho, google } = data;

  return (
    <div className="space-y-6">
      {params.get('welcome') && (
        <Alert tone="info" title="Connect your data and AI providers">
          ChaseHorse Outreach uses your own credentials. Connect Enricho to find companies and people, Gemini for research and drafting, and Google to send approved emails.
        </Alert>
      )}

      {/* Enricho */}
      <Panel
        title={<span className="flex items-center gap-2">Enricho <StatusBadge c={enricho} /></span>}
        actions={
          enricho && (
            <>
              <Button size="sm" pending={busy === 'enricho-test'} onClick={() => act('enricho-test', () => api.post('/integrations/enricho/test'), 'Enricho connected; credit balance refreshed')}>
                Check credits
              </Button>
              <Button size="sm" variant="danger" pending={busy === 'enricho-del'} onClick={() => disconnect('enricho', 'Enricho')}>
                Disconnect
              </Button>
            </>
          )
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <p className="text-[13px] text-ink-2">
              Company and people search run through Enricho&apos;s MCP server at <span className="num text-[12px]">{data.enrichoEndpoint}</span>. Previews are free; full records cost 5 credits each and the cost is shown before you spend. Enricho gives 100 free credits a month.
            </p>
            {errs['enricho-test'] && <Alert tone="bad">{errs['enricho-test']}</Alert>}
            {enricho ? (
              <KeyValue
                items={[
                  ['Method', enricho.authType === 'API_KEY' ? `API key ${enricho.maskedHint || ''}` : 'OAuth (MCP authorization)'],
                  ['Last checked', enricho.lastTestedAt ? relTime(enricho.lastTestedAt) : 'Never'],
                  ...(enricho.lastError ? ([['Last error', <span key="e" className="text-bad">{enricho.lastError}</span>]] as [string, React.ReactNode][]) : []),
                  ...Object.entries(enricho.metadata.account || {})
                    .filter(([k]) => /credit|plan|balance|remaining|reset|monthly|email/i.test(k))
                    .slice(0, 6)
                    .map(([k, v]) => [k, <span key={k} className="num">{String(v)}</span>] as [string, React.ReactNode]),
                ]}
              />
            ) : null}
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (enrichoKey.trim().length < 10) return setErrs((x) => ({ ...x, enricho: 'Paste your Enricho API key.' }));
                void act('enricho', () => api.put('/integrations/enricho', { apiKey: enrichoKey.trim() }), 'Enricho API key verified and saved').then(() => setEnrichoKey(''));
              }}
            >
              <Field label={enricho?.authType === 'API_KEY' ? 'Replace API key' : 'API key'} error={errs.enricho} hint={<>Starts with <span className="num">enr_</span>. Create one at <a className="underline" href="https://app.enricho.co/keys" target="_blank" rel="noreferrer">app.enricho.co/keys</a>. Checked with Enricho&apos;s free usage call before saving; stored encrypted and never shown again.</>}>
                <Input type="password" autoComplete="off" value={enrichoKey} onChange={(e) => setEnrichoKey(e.target.value)} placeholder="enr_…" />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="primary" pending={busy === 'enricho'}>
                  Verify and save key
                </Button>
                <span className="text-[12px] text-ink-3">or</span>
                <Button
                  type="button"
                  pending={busy === 'enricho-oauth'}
                  onClick={() =>
                    act('enricho-oauth', async () => {
                      const { url } = await api.post<{ url: string }>('/integrations/enricho/oauth/start');
                      window.location.href = url;
                    })
                  }
                >
                  Sign in with Enricho (email code)
                </Button>
              </div>
              {errs['enricho-oauth'] && <Alert tone="bad">{errs['enricho-oauth']}</Alert>}
            </form>
          </div>

          <div>
            <p className="mb-2 text-[12px] font-medium text-ink-2">
              Tools advertised by the server {enricho?.metadata.toolsFetchedAt && <span className="font-normal text-ink-3">· fetched {relTime(enricho.metadata.toolsFetchedAt)}</span>}
            </p>
            {!enricho?.metadata.tools.length ? (
              <p className="text-[13px] text-ink-3">Connect to load the live tool list.</p>
            ) : (
              <>
                <ul className="mb-3 grid gap-1 text-[12px] sm:grid-cols-2">
                  {Object.entries(CAP_LABEL).map(([cap, label]) => {
                    const tool = enricho.metadata.capabilities[cap];
                    return (
                      <li key={cap} className="flex items-center justify-between gap-2 rounded-sm bg-sunken px-2 py-1">
                        <span>{label}</span>
                        {tool ? <span className="num text-[11px] text-ink-2">{tool}</span> : <Badge tone="warn">unavailable</Badge>}
                      </li>
                    );
                  })}
                </ul>
                <div className="max-h-72 divide-y divide-line overflow-y-auto rounded border border-line">
                  {enricho.metadata.tools.map((t) => (
                    <div key={t.name} className="px-3 py-2">
                      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpenTool(openTool === t.name ? null : t.name)} aria-expanded={openTool === t.name}>
                        <span className="num text-[12px]">{t.name}</span>
                        <span className="text-[11px] text-ink-3">{openTool === t.name ? 'Hide' : 'Parameters'}</span>
                      </button>
                      <p className="mt-0.5 text-[12px] text-ink-2">{t.description}</p>
                      {openTool === t.name && (
                        <ul className="mt-2 space-y-0.5 text-[11px]">
                          {Object.entries(t.inputSchema.properties || {}).map(([p, s]) => (
                            <li key={p}>
                              <span className="num">{p}</span>
                              {t.inputSchema.required?.includes(p) && <span className="text-accent"> *</span>}
                              <span className="text-ink-3"> {s.description}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </Panel>

      {/* Gemini */}
      <Panel
        title={<span className="flex items-center gap-2">Google Gemini <StatusBadge c={gemini} /></span>}
        actions={
          gemini && (
            <>
              <Button size="sm" pending={busy === 'gemini-test'} onClick={() => act('gemini-test', () => api.post('/integrations/gemini/test'), 'Gemini key works')}>
                Test key
              </Button>
              <Button size="sm" variant="danger" pending={busy === 'gemini-del'} onClick={() => disconnect('gemini', 'Gemini')}>
                Remove key
              </Button>
            </>
          )
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (geminiKey.trim().length < 10) return setErrs((x) => ({ ...x, gemini: 'Paste your Gemini API key.' }));
              void act('gemini', () => api.put('/integrations/gemini', { apiKey: geminiKey.trim() }), 'Gemini key verified and saved').then(() => setGeminiKey(''));
            }}
          >
            <Field label={gemini ? 'Replace API key' : 'API key'} error={errs.gemini || errs['gemini-test']} hint={<>Create one at <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>. Checked against Google before saving.</>}>
              <Input type="password" autoComplete="off" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIza…" />
            </Field>
            <Button type="submit" variant="primary" pending={busy === 'gemini'}>
              Verify and save key
            </Button>
          </form>
          <div className="text-[13px]">
            {gemini ? (
              <KeyValue
                items={[
                  ['Key', <span key="k" className="num">{gemini.maskedHint}</span>],
                  ['Models available', <span key="m" className="num">{gemini.metadata.models?.length ?? '—'}</span>],
                  ['Last checked', gemini.lastTestedAt ? fmtDateTime(gemini.lastTestedAt) : 'Never'],
                  ...(gemini.lastError ? ([['Last error', <span key="e" className="text-bad">{gemini.lastError}</span>]] as [string, React.ReactNode][]) : []),
                ]}
              />
            ) : (
              <p className="text-ink-2">Used for company research (with Google Search grounding), lead scoring and email drafting. Choose the model under Settings.</p>
            )}
          </div>
        </div>
      </Panel>

      {/* Google */}
      <Panel
        title={<span className="flex items-center gap-2">Gmail and Google Calendar <StatusBadge c={google.connection} /></span>}
        actions={
          google.connection && (
            <>
              <Button size="sm" pending={busy === 'google-test'} onClick={() => act('google-test', () => api.post('/integrations/google/test'), 'Google access verified')}>
                Test access
              </Button>
              <Button size="sm" variant="danger" pending={busy === 'google-del'} onClick={() => disconnect('google', 'Google account')}>
                Disconnect
              </Button>
            </>
          )
        }
      >
        {!google.serverConfigured ? (
          <Alert tone="warn" title="Google OAuth is not configured on this server">
            An administrator must set <span className="num">GOOGLE_CLIENT_ID</span> and <span className="num">GOOGLE_CLIENT_SECRET</span> in the server <span className="num">.env</span>, with this authorized redirect URI:
            <span className="num mt-1 block break-all text-ink">{google.redirectUri}</span>
          </Alert>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-3 text-[13px]">
              <p className="text-ink-2">
                Gmail access lets you send emails you have approved and detect replies to them. Nothing is sent without your explicit approval. Calendar access is used only when you choose to add a follow-up to your calendar.
              </p>
              {errs['google-test'] && <Alert tone="bad">{errs['google-test']}</Alert>}
              {errs.google && <Alert tone="bad">{errs.google}</Alert>}
              <div className="flex flex-wrap gap-2">
                {(['gmail', 'calendar'] as const).map((f) => {
                  const on = google.connection?.metadata[f];
                  return (
                    <Button
                      key={f}
                      variant={on ? 'secondary' : 'primary'}
                      pending={busy === `google-${f}`}
                      onClick={() =>
                        act(`google-${f}`, async () => {
                          const { url } = await api.post<{ url: string }>('/integrations/google/start', { feature: f });
                          window.location.href = url;
                        })
                      }
                    >
                      {on ? `Reconnect ${f === 'gmail' ? 'Gmail' : 'Calendar'}` : `Connect ${f === 'gmail' ? 'Gmail' : 'Calendar'}`}
                    </Button>
                  );
                })}
              </div>
            </div>
            {google.connection && (
              <KeyValue
                items={[
                  ['Account', google.connection.metadata.email],
                  ['Gmail (send + read replies)', google.connection.metadata.gmail ? <Badge tone="good">Granted</Badge> : <Badge>Not granted</Badge>],
                  ['Calendar events', google.connection.metadata.calendar ? <Badge tone="good">Granted</Badge> : <Badge>Not granted</Badge>],
                  ['Last checked', google.connection.lastTestedAt ? fmtDateTime(google.connection.lastTestedAt) : 'Never'],
                  ...(google.connection.lastError ? ([['Last error', <span key="e" className="text-bad">{google.connection.lastError}</span>]] as [string, React.ReactNode][]) : []),
                ]}
              />
            )}
          </div>
        )}
      </Panel>
      {dialog}
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader title="Integrations" description="Connect your own accounts. Keys and tokens are encrypted on the server and never sent back to the browser." />
      <Suspense>
        <IntegrationsInner />
      </Suspense>
    </>
  );
}
