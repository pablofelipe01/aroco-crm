"use client";

import * as React from "react";
import { AlertTriangle, Clock, Droplets, Fuel, Gauge } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollFijo } from "@/components/ui/scroll-fijo";
import { cn, formatCOP, formatDate, formatNumber, formatPct } from "@/lib/utils";
import {
  MOTOR,
  TOLERANCIA,
  costoPorHora,
  horasPorValvula,
  resumenEquipos,
  resumenMensual,
  type EquipoVista,
} from "@/lib/finca/combustible";

export type CompraTabla = {
  id: string;
  fecha: string;
  combustible: "acpm" | "gasolina";
  recibo: string | null;
  galones: number | null;
  precio: number | null;
  valor: number | null;
  proveedor: string | null;
  destino: string | null;
  observaciones: string | null;
  dudoso: boolean;
  motivoDuda: string | null;
  refHoja: string | null;
};

export type UsoTabla = {
  id: string;
  fecha: string;
  equipo: string;
  actividad: string | null;
  valvulas: string[];
  sitio: string | null;
  horas: number | null;
  carga: number | null;
  observaciones: string | null;
  dudoso: boolean;
  motivoDuda: string | null;
  refHoja: string | null;
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const num = (v: number | null, d = 0) => (v == null ? "—" : formatNumber(v, d));
const th = "px-3 py-2 font-medium";
const thR = "px-3 py-2 text-right font-medium";
const td = "tnum px-3 py-1.5 text-right font-mono";

export function RiegoCombustible({
  compras,
  usos,
  equipos,
  valvulasOrden,
}: {
  compras: CompraTabla[];
  usos: UsoTabla[];
  equipos: EquipoVista[];
  valvulasOrden: string[];
}) {
  const motor = equipos.find((e) => e.codigo === MOTOR);
  const consumo = motor?.consumoGalH ?? 0.97;

  const vistaUsos = React.useMemo(
    () => usos.map((u) => ({ fecha: u.fecha, equipo: u.equipo, valvulas: u.valvulas, horas: u.horas, carga: u.carga })),
    [usos],
  );
  const meses = React.useMemo(
    () => resumenMensual(compras.map((c) => ({ ...c })), vistaUsos, consumo),
    [compras, vistaUsos, consumo],
  );
  const porValvula = React.useMemo(() => horasPorValvula(vistaUsos), [vistaUsos]);
  const porEquipo = React.useMemo(() => resumenEquipos(equipos, vistaUsos), [equipos, vistaUsos]);

  if (!compras.length && !usos.length) {
    return (
      <EmptyState
        icon={<Fuel className="h-6 w-6" />}
        title="Sin datos de riego ni combustible"
        description="La historia entra con scripts/cargar-combustible.ts desde la planilla de control de la finca."
      />
    );
  }

  const tot = meses.reduce(
    (a, m) => ({
      acpmGal: a.acpmGal + m.acpmGal,
      acpmValor: a.acpmValor + m.acpmValor,
      gasValor: a.gasValor + m.gasolinaValor,
      horas: a.horas + m.horasRiego,
      carga: a.carga + m.cargaMotor,
      esperado: a.esperado + m.esperadoMotor,
    }),
    { acpmGal: 0, acpmValor: 0, gasValor: 0, horas: 0, carga: 0, esperado: 0 },
  );
  const cph = costoPorHora(meses);
  const fueraDeRango = meses.filter((m) => m.desvio != null && Math.abs(m.desvio) > TOLERANCIA);
  const dudosos = [
    ...compras.filter((c) => c.dudoso).map((c) => ({ ref: c.refHoja, fecha: c.fecha, que: `Compra de ${c.combustible === "acpm" ? "ACPM" : "gasolina"}`, motivo: c.motivoDuda })),
    ...usos.filter((u) => u.dudoso).map((u) => ({ ref: u.refHoja, fecha: u.fecha, que: equipos.find((e) => e.codigo === u.equipo)?.nombre ?? u.equipo, motivo: u.motivoDuda })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const valvulas = [
    ...valvulasOrden.filter((v) => porValvula.has(v)),
    ...[...porValvula.keys()].filter((v) => !valvulasOrden.includes(v)),
  ];
  const maxValvula = Math.max(1, ...porValvula.values());

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="ACPM comprado"
          value={tot.acpmGal}
          suffix=" gal"
          icon={Fuel}
          hint={formatCOP(tot.acpmValor)}
        />
        <StatCard label="Horas de riego" value={tot.horas} icon={Clock} hint="Motor de riego, todas las válvulas" />
        <StatCard
          label="Cargado al motor"
          value={tot.carga}
          suffix=" gal"
          icon={Gauge}
          hint={`Esperado ${formatNumber(tot.esperado)} gal (${formatNumber(consumo, 2)} gal/h)`}
        />
        <StatCard
          label="ACPM por hora de riego"
          value={cph ?? 0}
          prefix="$"
          icon={Droplets}
          hint="Lo pagado ÷ horas de riego"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Motor de riego, mes a mes</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-fg-muted text-sm">
            Lo esperado es horas de riego × {formatNumber(consumo, 2)} gal/h (medido en la finca). Se
            marca el mes en que lo cargado al motor se aleja más de {formatPct(TOLERANCIA, 0)}: o
            faltan horas por anotar, o se está yendo combustible. La compra no se compara mes a mes
            porque el ACPM queda en tanque de un mes a otro.
          </p>
          {fueraDeRango.length > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-warn">
              <AlertTriangle className="h-4 w-4" />
              {fueraDeRango.length} {fueraDeRango.length === 1 ? "mes" : "meses"} fuera de rango:{" "}
              {fueraDeRango.map((m) => nombreMes(m.mes)).join(", ")}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-fg-subtle border-b text-left text-[11px] tracking-wide uppercase">
                  <th className={th}>Mes</th>
                  <th className={thR}>ACPM comprado</th>
                  <th className={thR}>Pagado</th>
                  <th className={thR}>$ / gal</th>
                  <th className={thR}>Horas riego</th>
                  <th className={thR}>Cargado</th>
                  <th className={thR}>Esperado</th>
                  <th className={thR}>Diferencia</th>
                  <th className={thR}>Gasolina</th>
                </tr>
              </thead>
              <tbody>
                {meses.map((m) => {
                  const fuera = m.desvio != null && Math.abs(m.desvio) > TOLERANCIA;
                  return (
                    <tr key={m.mes} className="border-border/60 border-b last:border-0">
                      <td className="px-3 py-1.5 whitespace-nowrap">{nombreMes(m.mes)}</td>
                      <td className={td}>{m.acpmGal ? `${num(m.acpmGal, 1)} gal` : "—"}</td>
                      <td className={td}>{m.acpmValor ? formatCOP(m.acpmValor) : "—"}</td>
                      <td className={td}>{m.acpmPrecio ? formatCOP(m.acpmPrecio) : "—"}</td>
                      <td className={td}>{m.horasRiego ? num(m.horasRiego, 1) : "—"}</td>
                      <td className={td}>{m.cargaMotor ? `${num(m.cargaMotor, 1)} gal` : "—"}</td>
                      <td className={td}>{m.esperadoMotor ? `${num(m.esperadoMotor, 1)} gal` : "—"}</td>
                      <td className={cn(td, "whitespace-nowrap")}>
                        {m.desvio == null ? (
                          m.cargaMotor ? (
                            <span className="text-warn" title="Se cargó combustible y no hay horas anotadas">
                              sin horas
                            </span>
                          ) : (
                            "—"
                          )
                        ) : (
                          <Badge tone={fuera ? "warn" : "neutral"}>
                            {m.desvio > 0 ? "+" : ""}
                            {formatPct(m.desvio, 0)}
                          </Badge>
                        )}
                      </td>
                      <td className={td}>{m.gasolinaValor ? formatCOP(m.gasolinaValor) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Horas de riego por válvula</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            <p className="text-fg-muted text-xs">
              Las válvulas de un grupo («9, 10») riegan a la vez: cada una lleva las horas completas
              del tramo, por eso la suma pasa de las horas del motor.
            </p>
            <ul className="space-y-1.5">
              {valvulas.map((v) => {
                const h = porValvula.get(v) ?? 0;
                return (
                  <li key={v} className="flex items-center gap-2 text-sm">
                    <span className="tnum w-16 shrink-0 font-mono text-xs">{v}</span>
                    <span className="bg-bg-subtle relative h-2 flex-1 overflow-hidden rounded-full">
                      <span
                        className="bg-accent absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${(h / maxValvula) * 100}%` }}
                      />
                    </span>
                    <span className="tnum w-16 shrink-0 text-right font-mono text-xs">{num(h, 1)} h</span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Equipos</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-fg-subtle border-b text-left text-[11px] tracking-wide uppercase">
                  <th className="pr-3 pb-2 font-medium">Equipo</th>
                  <th className="pr-3 pb-2 text-right font-medium">Usos</th>
                  <th className="pr-3 pb-2 text-right font-medium">Horas</th>
                  <th className="pb-2 text-right font-medium">Gasto esperado</th>
                </tr>
              </thead>
              <tbody>
                {porEquipo.map((e) => (
                  <tr key={e.codigo} className="border-border/60 border-b last:border-0">
                    <td className="py-1.5 pr-3">
                      {e.nombre}{" "}
                      <span className="text-fg-subtle text-xs">{e.combustible === "acpm" ? "ACPM" : "gasolina"}</span>
                    </td>
                    <td className="tnum py-1.5 pr-3 text-right font-mono">{e.usos || "—"}</td>
                    <td className="tnum py-1.5 pr-3 text-right font-mono">{e.horas ? num(e.horas, 1) : "—"}</td>
                    <td className="tnum py-1.5 text-right font-mono">
                      {e.esperadoGal != null && e.horas ? `${num(e.esperadoGal, 1)} gal` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-fg-subtle text-xs">
              El consumo por hora de guadaña, motosierra y bombas sale de la nota de cada hoja (en
              litros) y está por confirmar con la finca. El del motor de riego lo midió la finca.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Compras de combustible ({compras.length})</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <ScrollFijo className="max-h-[28rem]">
            <table className="w-full text-sm">
              <thead className="bg-surface sticky top-0 z-10">
                <tr className="border-border text-fg-subtle border-b text-left text-[11px] tracking-wide uppercase">
                  <th className={th}>Fecha</th>
                  <th className={th}>Combustible</th>
                  <th className={th}>Recibo</th>
                  <th className={thR}>Galones</th>
                  <th className={thR}>$ / gal</th>
                  <th className={thR}>Valor</th>
                  <th className={th}>Para qué</th>
                  <th className={th}>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {[...compras]
                  .sort((a, b) => b.fecha.localeCompare(a.fecha))
                  .map((c) => (
                    <tr key={c.id} className="border-border/60 border-b align-top last:border-0">
                      <td className="tnum px-3 py-1.5 font-mono whitespace-nowrap">
                        {formatDate(c.fecha)}
                        {c.dudoso && (
                          <span title={c.motivoDuda ?? undefined}>
                            <AlertTriangle
                              className="text-warn ml-1 inline h-3.5 w-3.5"
                              aria-label={`Por revisar: ${c.motivoDuda}`}
                            />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">{c.combustible === "acpm" ? "ACPM" : "Gasolina"}</td>
                      <td className="tnum px-3 py-1.5 font-mono text-xs">{c.recibo ?? "—"}</td>
                      <td className={td}>{num(c.galones, 2)}</td>
                      <td className={td}>{c.precio ? formatCOP(c.precio) : "—"}</td>
                      <td className={td}>{c.valor != null ? formatCOP(c.valor) : "—"}</td>
                      <td className="px-3 py-1.5 text-xs">{c.destino ?? "—"}</td>
                      <td className="text-fg-muted max-w-[18rem] px-3 py-1.5 text-xs">{c.observaciones ?? ""}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </ScrollFijo>
        </CardBody>
      </Card>

      {dudosos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Por revisar en la planilla ({dudosos.length})</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            <p className="text-fg-muted text-xs">
              Lo que la carga no pudo leer con seguridad. Ya entró con la mejor lectura posible.
              «Fila» es la fila de la hoja en la planilla.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-fg-subtle border-b text-left text-[11px] tracking-wide uppercase">
                  <th className="pr-3 pb-2 font-medium">Fila</th>
                  <th className="pr-3 pb-2 font-medium">Fecha leída</th>
                  <th className="pr-3 pb-2 font-medium">Qué</th>
                  <th className="pb-2 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {dudosos.map((d, i) => (
                  <tr key={`${d.ref}-${i}`} className="border-border/60 border-b last:border-0">
                    <td className="tnum py-1.5 pr-3 font-mono text-xs">{d.ref ?? "—"}</td>
                    <td className="tnum py-1.5 pr-3 font-mono whitespace-nowrap">{formatDate(d.fecha)}</td>
                    <td className="py-1.5 pr-3">{d.que}</td>
                    <td className="text-warn py-1.5 text-xs">{d.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
