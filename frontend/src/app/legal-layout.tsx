import Link from 'next/link';

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-baseline justify-between px-4 py-4">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-semibold">ChaseHorse</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">Outreach</span>
          </Link>
          <nav className="flex gap-4 text-[13px] text-ink-2">
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          </nav>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-4 py-10 text-[14px] leading-relaxed [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-[16px] [&_h2]:font-semibold [&_li]:mb-1 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-[13px] text-ink-3">Last updated {updated}</p>
        <div className="mt-6 rounded border border-warn/30 bg-warn-wash px-3 py-2 text-[13px]">
          This is a working template prepared for the operator of this deployment. Have it reviewed by counsel and fill in the operator details before offering the service to anyone outside your organisation.
        </div>
        {children}
      </article>
    </div>
  );
}
