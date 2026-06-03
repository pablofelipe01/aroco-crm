"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
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
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="kg"
          nameKey="region"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          stroke="var(--surface)"
          strokeWidth={2}
        >
          {data.map((d, i) => (
            <Cell key={d.region} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => formatKg(Number(value))}
          contentStyle={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontSize: 12,
            color: "var(--fg)",
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "var(--fg-muted)" }}
          iconType="circle"
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
