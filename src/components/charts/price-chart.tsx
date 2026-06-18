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
const INTL_COLOR = "#7C3AED";

function isIntl(company: string): boolean {
  return company.toUpperCase().includes("INTERNACIONAL");
}

/** Shorten the long company labels for the legend/tooltip. */
function shortName(company: string): string {
  const c = company.toUpperCase();
  if (c.includes("INTERNACIONAL")) return "Internacional (ICE)";
  if (c.includes("LUKER")) return c.includes("ALTO") ? "Casa Luker (Alto Cd)" : "Casa Luker";
  if (c.includes("IBAGU")) return "Nal. Chocolate Ibagué";
  if (c.includes("NACIONAL") || c.includes("BTA") || c.includes("BOGOT"))
    return "Nacional de Chocolates";
  return company;
}

export function PriceChart({
  data,
  companies,
}: {
  data: PriceSeriesPoint[];
  companies: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
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
          width={48}
          domain={["dataMin - 200", "dataMax + 200"]}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}k`}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontSize: 12,
            color: "var(--fg)",
          }}
          formatter={(value: unknown, name: unknown) => [
            `${new Intl.NumberFormat("es-CO").format(Number(value))} COP/kg`,
            shortName(String(name)),
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "var(--fg-muted)", paddingTop: 8 }}
          iconType="plainline"
          formatter={(value: unknown) => (
            <span style={{ color: "var(--fg-muted)" }}>{shortName(String(value))}</span>
          )}
        />
        {companies.map((c, i) => (
          <Line
            key={c}
            type="monotone"
            dataKey={c}
            stroke={isIntl(c) ? INTL_COLOR : SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
            strokeDasharray={isIntl(c) ? "5 4" : undefined}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
