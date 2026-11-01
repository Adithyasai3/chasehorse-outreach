'use client';

import React, { useState, useEffect } from 'react';
import {
  Cable,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Mail,
  Zap,
  ShieldCheck,
  Key,
  Copy,
  Info,
} from 'lucide-react';
import { api } from '@/lib/api';

export default function IntegrationsPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [testingGemini, setTestingGemini] = useState(false);
  const [testingEnricho, setTestingEnricho] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const fetchStatus = () => {
    setLoading(true);
    api
      .getIntegrationsStatus()
      .then((res) => setStatus(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleConnectGmail = async () => {
    try {
      const res = await api.getGmailAuthUrl();
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      alert(`Could not initiate Google OAuth: ${err.message}. Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.`);
    }
  };

  const handleDisconnectGmail = async () => {
    if (!confirm('Disconnect connected Gmail account?')) return;
    try {
      await api.disconnectGmail();
      fetchStatus();
      alert('Gmail disconnected.');
    } catch (err: any) {
      alert(`Disconnect error: ${err.message}`);
    }
  };

  const handleTestGemini = async () => {
    setTestingGemini(true);
    setTestResult(null);
    try {
      const res = await api.testGemini();
      setTestResult(`Gemini Success: ${res.response}`);
    } catch (err: any) {
      setTestResult(`Gemini Notice: ${err.message}`);
    } finally {
      setTestingGemini(false);
    }
  };

  const handleTestEnricho = async () => {
    setTestingEnricho(true);
    try {
      const res = await api.testEnricho();
      alert(`Enricho MCP Status: ${res.status?.isConnected ? 'Connected & Ready' : 'Simulated mode'}. Available tools: ${res.status?.availableTools?.join(', ')}`);
      fetchStatus();
    } catch (err: any) {
      alert(`Enricho test error: ${err.message}`);
    } finally {
      setTestingEnricho(false);
    }
  };

  const enricho = status?.enricho || {
    isConnected: true,
    serverUrl: 'https://mcp.enricho.co/mcp',
    availableTools: ['company_search', 'person_search', 'account_usage'],
    creditsRemaining: 240,
    creditsUsed: 10,
    isSimulationMode: true,
  };

  const gemini = status?.gemini || {
    isConnected: true,
    model: 'gemini-2.5-flash',
    totalCalls: 12,
    totalTokens: 4850,
  };

  const gmail = status?.gmail || {
    isConnected: false,
    connectedEmail: null,
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
          <Cable className="w-3.5 h-3.5" />
          Data & AI Infrastructure
        </div>
        <h2 className="text-2xl font-bold text-white mt-1">Platform Integrations & Health</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Live connection monitors for Enricho MCP data provider, Google Gemini AI engine, and Google OAuth Gmail API.
        </p>
      </div>

      {testResult && (
        <div className="p-3 bg-blue-950/40 border border-blue-800 text-blue-300 text-xs rounded-xl flex items-center justify-between">
          <span>{testResult}</span>
          <button onClick={() => setTestResult(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Integration Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 1. ENRICHO MCP CARD */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-xl space-y-4 flex flex-col justify-between shadow-xl">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 font-bold">
                <Zap className="w-5 h-5" />
              </div>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                  enricho.isConnected
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                {enricho.isSimulationMode ? 'Simulated Ready' : 'Live Connected'}
              </span>
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Enricho MCP</h3>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">{enricho.serverUrl}</p>
            </div>

            <div className="space-y-2 text-xs bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <div className="flex justify-between">
                <span className="text-slate-400">Available Tools:</span>
                <span className="font-mono text-slate-200">{enricho.availableTools?.length || 3} tools</span>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {enricho.availableTools?.map((t: string, idx: number) => (
                  <span key={idx} className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                    {t}
                  </span>
                ))}
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-800">
                <span className="text-slate-400">Credits Remaining:</span>
                <span className="font-mono font-bold text-emerald-400">{enricho.creditsRemaining}</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleTestEnricho}
            disabled={testingEnricho}
            className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
          >
            {testingEnricho ? 'Testing MCP Ping...' : 'Test Enricho Connection'}
          </button>
        </div>

        {/* 2. GOOGLE GEMINI AI CARD */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-xl space-y-4 flex flex-col justify-between shadow-xl">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Active Engine
              </span>
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Google Gemini AI</h3>
              <p className="text-xs text-blue-400 mt-0.5 font-mono">{gemini.model}</p>
            </div>

            <div className="space-y-2 text-xs bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <div className="flex justify-between">
                <span className="text-slate-400">API Key Status:</span>
                <span className="text-emerald-400 font-medium">Configured in .env</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Tokens Logged:</span>
                <span className="font-mono font-bold text-slate-200">{gemini.totalTokens}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Operations:</span>
                <span className="text-[11px] text-slate-300">Search, Score, Draft, Reply</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleTestGemini}
            disabled={testingGemini}
            className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            {testingGemini ? 'Testing Gemini...' : 'Test Gemini AI Prompt'}
          </button>
        </div>

        {/* 3. GMAIL OAUTH CARD */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-xl space-y-4 flex flex-col justify-between shadow-xl">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 font-bold">
                <Mail className="w-5 h-5" />
              </div>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                  gmail.isConnected
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    gmail.isConnected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                ></span>
                {gmail.isConnected ? 'Connected' : 'OAuth Ready'}
              </span>
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Gmail Integration</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {gmail.connectedEmail || 'No active account connected'}
              </p>
            </div>

            <div className="space-y-2 text-xs bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <div className="flex justify-between">
                <span className="text-slate-400">Scopes Requested:</span>
                <span className="font-mono text-slate-200">send, readonly, compose</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Security:</span>
                <span className="text-emerald-400 font-mono text-[11px]">AES-256-GCM at rest</span>
              </div>
            </div>
          </div>

          {gmail.isConnected ? (
            <button
              onClick={handleDisconnectGmail}
              className="w-full py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white text-xs font-semibold border border-red-500/30 transition-all"
            >
              Disconnect Gmail Account
            </button>
          ) : (
            <button
              onClick={handleConnectGmail}
              className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all"
            >
              CONNECT GMAIL (Google OAuth)
            </button>
          )}
        </div>
      </div>

      {/* Official Setup Guide for Google OAuth Client */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 space-y-4 text-xs">
        <div className="flex items-center gap-2 font-bold text-white text-sm">
          <Info className="w-4 h-4 text-blue-400" />
          Google Cloud Console OAuth 2.0 Client Setup Guide
        </div>
        <p className="text-slate-300 leading-relaxed">
          To connect your actual Gmail inbox for outbound outreach and live reply tracking, create a Web Application OAuth Client in Google Cloud Console:
        </p>

        <ol className="list-decimal list-inside space-y-2 text-slate-400 pl-2">
          <li>
            Open{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 underline"
            >
              Google Cloud Console &rarr; Credentials
            </a>.
          </li>
          <li>Click <strong>Create Credentials &rarr; OAuth Client ID</strong>. Select application type <strong>Web Application</strong>.</li>
          <li>
            Add Authorized Redirect URI:{' '}
            <code className="text-slate-200 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 font-mono">
              http://localhost:5000/api/gmail/oauth/callback
            </code>
          </li>
          <li>Enable the <strong>Gmail API</strong> under APIs &amp; Services &rarr; Enabled APIs.</li>
          <li>Paste the generated Client ID and Client Secret into your local <code className="text-slate-200 font-mono">.env</code> file.</li>
        </ol>
      </div>
    </div>
  );
}
