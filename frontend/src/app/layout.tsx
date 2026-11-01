import './globals.css';
import type { Metadata } from 'next';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';

export const metadata: Metadata = {
  title: 'ChaseHorse — AI Lead Intelligence & Outreach Platform',
  description: 'AI-powered B2B prospecting, company intelligence, and outreach platform for ChaseHorse logistics.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#090d16] text-slate-100 min-h-screen flex">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 p-8 overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
