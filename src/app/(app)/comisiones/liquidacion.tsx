"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Receipt, UserX } from "lucide-react";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCOP, formatDate, formatNumber, cn } from "@/lib/utils";

/**
 * La liquidación del mes, tal como la cerró Nicolás en la hoja.
 *
 * El CRM la LEE; todavía no la calcula. Calcularla necesita la utilidad por
 * operación, que hoy no está en ninguna tabla —la hoja la saca del costo de
 * compra de cada despacho y el CRM no lo guarda— así que por ahora la hoja es
 * la fuente y esto es su reflejo, con los permisos del CRM encima.
 *
 * Quien no ve todo recibe SOLO su línea: el resumen del mes trae la utilidad y
 * el total a pagar de todo el equipo, y eso no es «lo suyo» de nadie. Por eso
 * el periodo llega en null para un comercial y la pantalla se arma igual.
 */

export type LiquidacionPeriodo = {
  anio: number;
  mes: number;
  mesNombre: string | null;
  toneladas: number;
  utilidad: number;
  totalComisiones: number;
  sumaLineas: number;
  umbralSeniorTon: number | null;
  syncedAt: string;
};

export type LiquidacionLinea = {
  id: string;
  anio: number;
  mes: number;
  comercial: string;
  asignadoA: string | null;
  tonVenta: number;
  tonCompra: number;
  tonTotal: number;
  nivel: string | null;
  pctTecho: number | null;
  utilidadVenta: number;
  utilidadCompra: number;
  comisionVenta: number;
  comisionCompra: number;
  totalPagar: number;
};

export type LiquidacionOperacion = {
  id: string;
  fecha: string | null;
  cliente: string | null;
  odc: string | null;
  descripcion: string | null;
  kg: number;
  vendedor: string | null;
  comprador: string | null;
  utilidadNeta: number;
  comisionVendedor: number;
  comisionComprador: number;
};

