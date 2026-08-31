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
import { useT, useFormatos } from "@/lib/i18n/provider";
import type { PuntoMes } from "@/lib/ventas";

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
  const t = useT();
  const f = useFormatos();
  // Recharts usa la clave de la serie como rótulo de la leyenda, así que el
  // nombre traducido tiene que ser la clave misma, no un alias.
  const cortos = Object.values(t.mesesCortos);
  const data = meses.map((m, i) => ({
    mes: cortos[i],
    [t.grafico.mes]: aT(m.kg),
    [t.grafico.acumulado]: aT(m.acumulado),
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
            tickFormatter={(v: number) => `${f.numero(v)} t`}
          />
          <Tooltip
            formatter={(v, name) => [`${f.numero(Number(v) || 0, 1)} t`, String(name)]}
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
              value: `${t.grafico.meta} ${f.numero(aT(metaKg))} t`,
              position: "insideTopRight",
              fill: "var(--color-accent)",
              fontSize: 11,
            }}
          />
          <Bar
            dataKey={t.grafico.mes}
            fill="#40916C"
            radius={[4, 4, 0, 0]}
            maxBarSize={34}
          />
          <Line
            type="monotone"
            dataKey={t.grafico.acumulado}
            stroke="#B45309"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
