'use client';

import React from 'react';
import { Sparkles, Bell, Globe2 } from 'lucide-react';

export function Header() {
  return (
    <header className="h-16 border-b border-slate-800/80 bg-[#090d16]/80 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-medium text-slate-200">
          Supply Chain & Logistics Intelligence Workspace
        </h1>
        <span className="text-[11px] text-slate-400 border-l border-slate-700 pl-3">
          Localhost Production Environment
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full text-slate-300">
          <Globe2 className="w-3.5 h-3.5 text-blue-400" />
          <span>India & Global Sourcing</span>
        </div>

        <div className="flex items-center gap-2 text-xs bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-full text-blue-400 font-medium">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Gemini 2.5 Flash Connected</span>
        </div>

        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300">
          CH
        </div>
      </div>
    </header>
  );
}
