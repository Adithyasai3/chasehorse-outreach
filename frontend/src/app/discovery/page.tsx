'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Sparkles,
  Filter,
  CheckCircle2,
  ChevronRight,
  Building2,
  Users,
  ShieldCheck,
  Zap,
  ArrowRight,
  Send,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatScore } from '@/lib/utils';

const samplePrompts = [
  'Find D2C brands in India that are expanding into multiple cities and may require logistics and supply chain services. Identify their founders, COOs and operations heads.',
  'Find manufacturing companies in India with 100-1000 employees that could benefit from supply chain optimization and logistics management.',
  'Find e-commerce companies in India, UAE and Singapore that are expanding their distribution operations.',
  'Find fresh food and FMCG brands requiring temperature-controlled cold chain logistics and fast fulfillment.',
];

const availableIndustries = [
  'Manufacturing',
  'E-commerce',
  'D2C',
  'Retail',
  'FMCG',
  'Pharmaceuticals',
  'Import and export',
  'Logistics',
  'Warehousing',
  'Industrial',
  'Consumer Goods',
];

const sizeBands = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

export default function LeadDiscoveryPage() {
  const [query, setQuery] = useState('');
  const [interpreting, setInterpreting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(0);
  const [stepMessage, setStepMessage] = useState<string>('');

  // Structured Filters
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>(['D2C', 'Manufacturing']);
  const [selectedCountry, setSelectedCountry] = useState('India');
  const [selectedSizes, setSelectedSizes] = useState<string[]>(['51-200', '201-500']);
  const [targetRoles, setTargetRoles] = useState<string[]>([
    'Founder',
    'COO',
    'Head of Operations',
    'Supply Chain Director',
  ]);
  const [enrichContacts, setEnrichContacts] = useState(true);
  const [resultsLimit, setResultsLimit] = useState(4);

  // Search Results
  const [discoveredCompanies, setDiscoveredCompanies] = useState<any[]>([]);
  const [searchStats, setSearchStats] = useState<any>(null);

  // Handle Natural Language Interpretation
  const handleInterpret = async (customQuery?: string) => {
    const q = customQuery || query;
    if (!q.trim()) return;

    setInterpreting(true);
    try {
      const res = await api.interpretQuery(q);
      const f = res.filters;
      if (f.industries?.length) setSelectedIndustries(f.industries);
      if (f.geographies?.country) setSelectedCountry(f.geographies.country);
      if (f.companySizeBands?.length) setSelectedSizes(f.companySizeBands);
      if (f.targetRoles?.length) setTargetRoles(f.targetRoles);
    } catch (err: any) {
      console.warn('Interpret error:', err);
    } finally {
      setInterpreting(false);
    }
  };

  // Execute Search Pipeline
  const handleExecuteSearch = async () => {
    setExecuting(true);
    setDiscoveredCompanies([]);
    setActiveStep(1);
    setStepMessage('Gemini AI analyzing prospecting criteria...');

    try {
      setTimeout(() => {
        setActiveStep(2);
        setStepMessage('Enricho MCP discovering target company accounts...');
      }, 700);

      setTimeout(() => {
        setActiveStep(3);
        setStepMessage('Identifying verified decision-makers & professional emails...');
      }, 1500);

      setTimeout(() => {
        setActiveStep(4);
        setStepMessage('Gemini evaluating logistics challenges & lead qualification score (0-100)...');
      }, 2300);

      const payload = {
        query: query.trim() || undefined,
        filters: {
          rawQuery: query,
          industries: selectedIndustries,
          geographies: { country: selectedCountry, cities: [] },
          companySizeBands: selectedSizes,
          targetRoles,
          requiresEmail: true,
          requiresLinkedIn: true,
        },
        enrichContacts,
        maxCompanies: resultsLimit,
      };

      const res = await api.executeSearch(payload);
      setActiveStep(5);
      setStepMessage('Matching ChaseHorse service intelligence & saving to CRM...');

      setTimeout(() => {
        setDiscoveredCompanies(res.companies || []);
        setSearchStats({
          count: res.count,
          creditsUsed: res.creditsUsed,
          executionTimeMs: res.executionTimeMs,
        });
        setExecuting(false);
        setActiveStep(0);
      }, 600);
    } catch (err: any) {
      console.error('Search execution failed:', err);
      alert(`Search execution failed: ${err.message}`);
      setExecuting(false);
      setActiveStep(0);
    }
  };

  const estimatedCredits = enrichContacts ? resultsLimit * 2 : 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          Natural Language Lead Sourcing
        </div>
        <h2 className="text-2xl font-bold text-white mt-1">Lead Discovery & Enrichment</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Describe your ideal customer profile in plain English. Gemini translates intent, Enricho MCP discovers target accounts, and leads are scored against ChaseHorse logistics capabilities.
        </p>
      </div>

      {/* Natural Language Search Input Box */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="relative">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={3}
            placeholder="e.g. Find D2C brands in India that are expanding into multiple cities and may require logistics and supply chain services. Identify their founders, COOs and operations heads."
            className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl p-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all resize-none"
          />
          <div className="absolute right-3 bottom-3 flex items-center gap-2">
            <button
              onClick={() => handleInterpret()}
              disabled={interpreting || !query.trim()}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {interpreting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" /> : <Sparkles className="w-3.5 h-3.5 text-blue-400" />}
              Interpret Intent
            </button>
            <button
              onClick={handleExecuteSearch}
              disabled={executing}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {executing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Execute Discovery
            </button>
          </div>
        </div>

        {/* Suggested Prompts */}
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-slate-400">Quick Prompt Presets:</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {samplePrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setQuery(p);
                  handleInterpret(p);
                }}
                className="text-left text-xs bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-slate-700 p-2.5 rounded-lg text-slate-300 transition-all truncate"
              >
                &ldquo;{p}&rdquo;
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Structured Search Filters & Credit Control */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Filter className="w-4 h-4 text-blue-400" />
            Configured Search Filters (Interpreted by AI)
          </div>
          {/* Credit Estimation Badge */}
          <div className="flex items-center gap-2 text-xs bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-full text-indigo-300">
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span>Estimated Credits: <strong>{estimatedCredits}</strong> (Company Preview: 0 | Contacts: {estimatedCredits})</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
          {/* Target Industries */}
          <div className="space-y-2">
            <label className="font-medium text-slate-300 block">Target Industries</label>
            <div className="flex flex-wrap gap-1.5">
              {availableIndustries.map((ind) => {
                const isSelected = selectedIndustries.includes(ind);
                return (
                  <button
                    key={ind}
                    onClick={() => {
                      setSelectedIndustries(
                        isSelected
                          ? selectedIndustries.filter((i) => i !== ind)
                          : [...selectedIndustries, ind]
                      );
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {ind}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Company Size Bands */}
          <div className="space-y-2">
            <label className="font-medium text-slate-300 block">Headcount Size</label>
            <div className="flex flex-wrap gap-1.5">
              {sizeBands.map((sz) => {
                const isSelected = selectedSizes.includes(sz);
                return (
                  <button
                    key={sz}
                    onClick={() => {
                      setSelectedSizes(
                        isSelected ? selectedSizes.filter((s) => s !== sz) : [...selectedSizes, sz]
                      );
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sz} emp
                  </button>
                );
              })}
            </div>
          </div>

          {/* Geography & Limits */}
          <div className="space-y-3">
            <div>
              <label className="font-medium text-slate-300 block mb-1">Target Geography</label>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="India">India (Domestic Sourcing)</option>
                <option value="UAE">United Arab Emirates</option>
                <option value="Singapore">Singapore</option>
                <option value="Global">Global / All Regions</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="text-slate-300 font-medium">Batch Lead Count:</label>
              <select
                value={resultsLimit}
                onChange={(e) => setResultsLimit(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-xs text-slate-200"
              >
                <option value={2}>2 accounts</option>
                <option value={4}>4 accounts</option>
                <option value={6}>6 accounts</option>
                <option value={8}>8 accounts</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="enrichContacts"
                checked={enrichContacts}
                onChange={(e) => setEnrichContacts(e.target.checked)}
                className="rounded bg-slate-950 border-slate-800 text-blue-600 focus:ring-0"
              />
              <label htmlFor="enrichContacts" className="text-slate-300 text-[11px]">
                Enrich decision-maker emails via Enricho MCP
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Execution Progress Bar */}
      {executing && (
        <div className="bg-slate-900 border border-blue-500/30 p-6 rounded-xl space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-blue-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Executing Prospecting Pipeline (Step {activeStep} of 5)
            </span>
            <span className="text-slate-400 font-mono">{activeStep * 20}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${activeStep * 20}%` }}
            ></div>
          </div>
          <p className="text-xs text-slate-300 italic">{stepMessage}</p>
        </div>
      )}

      {/* Discovered Results Display */}
      {discoveredCompanies.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Discovered & Enriched Prospects ({discoveredCompanies.length})
              </h3>
              <p className="text-xs text-slate-400">
                Completed in {searchStats?.executionTimeMs}ms • Consumed {searchStats?.creditsUsed} Enricho credits
              </p>
            </div>
            <Link
              href="/kanban"
              className="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600 hover:text-white text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              Manage in Kanban CRM
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {discoveredCompanies.map((c) => {
              const scoreStyle = formatScore(c.leadScore);
              const topMatch = c.serviceMatches?.[0];
              const primaryContact = c.contacts?.find((ct: any) => ct.isPrimary) || c.contacts?.[0];

              return (
                <div
                  key={c.id}
                  className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 p-5 rounded-xl space-y-4 transition-all shadow-lg flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-bold text-white">{c.name}</h4>
                          <span className="text-[11px] text-slate-400">({c.domain})</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span>{c.industry}</span>
                          <span>•</span>
                          <span>{c.city || 'India'}</span>
                          <span>•</span>
                          <span>{c.headcount} employees</span>
                        </div>
                      </div>

                      {/* Score Badge */}
                      <div className={`px-2.5 py-1 rounded-md border text-xs font-mono font-bold ${scoreStyle.bg} ${scoreStyle.color}`}>
                        {c.leadScore}/100
                      </div>
                    </div>

                    {/* AI Qualification Reason */}
                    <p className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg leading-relaxed">
                      <strong className="text-blue-400">AI Qualification:</strong> {c.qualificationReason}
                    </p>

                    {/* Matched ChaseHorse Service */}
                    {topMatch && (
                      <div className="text-xs bg-indigo-950/30 border border-indigo-800/40 p-3 rounded-lg space-y-1">
                        <div className="flex items-center justify-between text-indigo-300 font-semibold">
                          <span>Relevant Service: {topMatch.service?.name}</span>
                          <span className="text-[10px] bg-indigo-500/20 px-1.5 py-0.5 rounded font-mono">
                            {topMatch.relevanceScore}% fit
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300">{topMatch.whyRelevant}</p>
                      </div>
                    )}

                    {/* Identified Decision-Makers */}
                    {c.contacts?.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[11px] font-medium text-slate-400">Identified Contacts:</div>
                        <div className="flex flex-wrap gap-2">
                          {c.contacts.map((ct: any) => (
                            <div
                              key={ct.id}
                              className="text-xs bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-md flex items-center gap-2"
                            >
                              <span className="font-semibold text-slate-200">{ct.fullName}</span>
                              <span className="text-slate-400">({ct.title})</span>
                              {ct.isEmailVerified && (
                                <span title="Verified Business Email">
                                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Saved in CRM
                    </span>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/inbox?draftFor=${c.id}`}
                        className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        Draft Outreach
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
