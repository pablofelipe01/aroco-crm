"use client";

import { formatKg } from "@/lib/utils";

export interface InventoryDatum {
  region: string;
  kg: number;
}

/**
 * Inventario por procedencia como barras ordenadas.
 *
 * Antes era una dona con siete tajadas en verdes casi iguales (de la paleta
 * vieja, en hex crudo): no se distinguía qué tajada era qué región y había que
 * ir a la leyenda para todo. En barras la longitud se compara de un vistazo,
 * el nombre va pegado a su cifra y no hace falta leyenda (revisión 2026-11-04).
 */
export function InventoryChart({ data }: { data: InventoryDatum[] }) {
  const total = data.reduce((s, d) => s + d.kg, 0) || 1;
  const max = Math.max(...data.map((d) => d.kg), 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-bold tnum text-fg">{formatKg(total)}</span>
        <span className="text-xs uppercase tracking-wide text-fg-subtle">total</span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {data.map((d) => {
          const pct = Math.round((d.kg / total) * 100);
          const otros = d.region === "Otros";
          return (
            <li key={d.region} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-fg-muted">{d.region}</span>
                <span className="shrink-0 font-mono text-xs tnum text-fg">{formatKg(d.kg)}</span>
                <span className="w-9 shrink-0 text-right font-mono text-[11px] tnum text-fg-subtle">
                  {pct}%
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
                role="presentation"
              >
                <div
                  className={
                    "h-full rounded-full transition-[width] duration-200 " +
                    (otros ? "bg-fg-subtle/50" : "bg-accent-mid")
                  }
                  style={{ width: `${Math.max((d.kg / max) * 100, 2)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
