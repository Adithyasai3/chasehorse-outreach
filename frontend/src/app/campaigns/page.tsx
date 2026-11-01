'use client';

import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  CheckCircle2,
  Users,
  Target,
  Send,
  Building2,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';

export default function CampaignsPage() {
  const [services, setServices] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  // Sample initial campaign list
  const [campaigns, setCampaigns] = useState<any[]>([
    {
      id: 'camp_1',
      name: 'North India D2C Regional Warehousing Q4',
      serviceName: 'Multi-City Warehousing & Distributed Fulfillment',
      status: 'RUNNING',
      targetAudience: 'D2C Brands in Delhi NCR & Bengaluru with 50+ employees',
      enrolledCount: 18,
      sentCount: 14,
      repliesCount: 4,
      responseRate: '28.5%',
    },
    {
      id: 'camp_2',
      name: 'Auto & Clean Mobility Line-Haul FTL Fleet',
      serviceName: 'Inter-State Freight & Full Truckload (FTL)',
      status: 'RUNNING',
      targetAudience: 'EV & Auto Parts Manufacturers with Hosur / Pune presence',
      enrolledCount: 12,
      sentCount: 9,
      repliesCount: 2,
      responseRate: '22.2%',
    },
    {
      id: 'camp_3',
      name: 'Pharma & Biotech Cold Chain Zero-Excursion',
      serviceName: 'Cold Chain & Temperature-Controlled Logistics',
      status: 'DRAFT',
      targetAudience: 'Biopharma and specialized nutrition brands',
      enrolledCount: 8,
      sentCount: 0,
      repliesCount: 0,
      responseRate: '0%',
    },
  ]);

  // Form
  const [campName, setCampName] = useState('');
  const [campTarget, setCampTarget] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');

  useEffect(() => {
    api.getServices().then((res) => setServices(res.services || []));
  }, []);

  const handleCreateCampaign = () => {
    if (!campName || !campTarget) {
      alert('Please provide campaign name and target audience criteria.');
      return;
    }
    const svc = services.find((s) => s.id === selectedServiceId) || services[0];
    const newCamp = {
      id: `camp_${Date.now()}`,
      name: campName,
      serviceName: svc?.name || 'ChaseHorse Logistics',
      status: 'RUNNING',
      targetAudience: campTarget,
      enrolledCount: 10,
      sentCount: 0,
      repliesCount: 0,
      responseRate: '0%',
    };
    setCampaigns([newCamp, ...campaigns]);
    setShowModal(false);
    setCampName('');
    setCampTarget('');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
            <Megaphone className="w-3.5 h-3.5" />
            Outreach Campaigns
          </div>
          <h2 className="text-2xl font-bold text-white mt-1">Multi-Channel Sales Campaigns</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Orchestrate structured batch prospecting initiatives grouped by ChaseHorse service lines and target personas.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 flex items-center gap-1.5 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Campaign
        </button>
      </div>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {campaigns.map((camp) => (
          <div
            key={camp.id}
            className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-xl space-y-4 flex flex-col justify-between shadow-xl"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                    camp.status === 'RUNNING'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {camp.status}
                </span>
                <span className="text-xs font-mono font-bold text-blue-400">
                  {camp.responseRate} Response
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-white">{camp.name}</h3>
                <p className="text-xs text-blue-300 font-medium mt-0.5">{camp.serviceName}</p>
              </div>

              <div className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                <strong className="text-slate-300">Audience:</strong> {camp.targetAudience}
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs pt-2 border-t border-slate-800/80">
                <div>
                  <span className="text-[10px] text-slate-400 block">Enrolled</span>
                  <span className="font-mono font-bold text-slate-200">{camp.enrolledCount}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Sent</span>
                  <span className="font-mono font-bold text-slate-200">{camp.sentCount}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Replies</span>
                  <span className="font-mono font-bold text-emerald-400">{camp.repliesCount}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setCampaigns(
                  campaigns.map((c) =>
                    c.id === camp.id
                      ? { ...c, status: c.status === 'RUNNING' ? 'PAUSED' : 'RUNNING' }
                      : c
                  )
                );
              }}
              className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-all flex items-center justify-center gap-1.5"
            >
              {camp.status === 'RUNNING' ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400" /> Pause Campaign
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" /> Resume Campaign
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0b101d] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-blue-400" />
                New Outreach Campaign
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Campaign Name</label>
                <input
                  type="text"
                  value={campName}
                  onChange={(e) => setCampName(e.target.value)}
                  placeholder="e.g. Q4 Western India Warehousing Sourcing"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Target Service Line</label>
                <select
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Target Audience Criteria</label>
                <textarea
                  value={campTarget}
                  onChange={(e) => setCampTarget(e.target.value)}
                  rows={3}
                  placeholder="e.g. D2C apparel & beauty brands in Mumbai, Bengaluru with 50-500 headcount"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCampaign}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold"
              >
                Launch Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
