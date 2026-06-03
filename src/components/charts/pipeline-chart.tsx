"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export interface PipelineDatum {
  stage: string;
  count: number;
  color: string;
}

export function PipelineChart({ data }: { data: PipelineDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <XAxis
          dataKey="stage"
          tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={50}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--fg-subtle)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: "var(--bg-muted)", opacity: 0.4 }}
          contentStyle={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontSize: 12,
            color: "var(--fg)",
          }}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.stage} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
