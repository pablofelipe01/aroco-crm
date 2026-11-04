"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFormatos, useLocale } from "@/lib/i18n/provider";

/**
 * Margen inicial que StoneX retiene, estado por estado.
 *
 * Una sola serie: sin leyenda, el título la nombra. Línea fina en el acento y
 * tooltip con cruz al pasar, que es donde se lee la cifra exacta de un día.
 * Se agregó el 2026-11-04, cuando el margen empezó a leerse del PDF y se vio
 * que había pasado de ~8.000 a 3.680 US$ con la misma posición abierta.
 */
export function MargenChart({ datos }: { datos: { fecha: string; margen: number }[] }) {
  const f = useFormatos();
  const locale = useLocale();
  const corta = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    );

  return (
    <div
      className="h-32 w-full"
      role="img"
      aria-label={datos.map((d) => `${f.fecha(d.fecha)}: US$ ${f.numero(d.margen)}`).join(", ")}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="fecha"
            tickFormatter={corta}
            tick={{ fontSize: 10, fill: "var(--color-fg-subtle)" }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            width={44}
            tickFormatter={(v: number) => f.numero(v)}
            tick={{ fontSize: 10, fill: "var(--color-fg-subtle)" }}
            axisLine={false}
            tickLine={false}
            domain={[0, "auto"]}
          />
          <Tooltip
            cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }}
            contentStyle={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              fontSize: 12,
              color: "var(--color-fg)",
            }}
            labelFormatter={(v) => f.fecha(String(v))}
            formatter={(v: unknown) => [`US$ ${f.numero(Number(v))}`, null]}
          />
          <Line
            type="monotone"
            dataKey="margen"
            stroke="var(--color-accent-mid)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--color-surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
