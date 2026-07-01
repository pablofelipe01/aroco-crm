"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { motion } from "framer-motion";
import { LEAD_STAGES, LEAD_STAGE_TONE, LEAD_STAGE_WEIGHT, type LeadStage } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { staggerContainer, fadeUp } from "@/lib/motion";
import type { LeadWithOwner } from "./page";
import { LeadCard } from "./lead-card";

function DraggableCard({
  lead,
  canWrite,
  onSelect,
}: {
  lead: LeadWithOwner;
  canWrite: boolean;
  onSelect: (l: LeadWithOwner) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    disabled: !canWrite,
  });
  return (
    <motion.div
      variants={fadeUp}
      ref={setNodeRef}
      {...(canWrite ? { ...listeners, ...attributes } : {})}
      style={{ opacity: isDragging ? 0.4 : 1, touchAction: "none" }}
    >
      <LeadCard lead={lead} onClick={() => onSelect(lead)} />
    </motion.div>
  );
}

function Column({
  stage,
  leads,
  canWrite,
  onSelect,
}: {
  stage: LeadStage;
  leads: LeadWithOwner[];
  canWrite: boolean;
  onSelect: (l: LeadWithOwner) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const prob = Math.round((LEAD_STAGE_WEIGHT[stage] ?? 0) * 100);
  const tons = leads.reduce((s, l) => s + (l.toneladas ?? 0), 0);
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5">
          <Badge tone={LEAD_STAGE_TONE[stage]} dot>
            {stage}
          </Badge>
          <span className="font-mono text-[11px] font-semibold tnum text-accent-soft-fg">
            {prob}%
          </span>
        </div>
        <span className="font-mono text-xs text-fg-subtle tnum">
          {tons > 0 ? `${tons.toLocaleString("es-CO")} TM · ` : ""}
          {leads.length}
        </span>
      </div>
      <motion.div
        ref={setNodeRef}
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className={cn(
          "flex-1 space-y-2 rounded-[var(--radius-lg)] border border-dashed p-2 transition-colors",
          isOver
            ? "border-accent bg-accent-soft/40"
            : "border-border bg-bg-subtle/30",
        )}
      >
        {leads.map((l) => (
          <DraggableCard
            key={l.id}
            lead={l}
            canWrite={canWrite}
            onSelect={onSelect}
          />
        ))}
        {leads.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-fg-subtle">
            Sin leads
          </p>
        )}
      </motion.div>
    </div>
  );
}

export function LeadKanban({
  leads,
  canWrite,
  onSelect,
  onStatusChange,
}: {
  leads: LeadWithOwner[];
  canWrite: boolean;
  onSelect: (l: LeadWithOwner) => void;
  onStatusChange: (id: string, status: LeadStage) => void;
}) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  // Mouse: 5px threshold. Touch: press-and-hold 200ms so a normal swipe scrolls
  // the board horizontally and only a deliberate long-press starts a drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const byStage = React.useMemo(() => {
    const map = new Map<LeadStage, LeadWithOwner[]>();
    LEAD_STAGES.forEach((s) => map.set(s, []));
    leads.forEach((l) => map.get(l.status as LeadStage)?.push(l));
    return map;
  }, [leads]);

  const activeLead = activeId
    ? leads.find((l) => l.id === activeId) ?? null
    : null;

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const overStage = e.over?.id as LeadStage | undefined;
    if (!overStage) return;
    const lead = leads.find((l) => l.id === id);
    if (lead && lead.status !== overStage) onStatusChange(id, overStage);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {LEAD_STAGES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            leads={byStage.get(stage) ?? []}
            canWrite={canWrite}
            onSelect={onSelect}
          />
        ))}
      </div>
      <DragOverlay>
        {activeLead ? (
          <div className="w-72">
            <LeadCard lead={activeLead} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
