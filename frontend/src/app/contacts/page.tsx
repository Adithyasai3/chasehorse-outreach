'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  ShieldCheck,
  Send,
  ExternalLink,
  Building2,
  Mail,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';

export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('ALL');
  const [seniority, setSeniority] = useState('ALL');

  useEffect(() => {
    setLoading(true);
    api
      .getContacts({
        search: search || undefined,
        role: role !== 'ALL' ? role : undefined,
        seniority: seniority !== 'ALL' ? seniority : undefined,
      })
      .then((res) => setContacts(res.contacts || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [search, role, seniority]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
            <Users className="w-3.5 h-3.5" />
            Decision-Maker Directory
          </div>
          <h2 className="text-2xl font-bold text-white mt-1">Identified Contacts ({contacts.length})</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Key operational executives, founders, COOs, and supply chain managers enriched via Enricho MCP.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by contact name, email, designation..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300"
          >
            <option value="ALL">All Roles</option>
            <option value="Executive">Executive / Founders</option>
            <option value="Operations">Operations</option>
            <option value="Supply Chain">Supply Chain</option>
            <option value="Procurement">Procurement</option>
          </select>

          <select
            value={seniority}
            onChange={(e) => setSeniority(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300"
          >
            <option value="ALL">All Seniority Levels</option>
            <option value="founder">Founders & Owners</option>
            <option value="c_suite">C-Suite (CEO, COO)</option>
            <option value="vp">VP Level</option>
            <option value="head">Department Heads</option>
            <option value="director">Directors</option>
          </select>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/60 border-b border-slate-800/80 text-slate-400 font-medium">
            <tr>
              <th className="py-3 px-4">Contact Name</th>
              <th className="py-3 px-4">Designation & Role</th>
              <th className="py-3 px-4">Company</th>
              <th className="py-3 px-4">Email Address</th>
              <th className="py-3 px-4">Seniority</th>
              <th className="py-3 px-4 text-right">Outreach</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-200">
            {contacts.map((ct) => (
              <tr key={ct.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-3.5 px-4">
                  <div className="font-bold text-white text-sm">{ct.fullName}</div>
                  {ct.isPrimary && (
                    <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.2 rounded font-mono">
                      Primary Account Contact
                    </span>
                  )}
                </td>
                <td className="py-3.5 px-4">
                  <div>{ct.title || 'Decision Maker'}</div>
                  <div className="text-[11px] text-slate-400">{ct.role || 'Operations'}</div>
                </td>
                <td className="py-3.5 px-4">
                  <div className="font-semibold text-slate-200">{ct.company?.name}</div>
                  <div className="text-[11px] text-slate-400 font-mono">{ct.company?.domain}</div>
                </td>
                <td className="py-3.5 px-4">
                  <div className="font-mono text-slate-300 flex items-center gap-1.5">
                    {ct.email || '—'}
                    {ct.isEmailVerified && (
                      <span title="Verified Business Email">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3.5 px-4">
                  <span className="text-[10px] bg-slate-800 border border-slate-700/80 px-2 py-0.5 rounded uppercase font-semibold text-slate-300">
                    {ct.seniority || 'manager'}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {ct.linkedinUrl && (
                      <a
                        href={ct.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all text-xs"
                        title="LinkedIn Profile"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <Link
                      href={`/inbox?companyId=${ct.companyId}&contactId=${ct.id}`}
                      className="px-2.5 py-1 rounded bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600 hover:text-white transition-all font-medium inline-flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      Draft
                    </Link>
                  </div>
                </td>
              </tr>
            ))}

            {contacts.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  No decision makers found matching search criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