const MESES = [
  "", "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const etiquetaMes = (anio: number, mes: number) => `${MESES[mes] ?? mes} ${anio}`;

export function Liquidacion({
  periodo,
  lineas,
  operaciones,
  meses,
  seleccion,
  veTodo,
}: {
  periodo: LiquidacionPeriodo | null;
  lineas: LiquidacionLinea[];
  operaciones: LiquidacionOperacion[];
  meses: { anio: number; mes: number }[];
  seleccion: { anio: number; mes: number } | null;
  veTodo: boolean;
}) {
  const router = useRouter();

  if (meses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Receipt className="h-4 w-4 text-fg-subtle" /> Liquidación del mes
            </span>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <EmptyState
            icon={<Receipt className="h-6 w-6" />}
            title="Todavía no hay ninguna liquidación"
            description="Se lee de la hoja cada día a las 12:45 UTC. Si acabas de cerrar un mes, espera a la próxima corrida."
          />
        </CardBody>
      </Card>
    );
  }

  // Un descuadre de unos pocos pesos es el redondeo de la propia hoja; uno
  // grande significa que sus dos cifras no cuadran entre sí.
  const descuadre =
    periodo && Math.abs(periodo.totalComisiones - periodo.sumaLineas) > lineas.length
      ? periodo.totalComisiones - periodo.sumaLineas
      : null;

  const sinAsignar = lineas.filter(
    (l) => !l.asignadoA && l.comercial.toUpperCase() !== "AROCO",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Receipt className="h-4 w-4 text-fg-subtle" /> Liquidación del mes
          </span>
        </CardTitle>
        <div className="flex items-center gap-2">
          {periodo && (
            <span className="hidden font-mono text-[11px] text-fg-subtle sm:inline">
              leída el {formatDate(periodo.syncedAt)}
            </span>
          )}
          <Select
            value={seleccion ? `${seleccion.anio}-${seleccion.mes}` : ""}
            onChange={(e) => {
              const [a, m] = e.target.value.split("-");
              router.push(`/comisiones?anio=${a}&mes=${m}`);
            }}
            className="h-8 w-auto py-0 text-xs"
          >
            {meses.map((p) => (
              <option key={`${p.anio}-${p.mes}`} value={`${p.anio}-${p.mes}`}>
                {etiquetaMes(p.anio, p.mes)}
              </option>
            ))}
          </Select>
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        <p className="text-xs text-fg-subtle">
          Viene de la hoja que cierra Nicolás cada mes. El CRM todavía no la
          calcula: para eso le falta la utilidad de cada operación, que hoy no
          guarda.
        </p>

        {periodo && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Toneladas despachadas"
              value={Number(periodo.toneladas.toFixed(2))}
              suffix=" t"
              hint={
                periodo.umbralSeniorTon
                  ? `umbral Senior: ${formatNumber(periodo.umbralSeniorTon, 0)} t`
                  : undefined
              }
            />
            <StatCard
              label="Utilidad del mes"
              value={Math.round(periodo.utilidad / 1_000_000)}
              prefix="$ "
              suffix=" M"
            />
            <StatCard
              label="Total a pagar"
              value={Math.round(periodo.totalComisiones)}
              prefix="$ "
            />
          </div>
        )}

        {descuadre !== null && (
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-warn/40 bg-warn-soft/40 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <p className="text-xs text-fg-muted">
              El total de la hoja y la suma de sus líneas difieren en{" "}
              <b className="font-mono tnum">{formatCOP(descuadre)}</b>. No es
              redondeo: las dos cifras de la hoja no cuadran entre sí.
            </p>
          </div>
        )}

        {sinAsignar.length > 0 && (
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-warn/40 bg-warn-soft/40 p-3">
            <UserX className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <p className="text-xs text-fg-muted">
              {sinAsignar.map((l) => l.comercial).join(", ")} no corresponde a
              nadie del equipo en el CRM, así que esa persona no ve su propia
              liquidación. Se asigna en la tabla <code>comision_comerciales</code>.
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                <th className="pb-2 pr-3 font-medium">Comercial</th>
                <th className="pb-2 pr-3 text-right font-medium">Ton venta</th>
                <th className="pb-2 pr-3 text-right font-medium">Ton compra</th>
                <th className="pb-2 pr-3 font-medium">Nivel</th>
                <th className="pb-2 pr-3 text-right font-medium">Techo</th>
                <th className="pb-2 pr-3 text-right font-medium">Utilidad</th>
                <th className="pb-2 text-right font-medium">A pagar</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => {
                const casa = l.comercial.toUpperCase() === "AROCO";
                return (
                  <tr
                    key={l.id}
                    className={cn(
                      "border-b border-border/60 last:border-0",
                      casa && "text-fg-subtle",
                    )}
                  >
                    <td className="py-1.5 pr-3">
                      {l.comercial}
                      {casa ? (
                        // La casa mueve toneladas y no cobra: sin decirlo, un
                        // 0 % al lado de 4,6 t parece un error de cálculo.
                        <span className="ml-1.5 text-[11px]">· la casa, no cobra</span>
                      ) : l.asignadoA && l.asignadoA !== l.comercial ? (
                        <span className="ml-1.5 text-[11px] text-fg-subtle">
                          {l.asignadoA}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tnum">
                      {formatNumber(l.tonVenta, 2)}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tnum">
                      {formatNumber(l.tonCompra, 2)}
                    </td>
                    <td className="py-1.5 pr-3">
                      {l.nivel && <Badge tone="neutral">{l.nivel}</Badge>}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tnum">
                      {l.pctTecho === null ? "—" : `${formatNumber(l.pctTecho * 100, 2)} %`}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tnum">
                      {formatCOP(l.utilidadVenta + l.utilidadCompra)}
                    </td>
                    <td className="py-1.5 text-right font-mono tnum font-semibold text-fg">
                      {formatCOP(l.totalPagar)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {operaciones.length > 0 && (
          <details className="rounded-[var(--radius-md)] border border-border">
            <summary className="cursor-pointer px-3 py-2 text-xs text-fg-muted">
              Detalle: {operaciones.length} operaciones del mes
            </summary>
            <div className="max-h-80 overflow-auto border-t border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-left uppercase tracking-wide text-fg-subtle">
                    <th className="p-2 font-medium">Fecha</th>
                    <th className="p-2 font-medium">ODC</th>
                    <th className="p-2 font-medium">Origen</th>
                    <th className="p-2 text-right font-medium">Kg</th>
                    <th className="p-2 text-right font-medium">Utilidad neta</th>
                    <th className="p-2 font-medium">Vendedor</th>
                    <th className="p-2 font-medium">Comprador</th>
                  </tr>
                </thead>
                <tbody>
                  {operaciones.map((o) => (
                    <tr key={o.id} className="border-b border-border/60 last:border-0">
                      <td className="p-2 font-mono tnum text-fg-subtle">
                        {o.fecha ? formatDate(o.fecha) : "—"}
                      </td>
                      <td className="p-2 font-mono text-fg-muted">{o.odc ?? "—"}</td>
                      <td className="max-w-48 truncate p-2 text-fg-muted">
                        {o.descripcion ?? "—"}
                      </td>
                      <td className="p-2 text-right font-mono tnum">
                        {formatNumber(o.kg, 1)}
                      </td>
                      {/* Una operación en pérdida resta de la comisión del mes:
                          el signo tiene que verse. */}
                      <td
                        className={cn(
                          "p-2 text-right font-mono tnum",
                          o.utilidadNeta < 0 ? "text-danger" : "text-fg",
                        )}
                      >
                        {formatCOP(o.utilidadNeta)}
                      </td>
                      <td className="p-2 text-fg-muted">{o.vendedor ?? "—"}</td>
                      <td className="p-2 text-fg-muted">{o.comprador ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {!veTodo && (
          <p className="text-xs text-fg-subtle">
            Ves tu propia liquidación. El resumen del mes y las de los demás son
            de Dirección.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
