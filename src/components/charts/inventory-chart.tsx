"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatKg } from "@/lib/utils";

export interface InventoryDatum {
  region: string;
  kg: number;
}

const COLORS = [
  "#1B4332",
  "#2D6A4F",
  "#40916C",
  "#52B788",
  "#74A57F",
  "#95D5B2",
  "#B45309",
  "#9B6A4F",
  "#cfc9b9",
];

export function InventoryChart({ data }: { data: InventoryDatum[] }) {
  const total = data.reduce((s, d) => s + d.kg, 0) || 1;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      {/* Donut */}
      <div className="relative h-52 w-52 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="kg"
              nameKey="region"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={84}
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              {data.map((d, i) => (
                <Cell key={d.region} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: unknown) => formatKg(Number(value))}
              contentStyle={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
                color: "var(--fg)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center total */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-lg font-bold tabular-nums text-fg">
            {(total / 1000).toFixed(1)}t
          </span>
          <span className="text-[10px] uppercase tracking-wide text-fg-subtle">
            total
          </span>
        </div>
      </div>

      {/* Legend with values */}
      <ul className="flex max-h-52 w-full flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        {data.map((d, i) => (
          <li key={d.region} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-fg-muted">
              {d.region}
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-fg">
              {formatKg(d.kg)}
            </span>
            <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-fg-subtle">
              {Math.round((d.kg / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
