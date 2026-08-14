"use client";

import {
  ComposedChart,
  Bar,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatNumber } from "@/lib/utils";
import type { PuntoMes } from "@/lib/ventas";

const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

/** Toneladas: en kilos el eje se vuelve ilegible a esta escala. */
const aT = (kg: number) => kg / 1000;

/**
 * Barras del mes y línea del acumulado, contra la meta anual.
 *
 * Las dos series comparten el eje en toneladas a propósito: lo que interesa es
 * ver cuánto falta para la línea de meta, y con dos ejes esa distancia deja de
 * ser comparable a simple vista.
 */
export function VentasChart({ meses, metaKg }: { meses: PuntoMes[]; metaKg: number }) {
  const data = meses.map((m, i) => ({
    mes: MESES[i],
    Mes: aT(m.kg),
    Acumulado: aT(m.acumulado),
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="mes"
            tick={{ fontSize: 11, fill: "var(--color-fg-subtle)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--color-fg-subtle)" }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v: number) => `${formatNumber(v)} t`}
          />
          <Tooltip
            formatter={(v, name) => [`${formatNumber(Number(v) || 0, 1)} t`, String(name)]}
            contentStyle={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine
            y={aT(metaKg)}
            stroke="var(--color-accent)"
            strokeDasharray="5 4"
            label={{
              value: `Meta ${formatNumber(aT(metaKg))} t`,
              position: "insideTopRight",
              fill: "var(--color-accent)",
              fontSize: 11,
            }}
          />
          <Bar dataKey="Mes" fill="#40916C" radius={[4, 4, 0, 0]} maxBarSize={34} />
          <Line
            type="monotone"
            dataKey="Acumulado"
            stroke="#B45309"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
