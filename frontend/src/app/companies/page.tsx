'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building2,
  Search,
  Filter,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Send,
  MoreVertical,
  ArrowUpDown,
  Plus,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatScore, formatDate } from '@/lib/utils';
import { CompanyWorkspaceDrawer } from '@/components/kanban/company-workspace-drawer';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState('ALL');
  const [selectedPriority, setSelectedPriority] = useState('ALL');
  const [sortBy, setSortBy] = useState('leadScore');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const fetchCompanies = () => {
    setLoading(true);
    api
      .getCompanies({
        search: searchTerm || undefined,
        industry: selectedIndustry !== 'ALL' ? selectedIndustry : undefined,
        priority: selectedPriority !== 'ALL' ? selectedPriority : undefined,
        sortBy,
      })
      .then((res) => setCompanies(res.companies || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCompanies();
  }, [searchTerm, selectedIndustry, selectedPriority, sortBy]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
            <Building2 className="w-3.5 h-3.5" />
            Account Directory
          </div>
          <h2 className="text-2xl font-bold text-white mt-1">Target Companies ({companies.length})</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Complete database of discovered enterprise and D2C accounts enriched with intelligence.
          </p>
        </div>

        <Link
          href="/discovery"
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 flex items-center gap-1.5 transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Discover New Companies
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by company name, domain, city..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedIndustry}
            onChange={(e) => setSelectedIndustry(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300"
          >
            <option value="ALL">All Industries</option>
            <option value="D2C">D2C Brands</option>
            <option value="Manufacturing">Manufacturing</option>
            <option value="FMCG">FMCG</option>
            <option value="E-commerce">E-commerce</option>
            <option value="Logistics">Logistics</option>
          </select>

          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300"
          >
            <option value="ALL">All Priorities</option>
            <option value="HIGH">High Priority</option>
            <option value="MEDIUM">Medium Priority</option>
            <option value="LOW">Low Priority</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 font-mono"
          >
            <option value="leadScore">Sort: Lead Score</option>
            <option value="name">Sort: Name (A-Z)</option>
            <option value="createdAt">Sort: Recently Added</option>
          </select>
        </div>
      </div>

      {/* Companies Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/60 border-b border-slate-800/80 text-slate-400 font-medium">
            <tr>
              <th className="py-3 px-4">Company</th>
              <th className="py-3 px-4">Industry & Location</th>
              <th className="py-3 px-4">Headcount</th>
              <th className="py-3 px-4">Lead Score</th>
              <th className="py-3 px-4">Primary Contact</th>
              <th className="py-3 px-4">Relevant Service</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-200">
            {companies.map((c) => {
              const score = formatScore(c.leadScore);
              const primaryContact = c.contacts?.find((ct: any) => ct.isPrimary) || c.contacts?.[0];
              const topService = c.serviceMatches?.[0]?.service;

              return (
                <tr
                  key={c.id}
                  onClick={() => setSelectedCompanyId(c.id)}
                  className="hover:bg-slate-800/30 cursor-pointer transition-colors"
                >
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-white text-sm">{c.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{c.domain || 'no domain'}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div>{c.industry || '—'}</div>
                    <div className="text-[11px] text-slate-400">{c.city || 'India'}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-300">
                    {c.headcount || '—'}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2 py-0.5 rounded border text-[11px] font-mono font-bold ${score.bg} ${score.color}`}>
                      {c.leadScore} / 100
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    {primaryContact ? (
                      <div>
                        <div className="font-semibold text-slate-200 flex items-center gap-1">
                          {primaryContact.fullName}
                          {primaryContact.isEmailVerified && (
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">{primaryContact.title}</div>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">None identified</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    {topService ? (
                      <span className="text-[11px] bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded truncate max-w-[160px] inline-block">
                        {topService.name}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Not matched</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Link
                      href={`/inbox?companyId=${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="px-2.5 py-1 rounded bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600 hover:text-white transition-all font-medium inline-flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      Outreach
                    </Link>
                  </td>
                </tr>
              );
            })}

            {companies.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  No matching companies found. Try adjusting filters or discovering new accounts.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Drawer */}
      {selectedCompanyId && (
        <CompanyWorkspaceDrawer
          companyId={selectedCompanyId}
          onClose={() => setSelectedCompanyId(null)}
          onUpdated={fetchCompanies}
        />
      )}
    </div>
  );
}
