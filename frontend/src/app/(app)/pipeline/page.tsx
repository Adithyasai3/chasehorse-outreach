'use client';

import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import Link from 'next/link';
import { useState } from 'react';
import { cx, ErrorState, Input, LinkButton, PageHeader, ScoreChip, Skeleton, useToast } from '@/components/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { useApi, useDebounced } from '@/lib/hooks';
import type { LeadCard } from '../leads/page';

// Drop where the pointer is (cards before columns); fall back to overlap for keyboard drags.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length) return [...hits].sort((a, b) => Number(String(b.id).startsWith('card:')) - Number(String(a.id).startsWith('card:')));
  return rectIntersection(args);
};

interface Column {
  key: string;
  label: string;
  leads: LeadCard[];
}

function Card({ lead, dragging }: { lead: LeadCard; dragging?: boolean }) {
  const fu = lead.followUps[0];
  const overdue = fu && new Date(fu.dueAt) < new Date();
  return (
    <div className={cx('rounded border border-line bg-surface p-2.5 text-[13px]', dragging && 'shadow-[0_8px_24px_rgba(28,31,35,0.18)]')}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/companies/${lead.company.id}`} className="font-medium leading-snug hover:underline" onPointerDown={(e) => e.stopPropagation()}>
          {lead.company.name}
        </Link>
        <ScoreChip score={lead.score} status={lead.qualificationStatus} manual={lead.scoreIsManual} />
      </div>
      <p className="mt-0.5 truncate text-[12px] text-ink-2">{lead.primaryContact ? `${lead.primaryContact.fullName}${lead.primaryContact.title ? `, ${lead.primaryContact.title}` : ''}` : lead.company.industry || lead.company.domain || ''}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
        {lead.owner && <span>{lead.owner}</span>}
        {lead._count.drafts > 0 && <span className="num">{lead._count.drafts} draft{lead._count.drafts > 1 ? 's' : ''}</span>}
        {lead._count.tasks > 0 && <span className="num">{lead._count.tasks} task{lead._count.tasks > 1 ? 's' : ''}</span>}
        {fu && <span className={overdue ? 'text-bad' : ''}>Due {fmtDate(fu.dueAt, { day: 'numeric', month: 'short' })}</span>}
      </div>
    </div>
  );
}

function DraggableCard({ lead }: { lead: LeadCard }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, data: { stage: lead.stage } });
  const drop = useDroppable({ id: `card:${lead.id}`, data: { stage: lead.stage, leadId: lead.id } });
  return (
    <div ref={drop.setNodeRef} className={cx(drop.isOver && 'border-t-2 border-accent pt-1')}>
      <div ref={setNodeRef} {...listeners} {...attributes} className={cx('cursor-grab touch-none active:cursor-grabbing', isDragging && 'opacity-30')} aria-roledescription="Draggable lead">
        <Card lead={lead} />
      </div>
    </div>
  );
}

function ColumnView({ col }: { col: Column }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col.key}`, data: { stage: col.key } });
  return (
    <section ref={setNodeRef} className={cx('flex w-64 shrink-0 flex-col rounded border bg-sunken/60', isOver ? 'border-ink-3' : 'border-line')} aria-label={col.label}>
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">{col.label}</h2>
        <span className="num text-[12px] text-ink-3">{col.leads.length}</span>
      </header>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 p-2">
        {col.leads.map((l) => <DraggableCard key={l.id} lead={l} />)}
        {!col.leads.length && <p className="px-1 py-4 text-center text-[12px] text-ink-3">Drop leads here</p>}
      </div>
    </section>
  );
}

export default function PipelinePage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const { data, error, loading, reload, setData } = useApi<{ columns: Column[] }>(`/leads/board${qs({ search: q })}`);
  const [active, setActive] = useState<LeadCard | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));

  const onStart = (e: DragStartEvent) => {
    const lead = data?.columns.flatMap((c) => c.leads).find((l) => l.id === e.active.id);
    setActive(lead || null);
  };

  const onEnd = async (e: DragEndEvent) => {
    setActive(null);
    if (!data || !e.over) return;
    const leadId = String(e.active.id);
    const overData = e.over.data.current as { stage: string; leadId?: string };
    const targetStage = overData.stage;
    const before = data;
    const lead = data.columns.flatMap((c) => c.leads).find((l) => l.id === leadId);
    if (!lead) return;
    if (overData.leadId === leadId) return;

    // Optimistic update
    const cols = data.columns.map((c) => ({ ...c, leads: c.leads.filter((l) => l.id !== leadId) }));
    const target = cols.find((c) => c.key === targetStage)!;
    let index = target.leads.length;
    if (overData.leadId) index = Math.max(0, target.leads.findIndex((l) => l.id === overData.leadId));
    target.leads.splice(index, 0, { ...lead, stage: targetStage });
    setData({ columns: cols });

    try {
      await api.post(`/leads/${leadId}/move`, { stage: targetStage, index });
      if (lead.stage !== targetStage) toast(`${lead.company.name} moved to ${target.label}`, 'info');
    } catch (err) {
      setData(before);
      toast(`Could not move: ${errorMessage(err)}`, 'bad');
    }
  };

  return (
    <>
      <PageHeader title="Pipeline board" description="Drag leads between stages. Every move is saved and recorded in the lead's activity." actions={<LinkButton href="/leads">Table view</LinkButton>} />
      <Input className="mb-4 max-w-xs" placeholder="Filter by company or contact" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Filter board" />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="flex gap-3 overflow-hidden">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-80 w-64 shrink-0" />)}</div>
      ) : data ? (
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
            {data.columns.map((c) => <ColumnView key={c.key} col={c} />)}
          </div>
          <DragOverlay>{active ? <div className="w-60"><Card lead={active} dragging /></div> : null}</DragOverlay>
        </DndContext>
      ) : null}
    </>
  );
}
