"use client";

import { MapPin, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, initials, formatCOP } from "@/lib/utils";
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

      {lead.potential_value_cop != null && (
        <p className="mt-2 font-mono text-xs font-semibold tnum text-fg">
          {formatCOP(lead.potential_value_cop)}
          <span className="ml-1 font-sans font-normal text-fg-subtle">potencial</span>
        </p>
      )}

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
