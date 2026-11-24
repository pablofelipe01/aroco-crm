"use client";

import * as React from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Clock,
  Pencil,
  RotateCcw,
  Smartphone,
  Sprout,
  Wheat,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { CatalogoCaptura } from "@/lib/finca/captura";
import { anularRegistro, marcarRevisado } from "./actions";
import { CorregirRegistro } from "./corregir-registro";
import {
  RiegoCombustible,
  type CompraTabla,
  type UsoTabla,
} from "./riego-combustible";
import type { EquipoVista as EquipoCombustible } from "@/lib/finca/combustible";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollFijo } from "@/components/ui/scroll-fijo";
import { cn, formatDate, formatNumber, formatPct } from "@/lib/utils";
import type {
  BacheVista,
  Categoria,
  EmpleadoVista,
  LaborVista,
  RegistroVista,
  ValvulaVista,
} from "./page";

/** Jornal de la finca: 7,5 h (el cliente, 2026-11-23). */
const HORAS_JORNAL = 7.5;
/** Filas que se pintan a la vez en «Registros»; el resto se pide con el filtro. */
const MAX_FILAS = 300;

const CATEGORIAS: Record<Categoria, string> = {
  cosecha: "Cosecha",
  poscosecha: "Poscosecha",
  cultivo: "Cultivo",
  riego: "Riego",
  sanidad: "Sanidad",
  mantenimiento: "Mantenimiento",
  administracion: "Administración",
  ausencia: "Ausencia",
};

