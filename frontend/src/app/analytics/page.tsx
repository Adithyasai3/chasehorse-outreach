'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart,
  Users,
  Building2,
  Send,
  MailCheck,
  Award,
  Zap,
  Globe2,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getAnalytics()
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const m = data?.metrics || {
    totalCompanies: 0,
    totalEnrichedCompanies: 0,
    totalQualifiedLeads: 0,
    totalContacts: 0,
    totalVerifiedEmails: 0,
    totalDrafts: 0,
    totalSentEmails: 0,
    totalReplies: 0,
    positiveReplies: 0,
    meetingsScheduled: 0,
    convertedCustomers: 0,
    pendingFollowUps: 0,
    replyRate: 0,
    positiveResponseRate: 0,
    enrichmentCreditsConsumed: 0,
    geminiTotalTokens: 0,
  };

  const statCards = [
    { label: 'Total Companies Discovered', value: m.totalCompanies, icon: Building2, color: 'text-blue-400' },
    { label: 'AI Qualified Accounts (70+)', value: m.totalQualifiedLeads, icon: Award, color: 'text-indigo-400' },
    { label: 'Verified Contacts', value: m.totalVerifiedEmails, icon: Users, color: 'text-emerald-400' },
    { label: 'Emails Sent', value: m.totalSentEmails, icon: Send, color: 'text-purple-400' },
    { label: 'Replies Received', value: m.totalReplies, icon: MailCheck, color: 'text-pink-400' },
    { label: 'Reply Rate', value: `${m.replyRate}%`, icon: TrendingUp, color: 'text-cyan-400' },
    { label: 'Positive Sentiment Rate', value: `${m.positiveResponseRate}%`, icon: Sparkles, color: 'text-amber-400' },
    { label: 'Enricho Credits Used', value: m.enrichmentCreditsConsumed, icon: Zap, color: 'text-orange-400' },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
          <BarChart3 className="w-3.5 h-3.5" />
          Outreach Performance Intelligence
        </div>
        <h2 className="text-2xl font-bold text-white mt-1">Real-Time Platform Analytics</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Live pipeline metrics, conversion velocity, geographic and industry distributions derived strictly from your PostgreSQL database.
        </p>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-xl space-y-2"
            >
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>{card.label}</span>
                <Icon className={`w-4 h-4 ${card.color}`} />
              </div>
              <div className="text-2xl font-bold text-white font-mono mt-2">
                {loading ? '—' : card.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Conversion Funnel Section */}
      <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-xl space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            Complete Pipeline Funnel
          </h3>
          <p className="text-xs text-slate-400">Progression from discovery to signed customer accounts</p>
        </div>

        <div className="space-y-3">
          {(data?.funnel || []).map((step: any, idx: number) => {
            const max = Math.max(...(data?.funnel?.map((f: any) => f.count) || [1]), 1);
            const pct = Math.round((step.count / max) * 100);

            return (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: step.color }}></span>
                    {step.stageName}
                  </span>
                  <span className="font-mono text-slate-300 font-bold">{step.count} leads</span>
                </div>
                <div className="h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.max(pct, 6)}%`,
                      backgroundColor: step.color,
                    }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Industry & Geography Distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Industry Breakdown */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-xl space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <PieChart className="w-4 h-4 text-indigo-400" />
            Industry Distribution
          </h3>
          <div className="space-y-3">
            {(data?.industryDistribution || []).map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-300 font-medium">{item.industry}</span>
                <span className="font-mono text-indigo-400 font-bold">{item.count} companies</span>
              </div>
            ))}
            {(!data?.industryDistribution || data.industryDistribution.length === 0) && (
              <div className="text-slate-400 text-xs py-4 text-center">No industry data yet.</div>
            )}
          </div>
        </div>

        {/* Geography Breakdown */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-xl space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-emerald-400" />
            Geographic Concentration
          </h3>
          <div className="space-y-3">
            {(data?.geographyDistribution || []).map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-300 font-medium">{item.city}</span>
                <span className="font-mono text-emerald-400 font-bold">{item.count} companies</span>
              </div>
            ))}
            {(!data?.geographyDistribution || data.geographyDistribution.length === 0) && (
              <div className="text-slate-400 text-xs py-4 text-center">No geographic data yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
