'use client';

import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  Sparkles,
  CheckCircle2,
  Trash2,
  Edit2,
  ShieldCheck,
  TrendingUp,
  RotateCw,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';

export default function ServicesPage() {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reMatching, setReMatching] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [valueProposition, setValueProposition] = useState('');
  const [caseStudies, setCaseStudies] = useState('');
  const [targetIndustries, setTargetIndustries] = useState('');
  const [targetSizes, setTargetSizes] = useState('');
  const [businessProblems, setBusinessProblems] = useState('');

  const fetchServices = () => {
    setLoading(true);
    api
      .getServices()
      .then((res) => setServices(res.services || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchServices();
  }, []);

  const handleOpenAdd = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setValueProposition('');
    setCaseStudies('');
    setTargetIndustries('D2C, E-commerce, Retail');
    setTargetSizes('51-200, 201-500');
    setBusinessProblems('High transit delivery times, Excessive line-haul damage');
    setShowModal(true);
  };

  const handleOpenEdit = (s: any) => {
    setEditingId(s.id);
    setName(s.name);
    setDescription(s.description);
    setValueProposition(s.valueProposition);
    setCaseStudies(s.caseStudies || '');
    setTargetIndustries(s.targetIndustries?.join(', ') || '');
    setTargetSizes(s.targetCompanySizes?.join(', ') || '');
    setBusinessProblems(s.businessProblems?.join(', ') || '');
    setShowModal(true);
  };

  const handleSaveService = async () => {
    if (!name || !description || !valueProposition) {
      alert('Please fill out Name, Description, and Value Proposition.');
      return;
    }

    const payload = {
      name,
      description,
      valueProposition,
      caseStudies,
      targetIndustries: targetIndustries.split(',').map((s) => s.trim()).filter(Boolean),
      targetCompanySizes: targetSizes.split(',').map((s) => s.trim()).filter(Boolean),
      businessProblems: businessProblems.split(',').map((s) => s.trim()).filter(Boolean),
    };

    try {
      if (editingId) {
        await api.updateService(editingId, payload);
      } else {
        await api.createService(payload);
      }
      setShowModal(false);
      fetchServices();
    } catch (err: any) {
      alert(`Save error: ${err.message}`);
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm('Are you sure you want to delete this service?')) return;
    try {
      await api.deleteService(id);
      fetchServices();
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  const handleReMatchAll = async () => {
    setReMatching(true);
    try {
      const res = await api.matchAllServices();
      alert(`Service-to-Lead Matching completed! Processed ${res.companiesProcessed} accounts, updated ${res.totalMatches} matches.`);
    } catch (err: any) {
      alert(`Matching notice: ${err.message}`);
    } finally {
      setReMatching(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
            <Package className="w-3.5 h-3.5" />
            Service Intelligence Module
          </div>
          <h2 className="text-2xl font-bold text-white mt-1">ChaseHorse Service Catalog</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure ChaseHorse&apos;s actual logistics solutions, target criteria, and value propositions. Gemini AI compares prospects strictly against this catalog.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReMatchAll}
            disabled={reMatching}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition-all"
          >
            <RotateCw className={`w-3.5 h-3.5 ${reMatching ? 'animate-spin text-blue-400' : ''}`} />
            Re-match All Leads
          </button>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add ChaseHorse Service
          </button>
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {services.map((svc) => (
          <div
            key={svc.id}
            className="bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 p-6 rounded-xl space-y-4 transition-all shadow-xl flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">{svc.name}</h3>
                  <span className="text-[11px] font-mono text-slate-400">{svc.slug}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenEdit(svc)}
                    className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                    title="Edit Service"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteService(svc.id)}
                    className="p-1.5 rounded-md bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400"
                    title="Delete Service"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{svc.description}</p>

              {/* Value Proposition */}
              <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg text-xs space-y-1">
                <div className="font-semibold text-blue-400">Value Proposition:</div>
                <p className="text-slate-300 leading-relaxed">{svc.valueProposition}</p>
              </div>

              {/* Target Industries & Problems */}
              <div className="space-y-2 text-xs pt-1">
                <div>
                  <span className="text-slate-400">Target Industries:</span>{' '}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {svc.targetIndustries?.map((ind: string, idx: number) => (
                      <span key={idx} className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                        {ind}
                      </span>
                    ))}
                  </div>
                </div>

                {svc.businessProblems?.length > 0 && (
                  <div className="pt-1">
                    <span className="text-slate-400">Operational Pain Points Addressed:</span>
                    <ul className="list-disc list-inside text-[11px] text-slate-400 mt-1 space-y-0.5">
                      {svc.businessProblems.slice(0, 3).map((prob: string, idx: number) => (
                        <li key={idx} className="truncate">{prob}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Case Studies Footer */}
            {svc.caseStudies && (
              <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 italic">
                <strong className="text-emerald-400 not-italic">Case Study Evidence:</strong> {svc.caseStudies}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Service Edit/Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0b101d] border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-400" />
                {editingId ? 'Edit ChaseHorse Service' : 'Add New ChaseHorse Service'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Service Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Multi-City Distributed Warehousing"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Service Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Comprehensive description of logistics capabilities, SLAs, infrastructure..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Value Proposition (What Makes ChaseHorse Win)</label>
                <textarea
                  value={valueProposition}
                  onChange={(e) => setValueProposition(e.target.value)}
                  rows={2}
                  placeholder="Specific metrics e.g. 30% freight cost reduction, 98.5% same-day dispatch SLA..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Target Industries (Comma-separated)</label>
                <input
                  type="text"
                  value={targetIndustries}
                  onChange={(e) => setTargetIndustries(e.target.value)}
                  placeholder="D2C, Manufacturing, FMCG, Retail"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Target Company Sizes (Comma-separated)</label>
                <input
                  type="text"
                  value={targetSizes}
                  onChange={(e) => setTargetSizes(e.target.value)}
                  placeholder="11-50, 51-200, 201-500, 501-1000"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Business Problems Addressed (Comma-separated)</label>
                <textarea
                  value={businessProblems}
                  onChange={(e) => setBusinessProblems(e.target.value)}
                  rows={2}
                  placeholder="Delayed delivery times, Cross-zone air freight costs, Return management latency"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Case Study Evidence / Reference Track Record</label>
                <textarea
                  value={caseStudies}
                  onChange={(e) => setCaseStudies(e.target.value)}
                  rows={2}
                  placeholder="e.g. Scaled leading skincare brand from 10k to 80k monthly orders cutting transit times by 40%."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveService}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20"
              >
                Save Service Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
