"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Plus, Search, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { LEAD_STAGES } from "@/lib/status";
import { MARKETS } from "@/lib/schemas/lead";
import type { TeamMember } from "@/lib/types/database";
import type { LeadWithOwner } from "./page";
import { LeadKanban } from "./lead-kanban";
import { LeadList } from "./lead-list";
import { LeadDetail } from "./lead-detail";
import { LeadForm } from "./lead-form";
import { updateLeadStatus } from "./actions";

type View = "kanban" | "list";

export function ComercialClient({
  initialLeads,
  team,
  canWrite,
  currentUserName,
}: {
  initialLeads: LeadWithOwner[];
  team: TeamMember[];
  canWrite: boolean;
  currentUserName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  // Local copy so Kanban drag can update optimistically. Re-seed when the
  // server sends fresh data (adjust-state-during-render pattern).
  const [leads, setLeads] = React.useState(initialLeads);
  const [prevInit, setPrevInit] = React.useState(initialLeads);
  if (initialLeads !== prevInit) {
    setPrevInit(initialLeads);
    setLeads(initialLeads);
  }

  const [view, setView] = React.useState<View>("kanban");
  const [query, setQuery] = React.useState("");
  const [fStatus, setFStatus] = React.useState("");
  const [fMarket, setFMarket] = React.useState("");
  const [fOwner, setFOwner] = React.useState("");

  const [selected, setSelected] = React.useState<LeadWithOwner | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LeadWithOwner | null>(null);

  // Deep links from the command palette (?lead=<id> / ?new=1).
  const searchParams = useSearchParams();
  React.useEffect(() => {
    const leadId = searchParams.get("lead");
    const isNew = searchParams.get("new");
    if (!leadId && !isNew) return;
    if (leadId) {
      const l = leads.find((x) => x.id === leadId);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open from deep link
      if (l) setSelected(l);
    } else if (isNew && canWrite) {
      setEditing(null);
      setFormOpen(true);
    }
    router.replace("/comercial");
  }, [searchParams, leads, canWrite, router]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (fStatus && l.status !== fStatus) return false;
      if (fMarket && l.market !== fMarket) return false;
      if (fOwner && l.commercial_owner !== fOwner) return false;
      if (q) {
        const hay = `${l.company} ${l.contact_name ?? ""} ${l.country ?? ""} ${
          l.product_interest ?? ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, query, fStatus, fMarket, fOwner]);

  const hasFilters = query || fStatus || fMarket || fOwner;
  const clearFilters = () => {
    setQuery("");
    setFStatus("");
    setFMarket("");
    setFOwner("");
  };

  async function onStatusChange(id: string, status: (typeof LEAD_STAGES)[number]) {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status } : l)));
    const res = await updateLeadStatus(id, status);
    if (!res.ok) {
      setLeads(prev);
      toast({ tone: "error", title: "No se pudo mover el lead", description: res.error });
    } else {
      router.refresh();
    }
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(lead: LeadWithOwner) {
    setEditing(lead);
    setFormOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comercial"
        description={`${leads.length} leads en el pipeline${
          hasFilters ? ` · ${filtered.length} filtrados` : ""
        }`}
        actions={
          canWrite && (
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4" />
              Nuevo lead
            </Button>
          )
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar empresa, contacto…"
              className="pl-9"
            />
          </div>
          <Select
            value={fStatus}
            onChange={(e) => setFStatus(e.target.value)}
            className="w-auto"
          >
            <option value="">Todos los estados</option>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select
            value={fMarket}
            onChange={(e) => setFMarket(e.target.value)}
            className="w-auto"
          >
            <option value="">Mercado</option>
            {MARKETS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <Select
            value={fOwner}
            onChange={(e) => setFOwner(e.target.value)}
            className="w-auto"
          >
            <option value="">Responsable</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Limpiar
            </Button>
          )}
        </div>

        {/* View toggle */}
        <div className="inline-flex shrink-0 rounded-[var(--radius-md)] border border-border bg-surface p-0.5">
          {(
            [
              { v: "kanban", icon: LayoutGrid, label: "Kanban" },
              { v: "list", icon: List, label: "Lista" },
            ] as const
          ).map(({ v, icon: Icon, label }) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors",
                view === v
                  ? "bg-accent text-accent-fg"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {view === "kanban" ? (
        <LeadKanban
          leads={filtered}
          canWrite={canWrite}
          onSelect={setSelected}
          onStatusChange={onStatusChange}
        />
      ) : (
        <LeadList leads={filtered} onSelect={setSelected} />
      )}

      <LeadDetail
        lead={selected}
        team={team}
        canWrite={canWrite}
        open={selected !== null}
        onClose={() => setSelected(null)}
        onEdit={(l) => {
          setSelected(null);
          openEdit(l);
        }}
      />

      <LeadForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        team={team}
        initial={editing}
        onSaved={() => {
          setFormOpen(false);
          router.refresh();
        }}
      />
      <span className="sr-only">{currentUserName}</span>
    </div>
  );
}
