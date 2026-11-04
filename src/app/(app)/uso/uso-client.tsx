"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Activity, AlarmClock, CheckCheck, Info, ListChecks, Trophy, TrendingDown, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { staggerContainer } from "@/lib/motion";
import { useFormatos, useLocale, useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import {
  acciones,
  filaDeUso,
  modulosDelEquipo,
  ordenarFilas,
  rankingsTareas,
  semanasDelPeriodo,
  type EstadoUso,
  type FilaUso,
  type PersonaUso,
  type SemanaUso,
  type UsoCrm,
} from "@/lib/uso";

// Tareas cerradas y no días de acceso (reunión del 2026-11-04): entrar al CRM
// no dice si el trabajo avanza; cerrar tareas sí.
type Vista = "cerradas" | "actividad";

const TONO: Record<EstadoUso, BadgeTone> = {
  activo: "success",
  poco: "warn",
  inactivo: "neutral",
};

const valorDe = (vista: Vista, s: SemanaUso) => (vista === "cerradas" ? s.cerradas : acciones(s));

export function UsoClient({ datos }: { datos: UsoCrm }) {
  const t = useT();
  const f = useFormatos();
  const locale = useLocale();

  const lunes = React.useMemo(
    () => semanasDelPeriodo(datos.desde, datos.hoy),
    [datos.desde, datos.hoy],
  );
  const filas = React.useMemo(
    () => ordenarFilas(datos.personas.map((p) => filaDeUso(p, lunes))),
    [datos.personas, lunes],
  );
  const modulos = React.useMemo(() => modulosDelEquipo(datos.personas), [datos.personas]);

  const rankings = React.useMemo(() => rankingsTareas(datos.personas), [datos.personas]);

  const [vista, setVista] = React.useState<Vista>("cerradas");
  // Una sola escala para todas las filas: con la de cada persona, quien cierra
  // una tarea por semana salía con las barras tan llenas como quien cierra
  // diez (revisión del 2026-10-27).
  const escala = Math.max(
    0,
    ...filas.flatMap((x) => x.serie.slice(-8).map((s) => valorDe(vista, s))),
  );

  const activos = filas.filter((x) => x.estado === "activo").length;
  // Por responsable: una tarea compartida entre dos suma para los dos.
  const cerradas30 = filas.reduce((a, x) => a + x.persona.cerradas_30d, 0);
  const cerradasSemana = filas.reduce((a, x) => a + x.actual.cerradas, 0);
  const vencidas = filas.reduce((a, x) => a + x.persona.vencidas, 0);
  const sinFecha = filas.reduce((a, x) => a + x.persona.sin_fecha, 0);

  const etiquetaSemana = React.useCallback(
    (iso: string) =>
      new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", timeZone: "UTC" }).format(
        new Date(`${iso}T00:00:00Z`),
      ),
    [locale],
  );

  const serieEquipo = React.useMemo(
    () =>
      lunes.map((l, i) => ({
        semana: l,
        etiqueta: etiquetaSemana(l),
        valor: filas.reduce((a, x) => a + valorDe(vista, x.serie[i]), 0),
      })),
    [lunes, filas, vista, etiquetaSemana],
  );

  if (filas.length === 0) {
    return (
      <div>
        <PageHeader title={t.uso.titulo} description={t.uso.descripcion} />
        <EmptyState icon={<Activity className="h-6 w-6" />} title={t.uso.sinDatos} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t.uso.titulo} description={t.uso.descripcion} />

      <div className="flex gap-3 rounded-[var(--radius-md)] border border-border bg-info-soft/40 px-4 py-3 text-sm text-fg-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <div className="space-y-1">
          <p>
            {datos.medicion_desde
              ? t.uso.avisoMedicion.replace("{fecha}", f.fecha(datos.medicion_desde))
              : t.uso.avisoSinMedicion}
          </p>
          {datos.eventos_desde && (
            <p>{t.uso.avisoEventos.replace("{fecha}", f.fecha(datos.eventos_desde))}</p>
          )}
        </div>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label={t.uso.cerradas30Equipo}
          value={cerradas30}
          icon={CheckCheck}
          hint={t.uso.cerradasSemana.replace("{c}", f.numero(cerradasSemana))}
        />
        <StatCard
          label={t.uso.vencidasEquipo}
          value={vencidas}
          icon={AlarmClock}
          hint={t.uso.sinFechaHint.replace("{n}", f.numero(sinFecha))}
        />
        <StatCard
          label={t.uso.abiertasEquipo}
          value={filas.reduce((a, x) => a + x.persona.abiertas, 0)}
          icon={ListChecks}
        />
        <StatCard
          label={t.uso.activosSemana}
          value={activos}
          icon={Users}
          hint={t.uso.deActivos.replace("{n}", String(filas.length))}
        />
      </motion.div>

      {/* Los tres top 5 de la reunión del 2026-11-04. */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Ranking
          titulo={t.uso.topCerradas}
          nota={t.uso.topCerradasNota}
          icono={<Trophy className="h-4 w-4 text-success" />}
          personas={rankings.masCerradas}
          valor={(p) => p.cerradas_30d}
          tono="text-success"
        />
        <Ranking
          titulo={t.uso.topVencidas}
          nota={t.uso.topVencidasNota}
          icono={<AlarmClock className="h-4 w-4 text-danger" />}
          personas={rankings.masVencidas}
          valor={(p) => p.vencidas}
          tono="text-danger"
        />
        <Ranking
          titulo={t.uso.topMenosCerradas}
          nota={t.uso.topMenosCerradasNota}
          icono={<TrendingDown className="h-4 w-4 text-warn" />}
          personas={rankings.menosCerradas}
          valor={(p) => p.cerradas_30d}
          detalle={(p) => t.uso.abiertasN.replace("{n}", f.numero(p.abiertas))}
          tono="text-fg"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t.uso.porSemana}</CardTitle>
            <SelectorVista vista={vista} onChange={setVista} />
          </CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={serieEquipo} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="etiqueta"
                  tick={{ fontSize: 11, fill: "var(--color-fg-subtle)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--color-fg-subtle)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-bg-muted)", opacity: 0.4 }}
                  contentStyle={{
                    background: "var(--color-surface-raised)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10,
                    fontSize: 12,
                    color: "var(--color-fg)",
                  }}
                  labelFormatter={(_, p) => {
                    const semana = (p?.[0]?.payload as { semana?: string } | undefined)?.semana;
                    return semana ? t.uso.semanaDel.replace("{fecha}", f.fecha(semana)) : "";
                  }}
                  formatter={(v: unknown) => [
                    f.numero(Number(v)),
                    vista === "cerradas" ? t.uso.tareasCerradas : t.uso.acciones,
                  ]}
                />
                <Bar dataKey="valor" fill="var(--color-accent)" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t.uso.modulos}</CardTitle>
              <p className="mt-0.5 text-xs text-fg-subtle">{t.uso.modulosNota}</p>
            </div>
          </CardHeader>
          <CardBody>
            {modulos.length === 0 ? (
              <p className="text-sm text-fg-muted">{t.uso.modulosVacio}</p>
            ) : (
              <ul className="space-y-2.5">
                {modulos.slice(0, 8).map((m) => (
                  <li key={m.modulo}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="capitalize text-fg">{m.modulo}</span>
                      <span className="tnum font-mono text-xs text-fg-muted">
                        {f.numero(m.minutos)} {t.uso.minutos}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-muted">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${(m.minutos / modulos[0].minutos) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.uso.personas}</CardTitle>
          <SelectorVista vista={vista} onChange={setVista} />
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-fg-muted">
                <th scope="col" className="px-5 py-3">{t.uso.persona}</th>
                <th scope="col" className="px-3 py-3">{t.uso.ultimoUso}</th>
                <th scope="col" className="px-3 py-3 text-right" title={t.uso.diasNota}>
                  {t.uso.dias30}
                </th>
                <th scope="col" className="px-3 py-3 text-right">{t.uso.cerradas30}</th>
                <th scope="col" className="px-3 py-3 text-right">{t.uso.pendientes}</th>
                <th scope="col" className="px-3 py-3 text-right">{t.uso.vencidas}</th>
                <th scope="col" className="px-3 py-3 text-right">
                  {t.uso.comercial4}
                  <span className="block font-normal text-fg-subtle">{t.uso.comercialNota}</span>
                </th>
                <th scope="col" className="px-5 py-3">
                  {t.uso.ultimas8}
                  <span className="block font-normal text-fg-subtle">
                    {vista === "cerradas" ? t.uso.ultimas8Cerradas : t.uso.ultimas8Acciones}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((x) => (
                <FilaPersona key={x.persona.id} fila={x} vista={vista} escala={escala} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SelectorVista({ vista, onChange }: { vista: Vista; onChange: (v: Vista) => void }) {
  const t = useT();
  return (
    <div
      role="radiogroup"
      className="inline-flex rounded-[var(--radius-md)] border border-border bg-bg-muted p-0.5 text-xs"
    >
      {(["cerradas", "actividad"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={vista === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-[var(--radius-sm)] px-2.5 py-1 font-medium transition-colors",
            vista === v ? "bg-surface text-fg shadow-[var(--shadow-soft-sm)]" : "text-fg-muted hover:text-fg",
          )}
        >
          {v === "cerradas" ? t.uso.cerradasVista : t.uso.actividad}
        </button>
      ))}
    </div>
  );
}

function FilaPersona({ fila, vista, escala }: { fila: FilaUso; vista: Vista; escala: number }) {
  const t = useT();
  const f = useFormatos();
  const p = fila.persona;
  const estado = {
    activo: t.uso.estadoActivo,
    poco: t.uso.estadoPoco,
    inactivo: t.uso.estadoInactivo,
  }[fila.estado];

  const ultimas = fila.serie.slice(-8);
  const num = (v: number, d = 0) => (v === 0 ? "—" : f.numero(v, d));

  return (
    <tr className="border-b border-border last:border-0 hover:bg-bg-muted/40">
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-fg">{p.nombre}</span>
          <Badge tone={TONO[fila.estado]} dot>
            {estado}
          </Badge>
        </div>
        <p className="text-xs text-fg-subtle">{p.area ?? "—"}</p>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        {fila.ultimo.cuando ? (
          <span className="tnum font-mono text-xs text-fg-muted">
            {f.fecha(fila.ultimo.cuando)}
            {fila.ultimo.soloLogin && (
              <span className="ml-1 text-fg-subtle">({t.uso.soloLogin})</span>
            )}
          </span>
        ) : (
          <span className="text-xs text-fg-subtle">{t.uso.nunca}</span>
        )}
      </td>
      <td className="tnum px-3 py-3 text-right font-mono">{num(p.dias_30d)}</td>
      {p.tiene_tareas ? (
        <>
          <td className="tnum px-3 py-3 text-right font-mono">{num(p.cerradas_30d)}</td>
          <td className="tnum px-3 py-3 text-right font-mono">{num(p.abiertas)}</td>
          <td
            className={cn(
              "tnum px-3 py-3 text-right font-mono",
              p.vencidas > 0 && "font-semibold text-danger",
            )}
          >
            {num(p.vencidas)}
          </td>
        </>
      ) : (
        <td colSpan={3} className="px-3 py-3 text-right text-xs text-fg-subtle">
          {t.uso.sinTareas}
        </td>
      )}
      <td className="tnum px-3 py-3 text-right font-mono">{num(fila.comercial4)}</td>
      <td className="px-5 py-3">
        <div
          className="flex h-6 items-end gap-0.5"
          aria-label={ultimas
            .map((s) => `${f.fecha(s.semana)}: ${f.numero(valorDe(vista, s), 0)}`)
            .join(", ")}
          role="img"
        >
          {ultimas.map((s) => {
            const v = valorDe(vista, s);
            return (
              <div
                key={s.semana}
                title={`${f.fecha(s.semana)} · ${f.numero(v, 0)}`}
                className={cn("w-2 rounded-sm", v > 0 ? "bg-accent" : "bg-bg-muted")}
                style={{ height: escala > 0 && v > 0 ? `${Math.max(15, (v / escala) * 100)}%` : "15%" }}
              />
            );
          })}
        </div>
      </td>
    </tr>
  );
}

function Ranking({
  titulo,
  nota,
  icono,
  personas,
  valor,
  detalle,
  tono,
}: {
  titulo: string;
  nota: string;
  icono: React.ReactNode;
  personas: PersonaUso[];
  valor: (p: PersonaUso) => number;
  detalle?: (p: PersonaUso) => string;
  tono: string;
}) {
  const t = useT();
  const f = useFormatos();
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              {icono} {titulo}
            </span>
          </CardTitle>
          <p className="mt-0.5 text-xs text-fg-subtle">{nota}</p>
        </div>
      </CardHeader>
      <CardBody>
        {personas.length === 0 ? (
          <p className="text-sm text-fg-muted">{t.uso.rankingVacio}</p>
        ) : (
          <ol className="space-y-2">
            {personas.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3 text-sm">
                <span className="w-4 shrink-0 text-right font-mono text-xs tnum text-fg-subtle">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-fg">{p.nombre}</span>
                  <span className="block truncate text-xs text-fg-subtle">
                    {p.area ?? "—"}
                    {detalle ? ` · ${detalle(p)}` : ""}
                  </span>
                </span>
                <span className={cn("shrink-0 font-mono text-base font-semibold tnum", tono)}>
                  {f.numero(valor(p))}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
