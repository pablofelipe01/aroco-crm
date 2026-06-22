"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Cog,
  Flag,
  GitBranch,
  Clock,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDate, cn } from "@/lib/utils";
import {
  ESTADO_CASO_META,
  ESTADO_PASO_META,
  ESTADO_PASO_ORDEN,
  TIPO_CASO_LABEL,
} from "@/lib/procesos/status";
import type {
  CasoDetalle as Caso,
  DecisionInstancia,
  EstadoPaso,
  PasoInstancia,
  Persona,
} from "@/lib/procesos/types";
import { actualizarPaso, elegirDecision } from "../actions";

type Evento = {
  id: string;
  descripcion: string;
  paso_numero: string | null;
  created_at: string;
};

export function CasoDetalle({
  caso,
  personas,
  eventos,
}: {
  caso: Caso;
  personas: Persona[];
  eventos: Evento[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const personaById = React.useMemo(
    () => new Map(personas.map((p) => [p.id, p])),
    [personas],
  );

  // Fases que aplican, en orden, derivadas de los pasos.
  const fases = React.useMemo(() => {
    const map = new Map<number, { nombre: string; pasos: PasoInstancia[] }>();
    for (const p of caso.pasos) {
      const f = map.get(p.faseNumero) ?? { nombre: p.faseNombre, pasos: [] };
      f.pasos.push(p);
      map.set(p.faseNumero, f);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [caso.pasos]);

  const decisionesPorFase = React.useMemo(() => {
    const m = new Map<number, DecisionInstancia[]>();
    for (const d of caso.decisiones) {
      const arr = m.get(d.faseNumero) ?? [];
      arr.push(d);
      m.set(d.faseNumero, arr);
    }
    return m;
  }, [caso.decisiones]);

  async function setPaso(
    pasoId: string,
    patch: Parameters<typeof actualizarPaso>[1],
  ) {
    const res = await actualizarPaso(pasoId, patch);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    router.refresh();
  }

  async function decidir(decisionId: string, opcionId: string) {
    const res = await elegirDecision(decisionId, opcionId);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo aplicar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Decisión aplicada" });
    router.refresh();
  }

  const fase1Completa = caso.pasos
    .filter((p) => p.faseNumero === 1 && p.estado !== "no_aplica")
    .every((p) => p.estado === "completado");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/procesos" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Procesos
      </Link>

      {/* Cabecera */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-soft-sm)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-fg">{caso.titulo}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
              <Badge tone="neutral">{TIPO_CASO_LABEL[caso.tipo]}</Badge>
              {caso.origen && <span>{caso.origen}</span>}
              <span>· Creado {formatDate(caso.creadoEl)}</span>
            </p>
          </div>
          <Badge tone={ESTADO_CASO_META[caso.estado].tone}>
            {ESTADO_CASO_META[caso.estado].label}
          </Badge>
        </div>

        {/* Stepper de fases */}
        <div className="mt-4 flex items-center gap-2">
          {fases.map(([num], i) => {
            const completa = fases
              .find((f) => f[0] === num)![1]
              .pasos.filter((p) => p.estado !== "no_aplica")
              .every((p) => p.estado === "completado");
            const actual = num === caso.faseActual;
            return (
              <React.Fragment key={num}>
                {i > 0 && <div className="h-px flex-1 bg-border" />}
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    completa
                      ? "bg-success text-white"
                      : actual
                        ? "bg-accent text-accent-fg"
                        : "bg-bg-subtle text-fg-subtle",
                  )}
                >
                  {num}
                </span>
              </React.Fragment>
            );
          })}
          <span className="ml-2 shrink-0 font-mono text-sm tnum text-fg-muted">
            {caso.avance}%
          </span>
        </div>
      </div>

      {/* Fases */}
      {fases.map(([num, fase]) => (
        <FaseSeccion
          key={num}
          numero={num}
          nombre={fase.nombre}
          pasos={fase.pasos}
          decisiones={decisionesPorFase.get(num) ?? []}
          personas={personas}
          personaById={personaById}
          onPaso={setPaso}
          onDecidir={decidir}
          esHitoFase={num === 1 && caso.tipo === "proveedor"}
          hitoAlcanzado={fase1Completa}
        />
      ))}

      {/* Timeline */}
      <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
          <Clock className="h-3.5 w-3.5" /> Movimientos
        </h3>
        {eventos.length === 0 ? (
          <p className="text-sm text-fg-subtle">Sin movimientos aún.</p>
        ) : (
          <ul className="space-y-2">
            {eventos.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <div>
                  <p className="text-fg">{e.descripcion}</p>
                  <p className="font-mono text-[11px] text-fg-subtle">{formatDate(e.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FaseSeccion({
  numero,
  nombre,
  pasos,
  decisiones,
  personas,
  personaById,
  onPaso,
  onDecidir,
  esHitoFase,
  hitoAlcanzado,
}: {
  numero: number;
  nombre: string;
  pasos: PasoInstancia[];
  decisiones: DecisionInstancia[];
  personas: Persona[];
  personaById: Map<string, Persona>;
  onPaso: (id: string, patch: Parameters<typeof actualizarPaso>[1]) => void;
  onDecidir: (decisionId: string, opcionId: string) => void;
  esHitoFase: boolean;
  hitoAlcanzado: boolean;
}) {
  const [open, setOpen] = React.useState(true);
  const aplicables = pasos.filter((p) => p.estado !== "no_aplica");
  const completados = aplicables.filter((p) => p.estado === "completado").length;
  const pct = aplicables.length ? Math.round((completados / aplicables.length) * 100) : 0;
  const roles = [...new Set(pasos.map((p) => p.rol))].slice(0, 3);

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-soft-sm)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-sm font-semibold text-fg-muted">
          {numero}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-fg">{nombre}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-bg-subtle">
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-mono text-xs tnum text-fg-subtle">
              {completados}/{aplicables.length}
            </span>
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-2 border-t border-border p-4">
          {roles.length > 0 && (
            <p className="mb-1 text-[11px] text-fg-subtle">Responsables: {roles.join(" · ")}</p>
          )}

          {pasos.map((p) => (
            <PasoFila key={p.id} paso={p} personas={personas} personaById={personaById} onPaso={onPaso} />
          ))}

          {decisiones.map((d) => (
            <DecisionCard key={d.id} decision={d} onDecidir={onDecidir} />
          ))}

          {esHitoFase && (
            <div
              className={cn(
                "mt-2 flex items-center gap-3 rounded-[var(--radius-md)] border p-4",
                hitoAlcanzado
                  ? "border-success/50 bg-success-soft/30"
                  : "border-dashed border-border bg-bg-subtle/40",
              )}
            >
              <Flag className={cn("h-5 w-5 shrink-0", hitoAlcanzado ? "text-success" : "text-fg-subtle")} />
              <div>
                <p className="text-sm font-medium text-fg">
                  Hito: Proveedor Oficialmente Creado y Habilitado
                </p>
                <p className="text-xs text-fg-subtle">
                  {hitoAlcanzado
                    ? "Alcanzado — habilitado para recibir Órdenes de Compra."
                    : "Se desbloquea al completar la Fase 1."}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PasoFila({
  paso,
  personas,
  personaById,
  onPaso,
}: {
  paso: PasoInstancia;
  personas: Persona[];
  personaById: Map<string, Persona>;
  onPaso: (id: string, patch: Parameters<typeof actualizarPaso>[1]) => void;
}) {
  const [expand, setExpand] = React.useState(false);
  const meta = ESTADO_PASO_META[paso.estado];
  const atenuado = paso.estado === "no_aplica";
  const persona = paso.asignadoA ? personaById.get(paso.asignadoA) : undefined;
  const porAsignar = !persona && !paso.esAutomatico && paso.estado !== "no_aplica";

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-border p-3",
        atenuado && "opacity-50",
        paso.estado === "en_curso" && "border-warn/40 bg-warn-soft/10",
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", meta.bar)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg">
            <span className="font-mono text-fg-subtle">{paso.numero}.</span> {paso.titulo}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-fg-subtle">{paso.rol}</span>
            {paso.esAutomatico && (
              <Badge tone="info">
                <Cog className="h-3 w-3" /> Automático
              </Badge>
            )}
            {persona && (
              <span className="flex items-center gap-1 text-fg-muted">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full font-mono text-[9px] text-white"
                  style={{ backgroundColor: persona.color }}
                >
                  {persona.iniciales}
                </span>
                {persona.nombre.split(" ")[0]}
              </span>
            )}
            {porAsignar && <Badge tone="warn">Por asignar</Badge>}
          </div>
        </div>
        <Select
          value={paso.estado}
          onChange={(e) => onPaso(paso.id, { estado: e.target.value as EstadoPaso })}
          className="w-32 shrink-0"
        >
          {ESTADO_PASO_ORDEN.map((s) => (
            <option key={s} value={s}>
              {ESTADO_PASO_META[s].label}
            </option>
          ))}
        </Select>
        <button
          onClick={() => setExpand((v) => !v)}
          className="shrink-0 rounded p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
          aria-label="Detalles del paso"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", expand && "rotate-180")} />
        </button>
      </div>

      {expand && (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="mb-1 block text-fg-subtle">Responsable</span>
            <Select
              value={paso.asignadoA ?? ""}
              onChange={(e) => onPaso(paso.id, { asignadoA: e.target.value || null })}
            >
              <option value="">— Sin asignar —</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-fg-subtle">Fecha límite</span>
            <Input
              type="date"
              defaultValue={paso.fechaLimite ?? ""}
              onBlur={(e) => {
                const v = e.target.value || null;
                if (v !== paso.fechaLimite) onPaso(paso.id, { fechaLimite: v });
              }}
            />
          </label>
          <label className="text-xs sm:col-span-2">
            <span className="mb-1 block text-fg-subtle">Nota</span>
            <Textarea
              rows={2}
              defaultValue={paso.notas ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== paso.notas) onPaso(paso.id, { notas: v });
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function DecisionCard({
  decision,
  onDecidir,
}: {
  decision: DecisionInstancia;
  onDecidir: (decisionId: string, opcionId: string) => void;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-amber-400/50 bg-amber-50/40 p-4 dark:bg-amber-500/5">
      <p className="flex items-start gap-1.5 text-sm font-medium text-fg">
        <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        {decision.pregunta}
      </p>
      <p className="mt-0.5 pl-5 text-xs text-fg-subtle">Decide: {decision.rol}</p>
      <div className="mt-3 flex flex-wrap gap-2 pl-5">
        {decision.opciones.map((o) => {
          const elegida = decision.elegida === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onDecidir(decision.id, o.id)}
              className={cn(
                "rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm font-medium transition-colors",
                elegida
                  ? "border-amber-500 bg-amber-400 text-amber-950"
                  : "border-border text-fg-muted hover:border-amber-400/60 hover:text-fg",
              )}
            >
              {o.etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}
