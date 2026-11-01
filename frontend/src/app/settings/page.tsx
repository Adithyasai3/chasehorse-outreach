'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  ShieldAlert,
  Trash2,
  Plus,
  ShieldCheck,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function SettingsPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [email, setEmail] = useState('');
  const [domain, setDomain] = useState('');
  const [reason, setReason] = useState('MANUAL_EXCLUSION');
  const [adding, setAdding] = useState(false);

  const fetchList = () => {
    setLoading(true);
    api
      .getSuppressionList()
      .then((res) => setList(res.list || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() && !domain.trim()) {
      alert('Provide either an email address or a domain.');
      return;
    }

    setAdding(true);
    try {
      await api.addSuppression({
        email: email.trim() || undefined,
        domain: domain.trim() || undefined,
        reason,
      });
      setEmail('');
      setDomain('');
      fetchList();
    } catch (err: any) {
      alert(`Add error: ${err.message}`);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this entry from the suppression list?')) return;
    try {
      await api.removeSuppression(id);
      fetchList();
    } catch (err: any) {
      alert(`Remove error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
          <Settings className="w-3.5 h-3.5" />
          Governance &amp; Privacy Compliance
        </div>
        <h2 className="text-2xl font-bold text-white mt-1">Suppression &amp; Compliance Settings</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Manage unsubscribe lists, excluded domains, and anti-spam suppression. The system guarantees that suppressed emails and domains are automatically blocked from outreach dispatch.
        </p>
      </div>

      {/* Add to Suppression List */}
      <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-xl space-y-4 shadow-xl">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          Add to Suppression List
        </h3>

        <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="text-slate-300 font-medium block mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. competitor@example.com"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
            />
          </div>

          <div>
            <label className="text-slate-300 font-medium block mb-1">Or Domain to Block</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. blacklist-domain.com"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
            />
          </div>

          <div>
            <label className="text-slate-300 font-medium block mb-1">Suppression Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-300"
            >
              <option value="UNSUBSCRIBED">Unsubscribed</option>
              <option value="MANUAL_EXCLUSION">Manual Exclusion / Competitor</option>
              <option value="BOUNCED">Hard Bounced</option>
              <option value="SPAM_COMPLAINT">Spam Complaint</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={adding}
              className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add to Suppression
            </button>
          </div>
        </form>
      </div>

      {/* Suppression List Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 text-xs font-semibold text-slate-300 flex items-center justify-between">
          <span>Suppressed Entries ({list.length})</span>
          <span className="text-[10px] text-emerald-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Enforced on All Outbound Dispatches
          </span>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/60 border-b border-slate-800/80 text-slate-400 font-medium">
            <tr>
              <th className="py-3 px-4">Blocked Target</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Reason</th>
              <th className="py-3 px-4">Added Date</th>
              <th className="py-3 px-4 text-right">Remove</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-200">
            {list.map((item) => (
              <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-3 px-4 font-mono font-semibold text-white">
                  {item.email || item.domain}
                </td>
                <td className="py-3 px-4 text-slate-400">
                  {item.email ? 'Individual Email' : 'Entire Domain'}
                </td>
                <td className="py-3 px-4">
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                    {item.reason}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-400 font-mono">
                  {formatDate(item.createdAt)}
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all"
                    title="Remove from suppression"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}

            {list.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  Suppression list is currently empty.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
