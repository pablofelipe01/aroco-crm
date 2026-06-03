"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

export interface PriceSeriesPoint {
  date: string;
  [company: string]: string | number | null;
}

const SERIES_COLORS = ["#1B4332", "#B45309", "#1E40AF"];

export function PriceChart({
  data,
  companies,
}: {
  data: PriceSeriesPoint[];
  companies: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
          axisLine={false}
          tickLine={false}
          width={56}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontSize: 12,
            color: "var(--fg)",
          }}
          formatter={(value) =>
            new Intl.NumberFormat("es-CO").format(Number(value)) + " COP/kg"
          }
        />
        <Legend wrapperStyle={{ fontSize: 11, color: "var(--fg-muted)" }} iconType="plainline" />
        {companies.map((c, i) => (
          <Line
            key={c}
            type="monotone"
            dataKey={c}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
