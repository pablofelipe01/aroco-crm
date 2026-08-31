"use client";

import * as React from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, MapPin } from "lucide-react";
import { LEAD_STAGE_TONE, LEAD_STAGE_WEIGHT, type LeadStage } from "@/lib/status";
import { initials } from "@/lib/utils";
import { useT, useFormatos } from "@/lib/i18n/provider";
import type { LeadWithOwner } from "./page";

const col = createColumnHelper<LeadWithOwner>();

export function LeadList({
  leads,
  onSelect,
}: {
  leads: LeadWithOwner[];
  onSelect: (l: LeadWithOwner) => void;
}) {
  const t = useT();
  const f = useFormatos();
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const columns = React.useMemo(
    () => [
      col.accessor("company", {
        header: t.comercial.empresa,
        cell: (c) => (
          <span className="font-medium text-fg">{c.getValue()}</span>
        ),
      }),
      col.accessor("contact_name", {
        header: t.comercial.contacto,
        cell: (c) => c.getValue() ?? "—",
      }),
      col.accessor("country", {
        header: t.comercial.pais,
        cell: (c) => c.getValue() ?? "—",
      }),
      col.accessor("market", {
        header: t.comercial.mercado,
        cell: (c) => {
          const m = c.getValue();
          return m ? (t.mercados[m as keyof typeof t.mercados] ?? m) : "—";
        },
      }),
      col.accessor("status", {
        header: t.comercial.estado,
        cell: (c) => (
          <Badge tone={LEAD_STAGE_TONE[c.getValue() as LeadStage]} dot>
            {t.etapas[c.getValue() as LeadStage]}
          </Badge>
        ),
      }),
      col.accessor((l) => LEAD_STAGE_WEIGHT[l.status as LeadStage] ?? 0, {
        id: "prob",
        header: t.comercial.prob,
        cell: (c) => (
          <span className="font-mono tnum font-semibold text-accent-soft-fg">
            {Math.round((c.getValue() as number) * 100)}%
          </span>
        ),
      }),
      col.accessor((l) => l.toneladas ?? 0, {
        id: "toneladas",
        header: t.unidades.tm,
        cell: (c) =>
          (c.getValue() as number) > 0 ? f.numero(c.getValue() as number, 1) : "—",
      }),
      col.accessor((l) => l.owner?.name ?? "", {
        id: "owner",
        header: t.comercial.responsable,
        cell: (c) => c.getValue() || "—",
      }),
      col.accessor("next_action_date", {
        header: t.comercial.proximaAccion,
        cell: (c) => (c.getValue() ? f.fecha(c.getValue()) : "—"),
      }),
    ],
    [t, f],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table manages its own memoization
  const table = useReactTable({
    data: leads,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title={t.comercial.sinLeads}
        description={t.comercial.sinCoincidencias}
      />
    );
  }

  return (
    <>
      {/* Mobile: card list */}
      <ul className="space-y-2 sm:hidden">
        {table.getRowModel().rows.map((row) => {
          const l = row.original;
          return (
            <li key={row.id}>
              <button
                onClick={() => onSelect(l)}
                className="flex w-full flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface p-3 text-left shadow-[var(--shadow-soft-sm)] active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 font-medium text-fg">
                    {l.company}
                  </span>
                  <Badge tone={LEAD_STAGE_TONE[l.status as LeadStage]} dot>
                    {l.status}
                  </Badge>
                </div>
                {l.contact_name && (
                  <span className="truncate text-xs text-fg-muted">
                    {l.contact_name}
                  </span>
                )}
                <div className="flex items-center justify-between gap-2 text-xs text-fg-subtle">
                  <span className="flex items-center gap-1 truncate">
                    {l.country && (
                      <>
                        <MapPin className="h-3 w-3 shrink-0" />
                        {l.country}
                      </>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {l.market && <Badge tone="neutral">{l.market}</Badge>}
                    {l.owner && (
                      <span
                        title={l.owner.name}
                        className="flex h-5 w-5 items-center justify-center rounded-full font-mono text-[9px] text-white"
                        style={{ backgroundColor: l.owner.color ?? "var(--accent)" }}
                      >
                        {initials(l.owner.name)}
                      </span>
                    )}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Desktop: sortable table */}
      <div className="hidden overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface sm:block">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border">
              {hg.headers.map((h) => {
                const sorted = h.column.getIsSorted();
                return (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className="cursor-pointer select-none px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-fg-subtle hover:text-fg"
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {sorted === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : sorted === "desc" ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onSelect(row.original)}
              className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-bg-subtle/60"
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3 text-fg-muted">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
