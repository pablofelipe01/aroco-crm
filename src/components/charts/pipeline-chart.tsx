"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

export interface PipelineDatum {
  stage: string;
  count: number;
  color: string;
}

export function PipelineChart({ data }: { data: PipelineDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 28, left: 8, bottom: 4 }}
        barCategoryGap={8}
      >
        <XAxis type="number" hide domain={[0, "dataMax"]} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="stage"
          width={92}
          tick={{ fontSize: 12, fill: "var(--fg-muted)" }}
          axisLine={false}
          tickLine={false}
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
          formatter={(value: unknown) => [`${Number(value)} leads`, "Cantidad"]}
        />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20}>
          {data.map((d) => (
            <Cell key={d.stage} fill={d.color} />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            style={{ fill: "var(--fg)", fontSize: 12, fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
