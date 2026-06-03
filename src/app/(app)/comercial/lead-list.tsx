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
import { LEAD_STAGE_TONE, type LeadStage } from "@/lib/status";
import { formatDate, initials } from "@/lib/utils";
import type { LeadWithOwner } from "./page";

const col = createColumnHelper<LeadWithOwner>();

export function LeadList({
  leads,
  onSelect,
}: {
  leads: LeadWithOwner[];
  onSelect: (l: LeadWithOwner) => void;
}) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const columns = React.useMemo(
    () => [
      col.accessor("company", {
        header: "Empresa",
        cell: (c) => (
          <span className="font-medium text-fg">{c.getValue()}</span>
        ),
      }),
      col.accessor("contact_name", {
        header: "Contacto",
        cell: (c) => c.getValue() ?? "—",
      }),
      col.accessor("country", {
        header: "País",
        cell: (c) => c.getValue() ?? "—",
      }),
      col.accessor("market", {
        header: "Mercado",
        cell: (c) => c.getValue() ?? "—",
      }),
      col.accessor("status", {
        header: "Estado",
        cell: (c) => (
          <Badge tone={LEAD_STAGE_TONE[c.getValue() as LeadStage]} dot>
            {c.getValue()}
          </Badge>
        ),
      }),
      col.accessor((l) => l.owner?.name ?? "", {
        id: "owner",
        header: "Responsable",
        cell: (c) => c.getValue() || "—",
      }),
      col.accessor("next_action_date", {
        header: "Próxima acción",
        cell: (c) => (c.getValue() ? formatDate(c.getValue()) : "—"),
      }),
    ],
    [],
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
        title="Sin leads"
        description="No hay leads que coincidan con los filtros."
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
