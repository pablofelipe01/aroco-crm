"use client";

import { MapPin, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, initials, formatCOP } from "@/lib/utils";
import { LEAD_STAGE_WEIGHT, type LeadStage } from "@/lib/status";
import type { LeadWithOwner } from "./page";

export function LeadCard({
  lead,
  onClick,
  dragging,
}: {
  lead: LeadWithOwner;
  onClick?: () => void;
  dragging?: boolean;
}) {
  const prob = Math.round((LEAD_STAGE_WEIGHT[lead.status as LeadStage] ?? 0) * 100);
  return (
    <div
      onClick={onClick}
      className={cn(
        "group cursor-pointer rounded-[var(--radius-md)] border border-border bg-surface p-3 shadow-[var(--shadow-soft-sm)] transition-all hover:border-border-strong hover:shadow-[var(--shadow-soft-md)]",
        dragging && "rotate-2 shadow-[var(--shadow-soft-lg)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-semibold text-fg">
          {lead.company}
        </p>
        {lead.owner && (
          <span
            title={lead.owner.name}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-medium text-white"
            style={{ backgroundColor: lead.owner.color ?? "var(--accent)" }}
          >
            {initials(lead.owner.name)}
          </span>
        )}
      </div>

      {lead.contact_name && (
        <p className="mt-1 truncate text-xs text-fg-muted">
          {lead.contact_name}
        </p>
      )}

      {lead.product_interest && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-fg-subtle">
          <Package className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-2">{lead.product_interest}</span>
        </p>
      )}

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          {lead.potential_value_cop != null && (
            <p className="font-mono text-xs font-semibold tnum text-fg">
              {formatCOP(lead.potential_value_cop)}
            </p>
          )}
          {lead.toneladas != null && (
            <p className="font-mono text-[11px] tnum text-fg-subtle">
              {lead.toneladas.toLocaleString("es-CO")} TM
            </p>
          )}
        </div>
        <span
          title="Probabilidad de cierre"
          className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-semibold tnum text-accent-soft-fg"
        >
          {prob}%
        </span>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        {lead.country && (
          <span className="flex items-center gap-1 text-[11px] text-fg-subtle">
            <MapPin className="h-3 w-3" />
            {lead.city ? `${lead.country} · ${lead.city}` : lead.country}
          </span>
        )}
        {lead.market && (
          <Badge tone={lead.market === "Internacional" ? "info" : "neutral"}>
            {lead.market}
          </Badge>
        )}
      </div>
    </div>
  );
}
