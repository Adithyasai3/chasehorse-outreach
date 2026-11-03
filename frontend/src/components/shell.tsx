'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { SessionCtx, type IntegrationSummary, type SessionUser } from './session';
import { cx, Skeleton } from './ui';

const NAV: { group: string; items: { href: string; label: string }[] }[] = [
  {
    group: 'Prospecting',
    items: [
      { href: '/', label: 'Dashboard' },
      { href: '/discover', label: 'Discover companies' },
      { href: '/companies', label: 'Companies' },
      { href: '/research', label: 'Research' },
      { href: '/people', label: 'People' },
    ],
  },
  {
    group: 'Pipeline',
    items: [
      { href: '/leads', label: 'Leads' },
      { href: '/pipeline', label: 'Board' },
      { href: '/follow-ups', label: 'Follow-ups' },
    ],
  },
  {
    group: 'Outreach',
    items: [
      { href: '/outreach', label: 'Emails' },
      { href: '/campaigns', label: 'Campaigns' },
      { href: '/analytics', label: 'Analytics' },
    ],
  },
  {
    group: 'Account',
    items: [
      { href: '/settings', label: 'Settings' },
      { href: '/settings/integrations', label: 'Integrations' },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/settings') return pathname === '/settings';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-baseline gap-2 px-4 py-4">
      <span className="text-[15px] font-semibold tracking-tight text-paper">ChaseHorse</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-rail-ink">Outreach</span>
    </Link>
  );
}

function StatusDot({ on, label }: { on: boolean | undefined; label: string }) {
  return (
    <li className="flex items-center justify-between text-[11px]">
      <span>{label}</span>
      <span className={cx('font-mono uppercase tracking-wide', on ? 'text-[#8fc3a4]' : 'text-[#c9a46a]')}>{on === undefined ? '…' : on ? 'on' : 'off'}</span>
    </li>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationSummary | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const refreshIntegrations = useCallback(() => {
    api
      .get<{ gemini: { status: string } | null; enricho: { status: string } | null; google: { connection: { metadata: { gmail: boolean; calendar: boolean } } | null } }>('/integrations')
      .then((d) =>
        setIntegrations({
          gemini: d.gemini?.status === 'CONNECTED',
          enricho: d.enricho?.status === 'CONNECTED',
          gmail: Boolean(d.google.connection?.metadata.gmail),
          calendar: Boolean(d.google.connection?.metadata.calendar),
        })
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    api.get<{ user: SessionUser }>('/auth/me').then((d) => setUser(d.user)).catch(() => undefined);
    refreshIntegrations();
  }, [refreshIntegrations]);

  useEffect(() => setMenuOpen(false), [pathname]);

  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    router.replace('/login');
  };

  const nav = (
    <nav className="flex-1 overflow-y-auto px-2 pb-4">
      {NAV.map((g) => (
        <div key={g.group} className="mt-4">
          <p className="px-2 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#80848b]">{g.group}</p>
          <ul>
            {g.items.map((i) => {
              const active = isActive(pathname, i.href);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'block rounded px-2 py-1.5 text-[13px] transition-colors',
                      active ? 'bg-rail-active font-medium text-paper' : 'text-rail-ink hover:bg-rail-active/60 hover:text-paper'
                    )}
                  >
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-[#2f3339] px-4 py-3 text-rail-ink">
      <Link href="/settings/integrations" className="block rounded hover:bg-rail-active/40">
        <ul className="space-y-0.5">
          <StatusDot on={integrations?.enricho} label="Enricho" />
          <StatusDot on={integrations?.gemini} label="Gemini" />
          <StatusDot on={integrations?.gmail} label="Gmail" />
        </ul>
      </Link>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#2f3339] pt-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] text-paper">{user?.name || ' '}</p>
          <p className="truncate text-[11px]">{user?.email}</p>
        </div>
        <button onClick={logout} className="shrink-0 text-[12px] underline-offset-2 hover:text-paper hover:underline">
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-rail md:flex">
        <Wordmark />
        {nav}
        {footer}
      </aside>

      {/* Mobile header */}
      <div className="sticky top-0 z-40 flex items-center justify-between bg-rail md:hidden">
        <Wordmark />
        <button className="mr-3 rounded px-3 py-1.5 text-[13px] text-paper ring-1 ring-[#3a3f46]" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
          {menuOpen ? 'Close' : 'Menu'}
        </button>
      </div>
      {menuOpen && (
        <div className="fixed inset-x-0 bottom-0 top-[52px] z-40 flex flex-col bg-rail md:hidden">
          {nav}
          {footer}
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10">
        {user ? (
          <SessionCtx.Provider value={{ user, integrations, refreshIntegrations, setUser }}>
            <div className="mx-auto max-w-[1400px]">{children}</div>
          </SessionCtx.Provider>
        ) : (
          <div className="mx-auto max-w-[1400px] space-y-3">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-96" />
            <Skeleton className="mt-6 h-40 w-full" />
          </div>
        )}
      </main>
    </div>
  );
}
