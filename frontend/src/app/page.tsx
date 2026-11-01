'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Users,
  Award,
  Send,
  MailCheck,
  CheckCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Zap,
} from 'lucide-react';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getAnalytics()
      .then((data) => setAnalytics(data))
      .catch((err) => console.error('Dashboard error:', err))
      .finally(() => setLoading(false));
  }, []);

  const metrics = analytics?.metrics || {
    totalCompanies: 3,
    totalEnrichedCompanies: 3,
    totalQualifiedLeads: 3,
    totalContacts: 6,
    totalSentEmails: 1,
    totalReplies: 1,
    positiveReplies: 1,
    meetingsScheduled: 0,
    convertedCustomers: 0,
    pendingFollowUps: 1,
    enrichmentCreditsConsumed: 3,
    geminiTotalTokens: 1780,
  };

  const statCards = [
    { label: 'Discovered Leads', value: metrics.totalCompanies, icon: Building2, color: 'text-blue-400' },
    { label: 'Enriched Profiles', value: metrics.totalEnrichedCompanies, icon: Sparkles, color: 'text-indigo-400' },
    { label: 'High-Fit Qualified', value: metrics.totalQualifiedLeads, icon: Award, color: 'text-emerald-400' },
    { label: 'Decision Makers', value: metrics.totalContacts, icon: Users, color: 'text-sky-400' },
    { label: 'Outreach Sent', value: metrics.totalSentEmails, icon: Send, color: 'text-purple-400' },
    { label: 'Replies Received', value: metrics.totalReplies, icon: MailCheck, color: 'text-pink-400' },
    { label: 'Pending Follow-ups', value: metrics.pendingFollowUps, icon: Clock, color: 'text-amber-400' },
    { label: 'Enricho Credits Used', value: metrics.enrichmentCreditsConsumed, icon: Zap, color: 'text-orange-400' },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Banner / Value Proposition */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900/40 via-indigo-900/20 to-slate-900/40 border border-blue-500/20 p-8 shadow-xl">
        <div className="max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            ChaseHorse Intelligent Sales Pipeline
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Target high-growth businesses requiring logistics & supply chain acceleration.
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Find companies expanding distribution, enrich decision-makers with Enricho MCP, match with ChaseHorse warehousing & freight services, and send personalized Gmail outreach.
          </p>
          <div className="pt-2 flex items-center gap-3">
            <Link
              href="/discovery"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all"
            >
              Start Natural Language Search
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/kanban"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
            >
              Open Kanban Board
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={i}
              className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-xl hover:border-slate-700 transition-all flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-medium text-slate-400">{card.label}</span>
                <Icon className={`w-4 h-4 ${card.color}`} />
              </div>
              <div className="text-2xl font-bold text-white mt-3 font-mono">
                {loading ? '—' : card.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Conversion Funnel & Quick Action Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Outreach Conversion Funnel */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800/80 p-6 rounded-xl space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                Pipeline Conversion Funnel
              </h3>
              <p className="text-xs text-slate-400">Real stage distribution across your active deals</p>
            </div>
            <Link href="/analytics" className="text-xs text-blue-400 hover:underline">
              Deep dive &rarr;
            </Link>
          </div>

          <div className="space-y-3 pt-2">
            {(analytics?.funnel || [
              { stageName: 'Discovered', count: 1, color: '#94a3b8' },
              { stageName: 'Qualified', count: 1, color: '#3b82f6' },
              { stageName: 'Ready to Outreach', count: 1, color: '#6366f1' },
              { stageName: 'Replied', count: 1, color: '#ec4899' },
            ]).map((step: any, idx: number) => {
              const maxCount = Math.max(...(analytics?.funnel?.map((f: any) => f.count) || [1]), 1);
              const percentage = Math.round((step.count / maxCount) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: step.color }}></span>
                      {step.stageName}
                    </span>
                    <span className="text-slate-400 font-mono">{step.count} leads</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(percentage, 8)}%`,
                        backgroundColor: step.color,
                      }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Follow-ups / Action Card */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-xl flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Action Required
              </h3>
              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-mono">
                1 Pending
              </span>
            </div>
            <p className="text-xs text-slate-400">
              High-priority outreach and reply reminders awaiting your attention.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Blissclub</span>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                Reply Received
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              Minu Margeret requested NCR warehouse rate card & Bilaspur hub specs.
            </p>
            <div className="pt-2 flex items-center gap-2">
              <Link
                href="/inbox"
                className="w-full text-center py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition-all"
              >
                Review AI Suggested Reply
              </Link>
            </div>
          </div>

          <Link
            href="/followups"
            className="text-xs text-center text-slate-400 hover:text-white pt-2 border-t border-slate-800 block"
          >
            View all follow-up reminders &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
