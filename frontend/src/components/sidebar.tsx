'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Search,
  Building2,
  Users,
  KanbanSquare,
  Inbox,
  Megaphone,
  CalendarCheck,
  Package,
  BarChart3,
  Cable,
  Settings,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';

const navItems = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Lead Discovery', href: '/discovery', icon: Search, badge: 'AI' },
  { label: 'Companies', href: '/companies', icon: Building2 },
  { label: 'Contacts', href: '/contacts', icon: Users },
  { label: 'Kanban CRM', href: '/kanban', icon: KanbanSquare },
  { label: 'Email Inbox', href: '/inbox', icon: Inbox },
  { label: 'Campaigns', href: '/campaigns', icon: Megaphone },
  { label: 'Follow-ups', href: '/followups', icon: CalendarCheck },
  { label: 'Services Catalog', href: '/services', icon: Package },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  { label: 'Integrations', href: '/integrations', icon: Cable },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [enrichoStatus, setEnrichoStatus] = useState<any>(null);
  const [gmailStatus, setGmailStatus] = useState<any>(null);

  useEffect(() => {
    api
      .getIntegrationsStatus()
      .then((data) => {
        setEnrichoStatus(data.enricho);
        setGmailStatus(data.gmail);
      })
      .catch(() => {});
  }, []);

  return (
    <aside className="w-64 border-r border-slate-800/80 bg-[#0c1222] flex flex-col h-screen select-none sticky top-0">
      {/* Brand Header */}
      <div className="h-16 border-b border-slate-800/80 flex items-center px-6 gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-wide text-white flex items-center gap-1.5">
            ChaseHorse
            <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-mono">
              AI
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Lead Intelligence & Outreach</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold uppercase">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* System Status Indicators at bottom */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/40 space-y-2">
        <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider px-1">
          System Providers
        </div>
        <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-slate-950/60 border border-slate-800/60">
          <span className="text-slate-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Enricho MCP
          </span>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1 rounded">
            {enrichoStatus?.isConnected ? 'Ready' : 'Simulated'}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-slate-950/60 border border-slate-800/60">
          <span className="text-slate-300 flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                gmailStatus?.isConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            ></span>
            Gmail API
          </span>
          <span
            className={`text-[10px] font-mono px-1 rounded ${
              gmailStatus?.isConnected
                ? 'text-emerald-400 bg-emerald-500/10'
                : 'text-amber-400 bg-amber-500/10'
            }`}
          >
            {gmailStatus?.isConnected ? 'Connected' : 'OAuth Ready'}
          </span>
        </div>
      </div>
    </aside>
  );
}
