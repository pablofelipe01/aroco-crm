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
import { Users } from "lucide-react";
import { LEAD_STAGE_TONE, type LeadStage } from "@/lib/status";
import { formatDate } from "@/lib/utils";
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
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
      <table className="w-full text-sm">
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
  );
}
