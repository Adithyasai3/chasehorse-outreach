'use client';

import React, { useState, useEffect } from 'react';
import {
  Inbox,
  Send,
  Sparkles,
  RefreshCw,
  Mail,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  ShieldCheck,
  Building2,
  Clock,
  ArrowRight,
  Plus,
  Loader2,
  Play,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function InboxPage() {
  const [threads, setThreads] = useState<any[]>([]);
  const [selectedThread, setSelectedThread] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // New Draft Composer Modal
  const [showComposer, setShowComposer] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedContactId, setSelectedContactId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [outreachStyle, setOutreachStyle] = useState('DIRECT_INTRO');
  const [generatingDraft, setGeneratingDraft] = useState(false);

  // Draft Editor State
  const [currentDraft, setCurrentDraft] = useState<any | null>(null);
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Reply Simulation Modal
  const [showSimModal, setShowSimModal] = useState(false);
  const [simText, setSimText] = useState('');
  const [simulating, setSimulating] = useState(false);

  const fetchThreads = () => {
    setLoading(true);
    api
      .getEmailThreads()
      .then((res) => {
        setThreads(res.threads || []);
        if (res.threads?.length > 0 && !selectedThread) {
          setSelectedThread(res.threads[0]);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchThreads();
    api.getCompanies().then((res) => setCompanies(res.companies || []));
    api.getServices().then((res) => setServices(res.services || []));
  }, []);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await api.triggerEmailSync();
      fetchThreads();
      alert(`Sync completed! Found ${res.syncedCount} emails (${res.matchedReplies} new replies matched).`);
    } catch (err: any) {
      alert(`Sync notice: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!selectedCompanyId) {
      alert('Please select a target company.');
      return;
    }
    setGeneratingDraft(true);
    try {
      const res = await api.generateDraft({
        companyId: selectedCompanyId,
        contactId: selectedContactId || undefined,
        serviceId: selectedServiceId || undefined,
        outreachStyle,
      });
      setCurrentDraft(res.draft);
      setSubject(res.draft.subject);
      setBodyText(res.draft.bodyText);
    } catch (err: any) {
      alert(`Failed to generate draft: ${err.message}`);
    } finally {
      setGeneratingDraft(false);
    }
  };

  const handleSendDraft = async () => {
    if (!currentDraft || !currentDraft.contact?.email) {
      alert('Valid contact email is required to send.');
      return;
    }
    setSendingEmail(true);
    try {
      await api.sendEmail({
        draftId: currentDraft.id,
        companyId: currentDraft.companyId,
        contactId: currentDraft.contactId,
        toEmail: currentDraft.contact.email,
        subject,
        bodyText,
      });
      alert('Outreach email sent successfully!');
      setShowComposer(false);
      setCurrentDraft(null);
      fetchThreads();
    } catch (err: any) {
      alert(`Error sending email: ${err.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSimulateReply = async () => {
    if (!selectedCompanyId) {
      alert('Please select a company for simulated reply.');
      return;
    }
    setSimulating(true);
    try {
      await api.simulateReply({
        companyId: selectedCompanyId,
        contactId: selectedContactId || undefined,
        incomingText: simText || undefined,
      });
      setShowSimModal(false);
      setSimText('');
      fetchThreads();
      alert('Simulated reply received! Kanban updated to "Replied" and AI reply generated.');
    } catch (err: any) {
      alert(`Simulation error: ${err.message}`);
    } finally {
      setSimulating(false);
    }
  };

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            Outreach Communications Hub
          </div>
          <h2 className="text-2xl font-bold text-white mt-1">Email Inbox & Reply Intelligence</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor incoming replies, analyze prospect intent, and send AI-personalized emails via Gmail.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSimModal(true)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition-all"
          >
            <Play className="w-3.5 h-3.5 text-amber-400" />
            Simulate Incoming Reply
          </button>
          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-blue-400' : ''}`} />
            Sync Gmail
          </button>
          <button
            onClick={() => setShowComposer(true)}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Draft AI Outreach
          </button>
        </div>
      </div>

      {/* Split Pane: Threads List on Left, Active Conversation on Right */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 min-h-[580px]">
        {/* Threads List */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-slate-800/80 bg-slate-950/40 text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Conversations ({threads.length})</span>
            <span className="text-[10px] text-slate-400 font-mono">Gmail Synced</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {threads.map((th) => {
              const isSelected = selectedThread?.id === th.id;
              const lastMsg = th.messages?.[th.messages.length - 1];
              return (
                <div
                  key={th.id}
                  onClick={() => setSelectedThread(th)}
                  className={`p-3.5 cursor-pointer transition-all space-y-1.5 ${
                    isSelected
                      ? 'bg-blue-600/15 border-l-2 border-blue-500'
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white truncate max-w-[170px]">
                      {th.company?.name || 'Prospect'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {formatDate(th.lastMessageAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 font-medium truncate">{th.subject}</p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {lastMsg?.snippet || lastMsg?.bodyText || 'No preview'}
                  </p>
                  {th.hasReplies && (
                    <span className="inline-block text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded font-mono">
                      Reply Received
                    </span>
                  )}
                </div>
              );
            })}

            {threads.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-xs">
                No email threads found. Click &ldquo;Draft AI Outreach&rdquo; to send your first message.
              </div>
            )}
          </div>
        </div>

        {/* Active Thread Detail & Messages View */}
        <div className="md:col-span-2 bg-slate-900/60 border border-slate-800/80 rounded-xl flex flex-col overflow-hidden">
          {selectedThread ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedThread.subject}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span className="text-slate-200 font-semibold">{selectedThread.company?.name}</span>
                    <span>•</span>
                    <span>{selectedThread.contact?.fullName || 'Decision Maker'}</span>
                    <span>•</span>
                    <span className="font-mono">{selectedThread.contact?.email}</span>
                  </div>
                </div>
              </div>

              {/* Messages Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {selectedThread.messages?.map((msg: any) => {
                  const isOutbound = msg.direction === 'OUTBOUND';
                  return (
                    <div
                      key={msg.id}
                      className={`p-4 rounded-xl space-y-2 text-xs ${
                        isOutbound
                          ? 'bg-blue-950/20 border border-blue-900/40 ml-8'
                          : 'bg-slate-950 border border-slate-800 mr-8'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-semibold">
                        <span className={isOutbound ? 'text-blue-400' : 'text-emerald-400'}>
                          {isOutbound ? 'Outreach from ChaseHorse' : `Reply from ${msg.fromEmail}`}
                        </span>
                        <span className="text-slate-400 font-mono">
                          {formatDate(msg.sentAt || msg.receivedAt)}
                        </span>
                      </div>

                      {/* Sentiment & Intent Pill for Inbound */}
                      {!isOutbound && msg.sentiment && (
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                            Sentiment: {msg.sentiment}
                          </span>
                          {msg.intent && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
                              Intent: {msg.intent}
                            </span>
                          )}
                        </div>
                      )}

                      <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {msg.bodyText}
                      </p>

                      {/* AI Suggested Reply Card */}
                      {msg.suggestedReply && (
                        <div className="mt-3 bg-indigo-950/30 border border-indigo-800/40 p-3.5 rounded-lg space-y-2">
                          <div className="flex items-center justify-between text-indigo-300 font-semibold text-[11px]">
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                              Gemini Suggested Response
                            </span>
                            <span className="text-[10px] text-slate-400">Requires Approval</span>
                          </div>
                          <p className="text-slate-300 text-xs italic bg-slate-950/40 p-2.5 rounded border border-indigo-900/20 whitespace-pre-wrap">
                            {msg.suggestedReply}
                          </p>
                          <div className="flex justify-end pt-1">
                            <button
                              onClick={() => {
                                setSubject(`Re: ${selectedThread.subject}`);
                                setBodyText(msg.suggestedReply);
                                setSelectedCompanyId(selectedThread.companyId);
                                setSelectedContactId(selectedThread.contactId);
                                setShowComposer(true);
                              }}
                              className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold transition-all flex items-center gap-1"
                            >
                              <Send className="w-3 h-3" />
                              Use & Send This Reply
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
              Select a conversation to read emails
            </div>
          )}
        </div>
      </div>

      {/* AI Outreach Composer Modal */}
      {showComposer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0b101d] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                AI Personalized Outreach Generator
              </h3>
              <button
                onClick={() => setShowComposer(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            {/* Selection Controls */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Target Company</label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => {
                    setSelectedCompanyId(e.target.value);
                    const comp = companies.find((c) => c.id === e.target.value);
                    if (comp?.contacts?.[0]) setSelectedContactId(comp.contacts[0].id);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                >
                  <option value="">Select Company...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.leadScore} pts)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Outreach Style</label>
                <select
                  value={outreachStyle}
                  onChange={(e) => setOutreachStyle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                >
                  <option value="DIRECT_INTRO">Direct Business Introduction</option>
                  <option value="PROBLEM_ORIENTED">Problem-Oriented Outreach</option>
                  <option value="PARTNERSHIP">Partnership Opportunity</option>
                  <option value="WARM_INTRO">Warm Peer Introduction</option>
                  <option value="FOLLOW_UP">Follow-up Message</option>
                </select>
              </div>
            </div>

            {/* Generate Trigger */}
            <div className="flex justify-end">
              <button
                onClick={handleGenerateDraft}
                disabled={generatingDraft || !selectedCompanyId}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 transition-all"
              >
                {generatingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Generate with Gemini AI
              </button>
            </div>

            {/* Editable Draft Preview */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div>
                <label className="text-slate-300 text-xs font-medium block mb-1">Subject Line</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject line..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 text-xs font-medium block mb-1">Email Body (Review & Edit)</label>
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  rows={8}
                  placeholder="Email body will appear here..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-white leading-relaxed resize-none"
                />
              </div>

              {currentDraft?.personalizationEvidence && (
                <div className="text-[11px] bg-slate-950 border border-slate-800/80 p-2.5 rounded-lg text-slate-400">
                  <strong className="text-blue-400">AI Personalization Hook:</strong> {currentDraft.personalizationEvidence}
                </div>
              )}
            </div>

            {/* Send / Approve Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-[11px] text-amber-400">
                ⚠️ Requires human approval before dispatch.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowComposer(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendDraft}
                  disabled={sendingEmail || !subject || !bodyText}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
                >
                  {sendingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Approve & Send via Gmail
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Simulated Incoming Reply Modal */}
      {showSimModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0b101d] border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Play className="w-4 h-4 text-amber-400" />
                Simulate Prospect Reply
              </h3>
              <button onClick={() => setShowSimModal(false)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Test how the platform handles incoming prospect responses, runs sentiment classification, advances the Kanban pipeline, and drafts an AI reply.
            </p>

            <div className="space-y-2 text-xs">
              <label className="text-slate-300 font-medium block">Select Prospect</label>
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
              >
                <option value="">Select Company...</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <label className="text-slate-300 font-medium block pt-2">Simulated Prospect Response</label>
              <textarea
                value={simText}
                onChange={(e) => setSimText(e.target.value)}
                rows={4}
                placeholder="e.g. Hi Team, thanks for reaching out. We are actually evaluating 3PL partners in Mumbai and Bangalore. Could you share your warehousing rate card and setup lead times?"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowSimModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSimulateReply}
                disabled={simulating || !selectedCompanyId}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
              >
                {simulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Inject Reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
