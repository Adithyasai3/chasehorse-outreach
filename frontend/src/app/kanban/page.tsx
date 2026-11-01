'use client';

import React, { useState, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  Building2,
  Users,
  Sparkles,
  Calendar,
  Send,
  MoreVertical,
  Plus,
  Clock,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatScore, formatDate } from '@/lib/utils';
import { CompanyWorkspaceDrawer } from '@/components/kanban/company-workspace-drawer';

export default function KanbanPage() {
  const [stages, setStages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<any | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const fetchBoard = () => {
    setLoading(true);
    api
      .getKanbanBoard()
      .then((res) => setStages(res.stages || []))
      .catch((err) => console.error('Kanban fetch error:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBoard();
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const foundCard = stages
      .flatMap((s) => s.companies)
      .find((c) => c.id === active.id);
    setActiveCard(foundCard || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!over) return;

    const companyId = active.id as string;
    const targetStageId = over.id as string;

    // Optimistically update UI
    setStages((prevStages) => {
      let movedCompany: any = null;
      const newStages = prevStages.map((stage) => {
        const remaining = stage.companies.filter((c: any) => {
          if (c.id === companyId) {
            movedCompany = { ...c, kanbanStageId: targetStageId };
            return false;
          }
          return true;
        });
        return { ...stage, companies: remaining };
      });

      if (movedCompany) {
        return newStages.map((stage) => {
          if (stage.id === targetStageId) {
            return { ...stage, companies: [movedCompany, ...stage.companies] };
          }
          return stage;
        });
      }
      return prevStages;
    });

    // Update backend PostgreSQL
    try {
      await api.moveCompanyStage(companyId, targetStageId);
    } catch (err: any) {
      console.error('Failed to move stage:', err);
      fetchBoard(); // Rollback on error
    }
  };

  return (
    <div className="space-y-6 max-w-full pb-10">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            Outreach Pipeline
          </div>
          <h2 className="text-2xl font-bold text-white mt-1">Kanban CRM Workspace</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Track deals across 12 lifecycle stages. Drag cards to update deal velocity. Click any card to view deep intelligence.
          </p>
        </div>
      </div>

      {/* Kanban Board Container with Horizontal Scroll */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-6 min-h-[calc(100vh-220px)] items-start">
          {stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              onCardClick={(companyId) => setSelectedCompanyId(companyId)}
            />
          ))}
        </div>

        {/* Drag Overlay for smooth visual feedback */}
        <DragOverlay>
          {activeCard ? (
            <div className="w-72 bg-slate-900 border-2 border-blue-500 rounded-xl p-4 shadow-2xl space-y-3 cursor-grabbing opacity-95">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm">{activeCard.name}</span>
                <span className="text-xs font-mono text-blue-400">{activeCard.leadScore}/100</span>
              </div>
              <p className="text-xs text-slate-400">{activeCard.industry} • {activeCard.city}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Company Workspace Drawer Modal */}
      {selectedCompanyId && (
        <CompanyWorkspaceDrawer
          companyId={selectedCompanyId}
          onClose={() => setSelectedCompanyId(null)}
          onUpdated={fetchBoard}
        />
      )}
    </div>
  );
}

// Kanban Column Component
function KanbanColumn({
  stage,
  onCardClick,
}: {
  stage: any;
  onCardClick: (companyId: string) => void;
}) {
  return (
    <div
      id={stage.id}
      className="w-72 flex-shrink-0 bg-slate-900/40 border border-slate-800/80 rounded-xl flex flex-col max-h-[calc(100vh-220px)] overflow-hidden"
    >
      {/* Column Header */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: stage.color || '#3b82f6' }}
          ></span>
          <h3 className="text-xs font-bold text-white truncate max-w-[170px]">
            {stage.name}
          </h3>
        </div>
        <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full">
          {stage.companies.length}
        </span>
      </div>

      {/* Cards List Area */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {stage.companies.map((c: any) => (
          <KanbanCard key={c.id} company={c} onClick={() => onCardClick(c.id)} />
        ))}

        {stage.companies.length === 0 && (
          <div className="border border-dashed border-slate-800 rounded-lg p-6 text-center text-[11px] text-slate-400">
            Drop leads here
          </div>
        )}
      </div>
    </div>
  );
}

// Kanban Card Component
function KanbanCard({ company, onClick }: { company: any; onClick: () => void }) {
  const scoreStyle = formatScore(company.leadScore);
  const primaryContact = company.contacts?.[0];
  const topService = company.serviceMatches?.[0]?.service;
  const pendingFollowUp = company.followUps?.[0];

  return (
    <div
      onClick={onClick}
      className="bg-slate-950/80 hover:bg-slate-900 border border-slate-800/90 hover:border-slate-700 p-3.5 rounded-xl space-y-3 cursor-pointer transition-all shadow-md group relative"
    >
      {/* Top Row: Name & Score */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h4 className="text-xs font-bold text-slate-100 group-hover:text-blue-400 transition-colors">
            {company.name}
          </h4>
          <span className="text-[10px] text-slate-400 font-mono block">
            {company.domain || 'no domain'}
          </span>
        </div>
        <span
          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${scoreStyle.bg} ${scoreStyle.color}`}
        >
          {company.leadScore}
        </span>
      </div>

      {/* Primary Contact Chip */}
      {primaryContact && (
        <div className="text-[11px] bg-slate-900 border border-slate-800/80 p-2 rounded-lg flex items-center justify-between text-slate-300">
          <div className="truncate">
            <span className="font-semibold block truncate">{primaryContact.fullName}</span>
            <span className="text-[10px] text-slate-400 truncate block">{primaryContact.title}</span>
          </div>
          {primaryContact.isEmailVerified && (
            <span title="Verified Email">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            </span>
          )}
        </div>
      )}

      {/* Matched Service Pill */}
      {topService && (
        <div className="text-[10px] text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded truncate">
          {topService.name}
        </div>
      )}

      {/* Next Follow-up or Activity footer */}
      <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
        <span>{company.industry || 'Logistics'}</span>
        {pendingFollowUp ? (
          <span className="flex items-center gap-1 text-amber-400 font-medium">
            <Clock className="w-3 h-3" />
            {formatDate(pendingFollowUp.dueDate)}
          </span>
        ) : (
          <span className="text-slate-400">Follow-up: None</span>
        )}
      </div>
    </div>
  );
}
