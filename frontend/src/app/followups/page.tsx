'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CalendarCheck,
  Clock,
  AlertCircle,
  CheckCircle2,
  Send,
  Plus,
  Sparkles,
  Building2,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function FollowUpsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'overdue' | 'upcoming' | 'completed'>('pending');

  const fetchFollowUps = () => {
    setLoading(true);
    api
      .getFollowUps()
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFollowUps();
  }, []);

  const handleComplete = async (id: string) => {
    try {
      await api.completeFollowUp(id);
      fetchFollowUps();
    } catch (err: any) {
      alert(`Error completing follow-up: ${err.message}`);
    }
  };

  const handleGenerateEmail = async (id: string) => {
    try {
      const res = await api.generateFollowUpEmail(id);
      alert(`AI follow-up draft created! Subject: "${res.draft?.subject}". Check Email Inbox to send.`);
    } catch (err: any) {
      alert(`Error generating email: ${err.message}`);
    }
  };

  const items = data?.[activeTab] || [];
  const stats = data?.stats || { total: 0, pendingCount: 0, overdueCount: 0, upcomingCount: 0 };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
            <CalendarCheck className="w-3.5 h-3.5" />
            Outreach Cadence Management
          </div>
          <h2 className="text-2xl font-bold text-white mt-1">Follow-up Sequences & Reminders</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Never let a warm deal slip. Recommended multi-touch cadence: Day 0 (Initial), Day 3 (Follow-up 1), Day 7 (Follow-up 2), Day 14 (Break-up).
          </p>
        </div>
      </div>

      {/* Recommended Cadence Banner */}
      <div className="grid grid-cols-4 gap-3 text-xs bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <span className="text-[10px] text-blue-400 font-bold uppercase block">Day 0</span>
          <span className="font-semibold text-slate-200">Initial Outreach</span>
          <p className="text-[11px] text-slate-400 mt-0.5">Direct value pitch on distribution expansion.</p>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <span className="text-[10px] text-indigo-400 font-bold uppercase block">Day 3</span>
          <span className="font-semibold text-slate-200">First Follow-up</span>
          <p className="text-[11px] text-slate-400 mt-0.5">Share relevant regional warehousing case study.</p>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <span className="text-[10px] text-amber-400 font-bold uppercase block">Day 7</span>
          <span className="font-semibold text-slate-200">Second Follow-up</span>
          <p className="text-[11px] text-slate-400 mt-0.5">Offer rate comparison or 10-minute audit call.</p>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <span className="text-[10px] text-pink-400 font-bold uppercase block">Day 14</span>
          <span className="font-semibold text-slate-200">Final Follow-up</span>
          <p className="text-[11px] text-slate-400 mt-0.5">Polite break-up email with leave-behind deck.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 text-xs">
        <button
          onClick={() => setActiveTab('pending')}
          className={`py-2.5 px-4 font-semibold border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'pending'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Pending ({stats.pendingCount})</span>
        </button>
        <button
          onClick={() => setActiveTab('overdue')}
          className={`py-2.5 px-4 font-semibold border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'overdue'
              ? 'border-red-500 text-red-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Overdue ({stats.overdueCount})</span>
        </button>
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`py-2.5 px-4 font-semibold border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'upcoming'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Upcoming ({stats.upcomingCount})</span>
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`py-2.5 px-4 font-semibold border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'completed'
              ? 'border-slate-500 text-slate-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Completed</span>
        </button>
      </div>

      {/* Follow-ups List */}
      <div className="space-y-3">
        {items.map((item: any) => (
          <div
            key={item.id}
            className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl flex items-center justify-between shadow-md"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-white text-sm">{item.title}</span>
                <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.2 rounded font-mono">
                  Step {item.sequenceStep}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="text-slate-300 font-semibold">{item.company?.name}</span>
                <span>•</span>
                <span>{item.contact?.fullName} ({item.contact?.email})</span>
                <span>•</span>
                <span className="flex items-center gap-1 font-mono text-amber-400">
                  <Clock className="w-3 h-3" /> Due {formatDate(item.dueDate)}
                </span>
              </div>
              {item.notes && <p className="text-[11px] text-slate-400 italic mt-1">{item.notes}</p>}
            </div>

            <div className="flex items-center gap-2">
              {item.status === 'PENDING' && (
                <>
                  <button
                    onClick={() => handleGenerateEmail(item.id)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate Follow-up Draft
                  </button>
                  <button
                    onClick={() => handleComplete(item.id)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Completed
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {items.length === 0 && !loading && (
          <div className="p-12 text-center text-slate-400 text-xs bg-slate-900/40 border border-slate-800 rounded-xl">
            No follow-ups in this tab. All prospects are up to date!
          </div>
        )}
      </div>
    </div>
  );
}
