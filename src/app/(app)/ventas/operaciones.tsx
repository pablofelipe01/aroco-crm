"use client";

import * as React from "react";
import { AlertTriangle, Scale } from "lucide-react";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { formatCOP, formatDate, formatNumber, cn } from "@/lib/utils";

/**
 * El margen de cada operación.
 *
 * Existe porque el precio que se negocia con el proveedor NO es lo que la
 * operación cuesta: al proveedor se le paga además la bonificación de calidad
 * y se le descuenta la humedad y las retenciones. Hasta ahora el CRM solo
 * tenía el precio negociado, así que calculaba márgenes más altos de los
 * reales — en la ODC-52 de agosto, 12.012 contra 12.519 de costo verdadero.
 *
 * Las cifras las calcula la hoja «VENTAS 2026»; el CRM las refleja. Se enseña
 * el precio base AL LADO del costo real a propósito: la diferencia entre los
 * dos es exactamente lo que antes no se veía.
 */

export type OperacionVista = {
  id: string;
  fecha: string | null;
  cliente: string | null;
  odc: string;
  origen: string | null;
  kg: number;
  precioBase: number;
  costoRealKg: number | null;
  ventaKg: number;
  valorAPagar: number;
  pagoProveedor: number;
  bonificacionProveedor: number;
  descuentoHumedad: number;
  margen: number;
  descuadre: number | null;
};

export function OperacionesMargen({ operaciones }: { operaciones: OperacionVista[] }) {
  const [cliente, setCliente] = React.useState("");

  const clientes = React.useMemo(
    () => [...new Set(operaciones.map((o) => o.cliente).filter(Boolean))].sort() as string[],
    [operaciones],
  );

  const filtradas = cliente
    ? operaciones.filter((o) => o.cliente === cliente)
    : operaciones;

  const kg = filtradas.reduce((s, o) => s + o.kg, 0);
  const margen = filtradas.reduce((s, o) => s + o.margen, 0);
  const enPerdida = filtradas.filter((o) => o.margen < 0);
  const descuadradas = filtradas.filter((o) => o.descuadre !== null);

  if (operaciones.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Scale className="h-4 w-4 text-fg-subtle" /> Margen por operación
          </span>
        </CardTitle>
        {clientes.length > 1 && (
          <Select
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            className="h-8 w-auto py-0 text-xs"
          >
            <option value="">Todos los clientes</option>
            {clientes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}
      </CardHeader>

      <CardBody className="space-y-4">
        <p className="text-xs text-fg-subtle">
          El costo real no es el precio negociado: incluye la bonificación de
          calidad que se le paga al proveedor y descuenta humedad y retenciones.
          Viene de la hoja «VENTAS 2026».
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Operaciones" value={filtradas.length} />
          <StatCard
            label="Kilos"
            value={Number((kg / 1000).toFixed(1))}
            suffix=" t"
          />
          <StatCard
            label="Margen"
            value={Math.round(margen / 1_000_000)}
            prefix="$ "
            suffix=" M"
            hint={
              enPerdida.length > 0
                ? `${enPerdida.length} en pérdida`
                : "ninguna en pérdida"
            }
          />
        </div>

        {descuadradas.length > 0 && (
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-warn/40 bg-warn-soft/40 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <p className="text-xs text-fg-muted">
              En {descuadradas.length}{" "}
              {descuadradas.length === 1 ? "operación" : "operaciones"} la suma
              de la hoja no cuadra consigo misma: lo que dice pagarle al
              proveedor no es lo que dan sus propias columnas (
              {descuadradas.map((o) => o.odc).join(", ")}). Ese margen no es de
              fiar hasta revisarlo.
            </p>
          </div>
        )}

        <div className="max-h-[30rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                <th className="pb-2 pr-3 font-medium">Fecha</th>
                <th className="pb-2 pr-3 font-medium">ODC</th>
                <th className="pb-2 pr-3 font-medium">Origen</th>
                <th className="pb-2 pr-3 text-right font-medium">Kg</th>
                <th className="pb-2 pr-3 text-right font-medium">Base</th>
                <th className="pb-2 pr-3 text-right font-medium">Costo real</th>
                <th className="pb-2 pr-3 text-right font-medium">Venta</th>
                <th className="pb-2 text-right font-medium">Margen</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((o) => {
                const brecha =
                  o.costoRealKg === null ? null : o.costoRealKg - o.precioBase;
                return (
                  <tr
                    key={o.id}
                    className={cn(
                      "border-b border-border/60 last:border-0",
                      o.margen < 0 && "bg-danger-soft/20",
                    )}
                  >
                    <td className="py-1.5 pr-3 font-mono tnum text-xs text-fg-subtle">
                      {o.fecha ? formatDate(o.fecha) : "—"}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-xs text-fg-muted">
                      {o.odc}
                      {o.descuadre !== null && (
                        <Badge tone="warn" className="ml-1.5">
                          descuadre
                        </Badge>
                      )}
                    </td>
                    <td className="max-w-40 truncate py-1.5 pr-3 text-xs text-fg-muted">
                      {o.origen ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tnum">
                      {formatNumber(o.kg, 1)}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tnum text-fg-subtle">
                      {formatNumber(o.precioBase, 0)}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tnum text-fg">
                      {o.costoRealKg === null ? "—" : formatNumber(o.costoRealKg, 0)}
                      {/* La diferencia contra el precio negociado es justo lo
                          que el CRM no veía antes. */}
                      {brecha !== null && Math.abs(brecha) >= 1 && (
                        <span
                          className={cn(
                            "ml-1 text-[11px]",
                            brecha > 0 ? "text-warn" : "text-success",
                          )}
                        >
                          {brecha > 0 ? "+" : ""}
                          {formatNumber(brecha, 0)}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tnum text-fg-muted">
                      {formatNumber(o.ventaKg, 0)}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 text-right font-mono tnum font-medium",
                        o.margen < 0 ? "text-danger" : "text-fg",
                      )}
                    >
                      {formatCOP(o.margen)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
