'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Users,
  Search,
  Sparkles,
  Send,
  Mail,
  Calendar,
  FileText,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  RotateCw,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatScore, formatDate } from '@/lib/utils';

export function CompanyWorkspaceDrawer({
  companyId,
  onClose,
  onUpdated,
}: {
  companyId: string;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'research' | 'contacts' | 'emails' | 'insights' | 'activities' | 'notes'
  >('overview');

  // Note addition
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [reQualifying, setReQualifying] = useState(false);

  const fetchDetails = () => {
    setLoading(true);
    api
      .getCompanyById(companyId)
      .then((res) => setCompany(res.company))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (companyId) fetchDetails();
  }, [companyId]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      await api.addCompanyNote(companyId, newNote, 'Sales Rep');
      setNewNote('');
      fetchDetails();
    } catch (err: any) {
      alert(`Failed to add note: ${err.message}`);
    } finally {
      setSavingNote(false);
    }
  };

  const handleReQualify = async () => {
    setReQualifying(true);
    try {
      await api.triggerResearch(companyId);
      fetchDetails();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      alert(`Re-qualification failed: ${err.message}`);
    } finally {
      setReQualifying(false);
    }
  };

  if (!companyId) return null;

  const scoreStyle = company ? formatScore(company.leadScore) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-all animate-in fade-in">
      <div className="w-full max-w-3xl bg-[#0b101d] border-l border-slate-800 h-full flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="p-6 border-b border-slate-800 flex items-start justify-between bg-slate-950/40">
          {loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-6 w-48 bg-slate-800 rounded"></div>
              <div className="h-4 w-32 bg-slate-800 rounded"></div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white">{company.name}</h2>
                <a
                  href={company.website || `https://${company.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-slate-400 hover:text-blue-400 flex items-center gap-1 font-mono"
                >
                  {company.domain}
                  <ExternalLink className="w-3 h-3" />
                </a>
                {scoreStyle && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${scoreStyle.bg} ${scoreStyle.color}`}>
                    Score: {company.leadScore}/100
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {company.industry} • {company.city || 'India'} • {company.headcount} employees • Stage: {company.kanbanStage?.name || 'Discovered'}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleReQualify}
              disabled={reQualifying}
              title="Re-run Gemini AI Research & Qualification"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all text-xs flex items-center gap-1"
            >
              <RotateCw className={`w-3.5 h-3.5 ${reQualifying ? 'animate-spin text-blue-400' : ''}`} />
              Re-score
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-slate-800 gap-1 bg-slate-950/20 text-xs overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', icon: Building2 },
            { id: 'research', label: 'Company Research', icon: Search },
            { id: 'contacts', label: 'Decision Makers', icon: Users },
            { id: 'emails', label: 'Email History', icon: Mail },
            { id: 'insights', label: 'AI Service Matches', icon: Sparkles },
            { id: 'activities', label: 'Activities', icon: Clock },
            { id: 'notes', label: 'Notes', icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-3 font-medium border-b-2 flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-blue-500 text-blue-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="text-center py-16 text-slate-400 text-xs animate-pulse">
              Loading workspace intelligence...
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Summary Card */}
                  <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-3">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Business Summary
                    </h4>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      {company.description || 'No detailed description provided.'}
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-800">
                      <div>
                        <span className="text-slate-400">Business Model:</span>{' '}
                        <span className="text-slate-200 font-medium">{company.businessModel || 'B2B/B2C'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Founded:</span>{' '}
                        <span className="text-slate-200 font-medium">{company.foundedYear || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* AI Qualification Breakdown */}
                  <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                        AI Lead Qualification
                      </h4>
                      <span className="text-xs font-mono font-bold text-blue-400">
                        {company.leadScore} / 100
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                      {company.qualificationReason}
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: COMPANY RESEARCH */}
              {activeTab === 'research' && (
                <div className="space-y-6">
                  {company.research ? (
                    <>
                      {/* Operational Challenges */}
                      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-2">
                        <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Potential Operational & Logistics Challenges
                        </h4>
                        <ul className="space-y-1.5 text-xs text-slate-300">
                          {company.research.operationalChallenges?.map((ch: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-red-400">•</span>
                              <span>{ch}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Expansion Signals */}
                      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-2">
                        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Expansion & Commercial Growth Signals
                        </h4>
                        <ul className="space-y-1.5 text-xs text-slate-300">
                          {company.research.expansionSignals?.map((sig: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-emerald-400">•</span>
                              <span>{sig}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Factual Claims vs Inferences */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-900/40 border border-slate-800/80 p-3 rounded-lg space-y-2">
                          <span className="text-[11px] font-semibold text-slate-300 uppercase">
                            Verified Factual Claims
                          </span>
                          <ul className="text-[11px] text-slate-400 space-y-1">
                            {company.research.verifiedClaims?.map((v: string, i: number) => (
                              <li key={i}>✓ {v}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="bg-slate-900/40 border border-slate-800/80 p-3 rounded-lg space-y-2">
                          <span className="text-[11px] font-semibold text-amber-400 uppercase">
                            Unverified Inferences
                          </span>
                          <ul className="text-[11px] text-slate-400 space-y-1">
                            {company.research.unverifiedInferences?.map((u: string, i: number) => (
                              <li key={i}>? {u}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-10 text-slate-400 text-xs">
                      No research generated yet. Click &ldquo;Re-score&rdquo; to trigger Gemini analysis.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: CONTACTS */}
              {activeTab === 'contacts' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase">
                      Decision-Makers ({company.contacts?.length || 0})
                    </h4>
                  </div>
                  <div className="space-y-3">
                    {company.contacts?.map((ct: any) => (
                      <div
                        key={ct.id}
                        className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">{ct.fullName}</span>
                            {ct.isPrimary && (
                              <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
                                Primary
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">{ct.title} ({ct.role})</p>
                          <div className="flex items-center gap-3 text-xs text-slate-300 pt-1">
                            <span className="flex items-center gap-1 font-mono text-slate-300">
                              {ct.email || 'No email identified'}
                              {ct.isEmailVerified && (
                                <span title="Verified">
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        {ct.linkedinUrl && (
                          <a
                            href={ct.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all text-xs"
                          >
                            LinkedIn &rarr;
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: EMAIL HISTORY */}
              {activeTab === 'emails' && (
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase">
                    Synced Conversations & Drafts
                  </h4>
                  {company.emailThreads?.length > 0 ? (
                    company.emailThreads.map((th: any) => (
                      <div key={th.id} className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-white">{th.subject}</span>
                          <span className="text-slate-400 font-mono">{formatDate(th.lastMessageAt)}</span>
                        </div>
                        <div className="space-y-2 pt-2 border-t border-slate-800/80">
                          {th.messages?.map((m: any) => (
                            <div
                              key={m.id}
                              className={`p-3 rounded-lg text-xs space-y-1 ${
                                m.direction === 'OUTBOUND'
                                  ? 'bg-blue-950/20 border border-blue-900/40 ml-4'
                                  : 'bg-emerald-950/20 border border-emerald-900/40 mr-4'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                                <span>{m.direction === 'OUTBOUND' ? 'Sent by ChaseHorse' : `Received from ${m.fromEmail}`}</span>
                                <span className="font-mono text-slate-400">{formatDate(m.sentAt || m.receivedAt)}</span>
                              </div>
                              <p className="text-slate-200 whitespace-pre-wrap">{m.bodyText}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-10 text-slate-400 text-xs">
                      No outreach messages sent yet. Use &ldquo;Draft Outreach&rdquo; to start a thread.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: AI SERVICE MATCHES */}
              {activeTab === 'insights' && (
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase">
                    Matched ChaseHorse Offerings
                  </h4>
                  {company.serviceMatches?.map((m: any) => (
                    <div key={m.id} className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-sm font-bold text-white">{m.service?.name}</h5>
                        <span className="text-xs font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded">
                          {m.relevanceScore}% Fit
                        </span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div>
                          <strong className="text-blue-400">Why Relevant:</strong>{' '}
                          <span className="text-slate-300">{m.whyRelevant}</span>
                        </div>
                        <div>
                          <strong className="text-indigo-400">Suggested Angle:</strong>{' '}
                          <span className="text-slate-300">{m.outreachAngle}</span>
                        </div>
                        <div>
                          <strong className="text-slate-400">Target Decision-Maker:</strong>{' '}
                          <span className="text-slate-200 font-medium">{m.targetDecisionMaker}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 6: ACTIVITIES */}
              {activeTab === 'activities' && (
                <div className="space-y-4">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase">Timeline of Events</h4>
                  <div className="space-y-3 border-l-2 border-slate-800 ml-2 pl-4">
                    {company.activities?.map((act: any) => (
                      <div key={act.id} className="relative space-y-1">
                        <span className="absolute -left-[23px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-200">{act.title}</span>
                          <span className="text-[11px] font-mono text-slate-400">{formatDate(act.createdAt)}</span>
                        </div>
                        <p className="text-xs text-slate-400">{act.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 7: NOTES */}
              {activeTab === 'notes' && (
                <div className="space-y-6">
                  {/* Add Note Input */}
                  <div className="space-y-2">
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      rows={3}
                      placeholder="Add an internal note or meeting take-away..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={handleAddNote}
                        disabled={savingNote || !newNote.trim()}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50 transition-all"
                      >
                        {savingNote ? 'Saving...' : 'Add Note'}
                      </button>
                    </div>
                  </div>

                  {/* Notes List */}
                  <div className="space-y-3">
                    {company.notes?.map((n: any) => (
                      <div key={n.id} className="bg-slate-900/60 border border-slate-800 p-3 rounded-lg space-y-1 text-xs">
                        <div className="flex items-center justify-between text-slate-400 text-[11px]">
                          <span>{n.author}</span>
                          <span className="font-mono">{formatDate(n.createdAt)}</span>
                        </div>
                        <p className="text-slate-200">{n.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
