import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(420px,520px)]">
      <aside className="hidden flex-col justify-between bg-rail p-10 text-rail-ink lg:flex">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold text-paper">ChaseHorse</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]">Outreach</span>
        </div>
        <div className="max-w-md">
          <p className="text-[26px] font-medium leading-snug text-paper">Find companies that move goods. Learn how they move them. Write to the person who decides.</p>
          {/* A real example of what the workflow produces: one row of a prospect record with provenance. */}
          <div className="mt-8 rounded border border-[#30353b] bg-[#22262b] p-4 font-mono text-[12px] leading-relaxed">
            <p className="text-[#80848b]">PROSPECT RECORD</p>
            <p className="mt-2"><span className="text-[#80848b]">employees</span>  201-500 <span className="text-[#7fa6cc]">[enricho]</span></p>
            <p><span className="text-[#80848b]">finding  </span>  opened 2nd warehouse <span className="text-[#8fc3a4]">[web, cited]</span></p>
            <p><span className="text-[#80848b]">analysis </span>  likely needs inter-city FTL <span className="text-[#c9a46a]">[ai]</span></p>
            <p><span className="text-[#80848b]">email    </span>  awaiting your approval</p>
          </div>
        </div>
        <p className="text-[12px]">
          <Link href="/terms" className="hover:text-paper">Terms</Link> · <Link href="/privacy" className="hover:text-paper">Privacy</Link>
        </p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