const MESES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
const nombreMes = (m: string) =>
  `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

type Pestana =
  | "resumen"
  | "registros"
  | "poscosecha"
  | "riego"
  | "revisar"
  | "catalogos";

const num = (v: number | null, d = 0) => (v == null ? "—" : formatNumber(v, d));
const esDesgrane = (r: RegistroVista) => r.labor.startsWith("Desgrane");

interface Mes {
  mes: string;
  registros: number;
  jornales: number;
  ausencias: number;
  mazorcas: number;
  kgA: number;
  kgC: number;
  baba: number;
  seco: number;
}

export function LaboresFincaClient({
  registros,
  anulados,
  baches,
  labores,
  empleados,
  valvulas,
  combustible,
}: {
  combustible: {
    compras: CompraTabla[];
    usos: UsoTabla[];
    equipos: EquipoCombustible[];
  };
  registros: RegistroVista[];
  anulados: RegistroVista[];
  baches: BacheVista[];
  labores: LaborVista[];
  empleados: EmpleadoVista[];
  valvulas: ValvulaVista[];
}) {
  const [pestana, setPestana] = React.useState<Pestana>("resumen");
  const [editando, setEditando] = React.useState<RegistroVista | null>(null);
  // El formulario de corrección usa el mismo catálogo y las mismas
  // validaciones que el celular (src/lib/finca/captura.ts).
  const catalogo = React.useMemo<CatalogoCaptura>(
    () => ({
      yo: null,
      porOtros: true,
      empleados: empleados.map((e) => ({ id: e.id, nombre: e.nombre })),
      labores: labores.map((l) => ({
        id: l.id,
        nombre: l.nombre,
        categoria: l.categoria,
        unidad: l.unidad,
      })),
      valvulas: valvulas.map((v) => v.codigo),
      hoy: "",
    }),
    [empleados, labores, valvulas],
  );
  const dudososReg = registros.filter((r) => r.dudoso);
  const dudososBache = baches.filter((b) => b.dudoso);

  const meses = React.useMemo<Mes[]>(() => {
    const m = new Map<string, Mes>();
    const de = (mes: string) => {
      let x = m.get(mes);
      if (!x) {
        x = {
          mes,
          registros: 0,
          jornales: 0,
          ausencias: 0,
          mazorcas: 0,
          kgA: 0,
          kgC: 0,
          baba: 0,
          seco: 0,
        };
        m.set(mes, x);
      }
      return x;
    };
    for (const r of registros) {
      const x = de(r.fecha.slice(0, 7));
      x.registros++;
      const j = (r.horas ?? 0) / HORAS_JORNAL;
      if (r.categoria === "ausencia") x.ausencias += j;
      else x.jornales += j;
      if (r.labor === "Cosecha" && r.unidad === "mazorcas")
        x.mazorcas += r.cantidad ?? 0;
      if (esDesgrane(r)) {
        x.kgA += r.sanas ?? 0;
        x.kgC += r.negras ?? 0;
      }
    }
    for (const b of baches) {
      if (!b.fechaInicio) continue;
      const x = de(b.fechaInicio.slice(0, 7));
      x.baba += b.pesoBaba ?? 0;
      x.seco += b.pesoFinal ?? 0;
    }
    return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }, [registros, baches]);

  const tot = meses.reduce(
    (a, x) => ({
      jornales: a.jornales + x.jornales,
      mazorcas: a.mazorcas + x.mazorcas,
      baba: a.baba + x.baba,
      seco: a.seco + x.seco,
    }),
    { jornales: 0, mazorcas: 0, baba: 0, seco: 0 },
  );

  const pestanas: { clave: Pestana; label: string; cuenta?: number }[] = [
    { clave: "resumen", label: "Resumen" },
    { clave: "registros", label: "Registros", cuenta: registros.length },
    { clave: "poscosecha", label: "Poscosecha", cuenta: baches.length },
    { clave: "riego", label: "Riego y combustible" },
    {
      clave: "revisar",
      label: "Por revisar",
      cuenta: dudososReg.length + dudososBache.length,
    },
    { clave: "catalogos", label: "Catálogos" },
  ];

  const fechas = registros.map((r) => r.fecha).sort();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Labores Finca"
        description={
          registros.length
            ? `Reporte diario de la finca y lo registrado desde el celular, ${formatDate(fechas[0])} a ${formatDate(fechas.at(-1))}.`
            : "Registro diario de labores y poscosecha de la finca."
        }
      />

      <div
        className="flex flex-wrap gap-1"
        role="tablist"
        aria-label="Secciones de Labores Finca"
      >
        {pestanas.map((p) => (
          <button
            key={p.clave}
            role="tab"
            aria-selected={pestana === p.clave}
            onClick={() => setPestana(p.clave)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              pestana === p.clave
                ? "bg-accent text-accent-fg"
                : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
            )}
          >
            {p.label}
            {p.cuenta != null && (
              <span className="tnum ml-1 font-mono opacity-70">{p.cuenta}</span>
            )}
          </button>
        ))}
      </div>

      {pestana === "riego" ? (
        <RiegoCombustible
          compras={combustible.compras}
          usos={combustible.usos}
          equipos={combustible.equipos}
          valvulasOrden={valvulas.map((v) => v.codigo)}
        />
      ) : !registros.length && !baches.length ? (
        <EmptyState
          icon={<Sprout className="h-6 w-6" />}
          title="Aún no hay labores cargadas"
          description="La historia entra con scripts/cargar-finca.ts a partir del reporte diario de la finca."
        />
      ) : pestana === "resumen" ? (
        <Resumen
          meses={meses}
          tot={tot}
          dudosos={dudososReg.length + dudososBache.length}
        />
      ) : pestana === "registros" ? (
        <Registros
          registros={registros}
          anulados={anulados}
          empleados={empleados}
          labores={labores}
          onCorregir={setEditando}
        />
      ) : pestana === "poscosecha" ? (
        <Poscosecha baches={baches} />
      ) : pestana === "revisar" ? (
        <PorRevisar
          registros={dudososReg}
          baches={dudososBache}
          onCorregir={setEditando}
        />
      ) : (
        <Catalogos
          labores={labores}
          empleados={empleados}
          valvulas={valvulas}
        />
      )}

      <CorregirRegistro
        registro={editando}
        catalogo={catalogo}
        onClose={() => setEditando(null)}
      />
    </div>
  );
}

// ── Resumen ─────────────────────────────────────────────────────────────────

function Resumen({
  meses,
  tot,
  dudosos,
}: {
  meses: Mes[];
  tot: { jornales: number; mazorcas: number; baba: number; seco: number };
  dudosos: number;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Jornales trabajados"
          value={tot.jornales}
          decimals={0}
          icon={Clock}
          hint="7,5 h por jornal, sin ausencias"
        />
        <StatCard
          label="Mazorcas cosechadas"
          value={tot.mazorcas}
          icon={Wheat}
        />
        <StatCard
          label="Cacao en baba"
          value={tot.baba}
          suffix=" kg"
          icon={Sprout}
          hint="Suma de los baches"
        />
        <StatCard
          label="Rendimiento seco/baba"
          value={tot.baba ? (tot.seco / tot.baba) * 100 : 0}
          decimals={1}
          suffix=" %"
          icon={CalendarDays}
          hint={`${formatNumber(tot.seco, 0)} kg secos`}
        />
      </div>

      {dudosos > 0 && (
        <p className="text-fg-muted flex items-center gap-2 text-sm">
          <AlertTriangle className="text-warn h-4 w-4" />
          {dudosos} filas de la hoja quedaron por revisar (fechas corregidas,
          horas imposibles, válvulas ilegibles).
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Por mes</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-fg-subtle border-b text-left text-[11px] tracking-wide uppercase">
                <th className="pr-3 pb-2 font-medium">Mes</th>
                <th className="pr-3 pb-2 text-right font-medium">Registros</th>
                <th className="pr-3 pb-2 text-right font-medium">Jornales</th>
                <th className="pr-3 pb-2 text-right font-medium">Ausencias</th>
                <th className="pr-3 pb-2 text-right font-medium">Mazorcas</th>
                <th className="pr-3 pb-2 text-right font-medium">Desgrane A</th>
                <th className="pr-3 pb-2 text-right font-medium">Desgrane C</th>
                <th className="pr-3 pb-2 text-right font-medium">
                  Baba baches
                </th>
                <th className="pr-3 pb-2 text-right font-medium">Seco</th>
                <th className="pb-2 text-right font-medium">Rend.</th>
              </tr>
            </thead>
            <tbody className="tnum font-mono">
              {meses.map((m) => (
                <tr
                  key={m.mes}
                  className="border-border/60 border-b last:border-0"
                >
                  <td className="py-1.5 pr-3 font-sans">{nombreMes(m.mes)}</td>
                  <td className="py-1.5 pr-3 text-right">
                    {formatNumber(m.registros)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    {formatNumber(m.jornales, 1)}
                  </td>
                  <td className="text-fg-muted py-1.5 pr-3 text-right">
                    {formatNumber(m.ausencias, 1)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    {formatNumber(m.mazorcas)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    {formatNumber(m.kgA, 1)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    {formatNumber(m.kgC, 1)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    {formatNumber(m.baba, 1)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    {formatNumber(m.seco, 1)}
                  </td>
                  <td className="py-1.5 text-right">
                    {m.baba ? formatPct(m.seco / m.baba, 1) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-fg-subtle mt-3 text-xs">
            Desgrane en kg baba, por mes del registro; baba y seco de
            Poscosecha, por mes de inicio del bache. Mayo casi no está en el
            reporte diario: su desgrane viene del resumen «Cosecha Mayo», sin
            trabajador.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

// ── Registros ───────────────────────────────────────────────────────────────

function Registros({
  registros,
  anulados,
  empleados,
  labores,
  onCorregir,
}: {
  registros: RegistroVista[];
  anulados: RegistroVista[];
  empleados: EmpleadoVista[];
  labores: LaborVista[];
  onCorregir: (r: RegistroVista) => void;
}) {
  const [verAnulados, setVerAnulados] = React.useState(false);
  const meses = React.useMemo(
    () =>
      [...new Set(registros.map((r) => r.fecha.slice(0, 7)))].sort().reverse(),
    [registros],
  );
  const [mes, setMes] = React.useState("");
  const [empleado, setEmpleado] = React.useState("");
  const [labor, setLabor] = React.useState("");

  const base = verAnulados ? anulados : registros;
  const filtrados = base.filter(
    (r) =>
      (!mes || r.fecha.startsWith(mes)) &&
      (!empleado || r.empleado === empleado) &&
      (!labor || r.labor === labor),
  );
  const horas = filtrados.reduce(
    (s, r) => s + (r.categoria === "ausencia" ? 0 : (r.horas ?? 0)),
    0,
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Mes">
          <Select value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="">Todos</option>
            {meses.map((m) => (
              <option key={m} value={m}>
                {nombreMes(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Trabajador">
          <Select
            value={empleado}
            onChange={(e) => setEmpleado(e.target.value)}
          >
            <option value="">Todos</option>
            {empleados.map((e) => (
              <option key={e.id} value={e.nombre}>
                {e.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Labor">
          <Select value={labor} onChange={(e) => setLabor(e.target.value)}>
            <option value="">Todas</option>
            {labores
              .filter((l) => l.usos > 0)
              .map((l) => (
                <option key={l.id} value={l.nombre}>
                  {l.nombre}
                </option>
              ))}
          </Select>
        </Field>
      </div>

      <p className="text-fg-muted text-xs">
        <span className="tnum font-mono">{formatNumber(filtrados.length)}</span>{" "}
        registros ·{" "}
        <span className="tnum font-mono">
          {formatNumber(horas / HORAS_JORNAL, 1)}
        </span>{" "}
        jornales trabajados
        {filtrados.length > MAX_FILAS &&
          ` · se muestran los ${MAX_FILAS} más recientes; filtra para ver el resto`}
        {(anulados.length > 0 || verAnulados) && (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => setVerAnulados((x) => !x)}
              className="text-accent underline-offset-2 hover:underline"
            >
              {verAnulados ? "Volver a los vigentes" : `Ver anulados (${anulados.length})`}
            </button>
          </>
        )}
      </p>
      {verAnulados && (
        <p className="text-fg-muted text-xs">
          Anulados: no cuentan en ninguna suma. Restaurar los devuelve tal como
          estaban.
        </p>
      )}

      {!filtrados.length ? (
        <EmptyState title="Ningún registro con esos filtros" />
      ) : (
        <ScrollFijo className="border-border bg-surface rounded-[var(--radius-lg)] border">
          <table className="w-full text-sm">
            <thead className="bg-surface sticky top-0 z-10">
              <tr className="border-border text-fg-subtle border-b text-left text-[11px] tracking-wide uppercase">
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Trabajador</th>
                <th className="px-3 py-2 font-medium">Labor</th>
                <th className="px-3 py-2 font-medium">Válvulas</th>
                <th className="px-3 py-2 font-medium">Horario</th>
                <th className="px-3 py-2 text-right font-medium">Horas</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="px-3 py-2 font-medium">
                  {verAnulados ? "Motivo de anulación" : "Observaciones"}
                </th>
                <th className="px-3 py-2">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtrados.slice(0, MAX_FILAS).map((r) => (
                <tr
                  key={r.id}
                  className="border-border/60 border-b align-top last:border-0"
                >
                  <td className="tnum px-3 py-1.5 font-mono whitespace-nowrap">
                    {formatDate(r.fecha)}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {r.empleado ?? (
                      <span className="text-fg-subtle">Sin trabajador</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.labor}
                    {r.origen === "app" && (
                      <span title="Registrado desde el celular">
                        <Smartphone
                          className="text-fg-subtle ml-1 inline h-3.5 w-3.5"
                          aria-label="Desde el celular"
                        />
                      </span>
                    )}
                    {r.editado && (
                      <span title="Corregido en el CRM">
                        <Pencil
                          className="text-fg-subtle ml-1 inline h-3 w-3"
                          aria-label="Corregido en el CRM"
                        />
                      </span>
                    )}
                    {r.dudoso && (
                      <span title={r.motivoDuda ?? undefined}>
                        <AlertTriangle
                          className="text-warn ml-1 inline h-3.5 w-3.5"
                          aria-label={`Por revisar: ${r.motivoDuda}`}
                        />
                      </span>
                    )}
                  </td>
                  <td className="tnum px-3 py-1.5 font-mono text-xs">
                    {r.valvulas.join(", ") || r.sitio || "—"}
                  </td>
                  <td className="tnum px-3 py-1.5 font-mono text-xs whitespace-nowrap">
                    {r.horaInicio && r.horaFin
                      ? `${r.horaInicio}–${r.horaFin}`
                      : "—"}
                  </td>
                  <td className="tnum px-3 py-1.5 text-right font-mono">
                    {num(r.horas, 2)}
                  </td>
                  <td className="tnum px-3 py-1.5 text-right font-mono whitespace-nowrap">
                    {esDesgrane(r) && (r.sanas != null || r.negras != null)
                      ? `A ${num(r.sanas, 1)} · C ${num(r.negras, 1)} kg`
                      : r.cantidad != null
                        ? `${num(r.cantidad, r.unidad === "kg" ? 1 : 0)} ${r.unidad ?? ""}`
                        : "—"}
                  </td>
                  <td className="text-fg-muted max-w-[20rem] px-3 py-1.5 text-xs">
                    {verAnulados
                      ? (r.anulado?.motivo ?? "")
                      : (r.observaciones ?? "")}
                  </td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {verAnulados ? (
                      <Restaurar id={r.id} />
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onCorregir(r)}
                        aria-label={`Corregir registro de ${r.empleado ?? "sin trabajador"} del ${r.fecha}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollFijo>
      )}
    </div>
  );
}

