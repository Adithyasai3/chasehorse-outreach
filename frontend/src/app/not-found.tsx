import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <p className="num text-[12px] text-ink-3">404</p>
        <h1 className="mt-1 text-xl font-semibold">This page does not exist</h1>
        <p className="mt-2 text-[13px] text-ink-2">The link may be old, or the record may have been deleted.</p>
        <Link href="/" className="mt-4 inline-block text-[13px] underline">Back to the dashboard</Link>
      </div>
    </main>
  );
}