// ── Poscosecha ──────────────────────────────────────────────────────────────

function Poscosecha({ baches }: { baches: BacheVista[] }) {
  if (!baches.length) return <EmptyState title="Sin baches" />;
  return (
    <ScrollFijo className="border-border bg-surface rounded-[var(--radius-lg)] border">
      <table className="w-full text-sm">
        <thead className="bg-surface sticky top-0 z-10">
          <tr className="border-border text-fg-subtle border-b text-left text-[11px] tracking-wide uppercase">
            <th className="px-3 py-2 font-medium">Bache</th>
            <th className="px-3 py-2 font-medium">Calidad</th>
            <th className="px-3 py-2 font-medium">Válvulas</th>
            <th className="px-3 py-2 font-medium">Inicio</th>
            <th className="px-3 py-2 text-right font-medium">Baba</th>
            <th className="px-3 py-2 text-right font-medium">Fermentado</th>
            <th className="px-3 py-2 text-right font-medium">Seco</th>
            <th className="px-3 py-2 text-right font-medium">Rend.</th>
            <th className="px-3 py-2 font-medium">Despacho</th>
            <th className="px-3 py-2 font-medium">Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {baches.map((b) => (
            <tr
              key={b.numero}
              className="border-border/60 border-b last:border-0"
            >
              <td className="tnum px-3 py-1.5 font-mono">
                #{b.numero}
                {b.dudoso && (
                  <span title={b.motivoDuda ?? undefined}>
                    <AlertTriangle
                      className="text-warn ml-1 inline h-3.5 w-3.5"
                      aria-label={`Por revisar: ${b.motivoDuda}`}
                    />
                  </span>
                )}
              </td>
              <td className="px-3 py-1.5">
                {b.calidad ? (
                  <Badge tone={b.calidad === "A" ? "success" : "neutral"}>
                    {b.calidad}
                  </Badge>
                ) : (
                  "—"
                )}
              </td>
              <td className="tnum px-3 py-1.5 font-mono text-xs">
                {b.valvulas ?? "—"}
              </td>
              <td className="tnum px-3 py-1.5 font-mono whitespace-nowrap">
                {formatDate(b.fechaInicio)}
              </td>
              <td className="tnum px-3 py-1.5 text-right font-mono">
                {num(b.pesoBaba, 2)}
              </td>
              <td className="tnum px-3 py-1.5 text-right font-mono">
                {num(b.pesoFermentado, 2)}
              </td>
              <td className="tnum px-3 py-1.5 text-right font-mono">
                {num(b.pesoFinal, 2)}
              </td>
              <td className="tnum px-3 py-1.5 text-right font-mono">
                {b.pesoBaba && b.pesoFinal
                  ? formatPct(b.pesoFinal / b.pesoBaba, 1)
                  : "—"}
              </td>
              <td className="tnum px-3 py-1.5 font-mono whitespace-nowrap">
                {formatDate(b.fechaDespacho)}
              </td>
              <td className="text-fg-muted px-3 py-1.5 text-xs">
                {b.observaciones ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollFijo>
  );
}

// ── Por revisar ─────────────────────────────────────────────────────────────

function PorRevisar({
  registros,
  baches,
  onCorregir,
}: {
  registros: RegistroVista[];
  baches: BacheVista[];
  onCorregir: (r: RegistroVista) => void;
}) {
  if (!registros.length && !baches.length) {
    return (
      <EmptyState
        title="Nada por revisar"
        description="Todas las filas de la hoja se leyeron sin dudas."
      />
    );
  }
  return (
    <div className="space-y-5">
      <p className="text-fg-muted text-sm">
        Lo que la carga no pudo leer con seguridad. Ya entró con la mejor
        lectura posible; hay que confirmarlo con la finca. «Fila» es el número
        de fila en el Excel. Si la lectura está bien, «Está bien» la saca de
        la lista; si no, corríjala.
      </p>
      {registros.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Reporte diario ({registros.length})</CardTitle>
          </CardHeader>
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-fg-subtle border-b text-left text-[11px] tracking-wide uppercase">
                  <th className="pr-3 pb-2 font-medium">Fila</th>
                  <th className="pr-3 pb-2 font-medium">Fecha leída</th>
                  <th className="pr-3 pb-2 font-medium">Trabajador</th>
                  <th className="pr-3 pb-2 font-medium">Labor</th>
                  <th className="pr-3 pb-2 font-medium">Motivo</th>
                  <th className="pb-2">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...registros]
                  .sort((a, b) => a.fecha.localeCompare(b.fecha))
                  .map((r) => (
                    <tr
                      key={r.id}
                      className="border-border/60 border-b last:border-0"
                    >
                      <td className="tnum py-1.5 pr-3 font-mono text-xs">
                        {r.refHoja?.replace(/^\w+:/, "") ?? "—"}
                      </td>
                      <td className="tnum py-1.5 pr-3 font-mono whitespace-nowrap">
                        {formatDate(r.fecha)}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {r.empleado ?? "—"}
                      </td>
                      <td className="py-1.5 pr-3">{r.labor}</td>
                      <td className="text-warn py-1.5 pr-3 text-xs">
                        {r.motivoDuda}
                      </td>
                      <td className="py-1 text-right whitespace-nowrap">
                        <EstaBien id={r.id} />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onCorregir(r)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Corregir
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
      {baches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Poscosecha ({baches.length})</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="space-y-1.5 text-sm">
              {baches.map((b) => (
                <li key={b.numero}>
                  <span className="tnum font-mono">#{b.numero}</span>{" "}
                  <span className="text-warn text-xs">{b.motivoDuda}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ── Catálogos ───────────────────────────────────────────────────────────────

function Catalogos({
  labores,
  empleados,
  valvulas,
}: {
  labores: LaborVista[];
  empleados: EmpleadoVista[];
  valvulas: ValvulaVista[];
}) {
  const porCategoria = Object.keys(CATEGORIAS).map((c) => ({
    categoria: c as Categoria,
    labores: labores.filter((l) => l.categoria === c),
  }));
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Trabajadores ({empleados.length})</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="divide-border/60 divide-y text-sm">
            {empleados.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between py-1.5"
              >
                <span>{e.nombre}</span>
                <span className="text-fg-muted tnum font-mono text-xs">
                  {formatNumber(e.registros)} registros · último{" "}
                  {formatDate(e.ultimo)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-fg-subtle mt-3 text-xs">
            Falta el valor del jornal por persona para calcular costos.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Válvulas ({valvulas.length})</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {valvulas.map((v) => (
              <span
                key={v.codigo}
                className="border-border rounded-[var(--radius-md)] border px-2.5 py-1 text-sm"
              >
                <span className="tnum font-mono">{v.codigo}</span>
                <span className="text-fg-subtle tnum ml-1.5 font-mono text-xs">
                  {v.registros}
                </span>
              </span>
            ))}
          </div>
          <p className="text-fg-subtle mt-3 text-xs">
            Lista oficial del cliente. «Quinta», «Vivero», «Lago» y similares no
            son válvulas: quedan como sitio del registro. Faltan hectáreas y
            árboles por válvula.
          </p>
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Labores ({labores.length})</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {porCategoria
            .filter((g) => g.labores.length)
            .map((g) => (
              <div key={g.categoria}>
                <h3 className="text-fg-subtle mb-1.5 text-xs font-medium tracking-wide uppercase">
                  {CATEGORIAS[g.categoria]}
                </h3>
                <ul className="space-y-1 text-sm">
                  {g.labores.map((l) => (
                    <li key={l.id} className="flex justify-between gap-2">
                      <span>
                        {l.nombre}
                        {l.unidad && (
                          <span className="text-fg-subtle ml-1 text-xs">
                            ({l.unidad})
                          </span>
                        )}
                      </span>
                      <span className="text-fg-muted tnum font-mono text-xs">
                        {l.usos}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </CardBody>
      </Card>
    </div>
  );
}

// ── Acciones de una fila ────────────────────────────────────────────────────

function EstaBien({ id }: { id: string }) {
  const { toast } = useToast();
  const [cargando, setCargando] = React.useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={cargando}
      onClick={async () => {
        setCargando(true);
        const r = await marcarRevisado(id);
        setCargando(false);
        if (!r.ok) toast({ tone: "error", title: "No se marcó", description: r.error });
      }}
    >
      <Check className="h-3.5 w-3.5" />
      Está bien
    </Button>
  );
}

function Restaurar({ id }: { id: string }) {
  const { toast } = useToast();
  const [cargando, setCargando] = React.useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={cargando}
      onClick={async () => {
        setCargando(true);
        const r = await anularRegistro(id, false, "");
        setCargando(false);
        if (!r.ok) toast({ tone: "error", title: "No se restauró", description: r.error });
        else toast({ tone: "success", title: "Restaurado" });
      }}
    >
      <RotateCcw className="h-3.5 w-3.5" />
      Restaurar
    </Button>
  );
}
