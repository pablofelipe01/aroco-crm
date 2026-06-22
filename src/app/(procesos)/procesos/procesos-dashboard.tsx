"use client";

import * as React from "react";
import Link from "next/link";
import { Workflow, Boxes, AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, cn } from "@/lib/utils";
import { ESTADO_CASO_META, TIPO_CASO_LABEL } from "@/lib/procesos/status";
import type { CasoResumen, Persona } from "@/lib/procesos/types";
import { NuevoCaso } from "./nuevo-caso";

function Avatar({ persona }: { persona?: Persona }) {
  if (!persona) return <span className="text-xs text-fg-subtle">— por asignar</span>;
  return (
    <span className="flex items-center gap-1.5 text-xs text-fg-muted">
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full font-mono text-[10px] text-white"
        style={{ backgroundColor: persona.color }}
      >
        {persona.iniciales}
      </span>
      {persona.nombre.split(" ")[0]}
    </span>
  );
}

export function ProcesosDashboard({
  casos,
  personas,
}: {
  casos: CasoResumen[];
  personas: Persona[];
}) {
  const [tipo, setTipo] = React.useState("");
  const [estado, setEstado] = React.useState("");
  const personaById = React.useMemo(
    () => new Map(personas.map((p) => [p.id, p])),
    [personas],
  );

  const filtrados = casos.filter(
    (c) => (!tipo || c.tipo === tipo) && (!estado || c.estado === estado),
  );

  const kpis = {
    enCurso: casos.filter((c) => c.estado === "en_curso").length,
    bloqueados: casos.filter((c) => c.estado === "bloqueado").length,
    completados: casos.filter((c) => c.estado === "completado").length,
    proveedores: casos.filter((c) => c.tipo === "proveedor").length,
    ocs: casos.filter((c) => c.tipo === "orden_compra").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Procesos"
        description="Seguimiento de procesos por fases — Flujo de Proveedores de Cacao."
        actions={<NuevoCaso />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="En curso" value={kpis.enCurso} icon={Workflow} />
        <StatCard label="Bloqueados" value={kpis.bloqueados} icon={AlertTriangle} />
        <StatCard label="Completados" value={kpis.completados} icon={CheckCircle2} />
        <StatCard label="Proveedores" value={kpis.proveedores} icon={Users} />
        <StatCard label="Órdenes de Compra" value={kpis.ocs} icon={Boxes} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-auto">
          <option value="">Todo tipo</option>
          <option value="proveedor">Proveedor</option>
          <option value="orden_compra">Orden de Compra</option>
        </Select>
        <Select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-auto">
          <option value="">Todo estado</option>
          <option value="en_curso">En curso</option>
          <option value="bloqueado">Bloqueado</option>
          <option value="completado">Completado</option>
        </Select>
        <span className="ml-auto text-xs text-fg-subtle">
          {filtrados.length} de {casos.length}
        </span>
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          icon={<Workflow className="h-6 w-6" />}
          title={casos.length === 0 ? "Sin procesos aún" : "Sin resultados"}
          description={casos.length === 0 ? "Crea el primer caso con “Nuevo proceso”." : undefined}
        />
      ) : (
        <ul className="space-y-2">
          {filtrados.map((c) => (
            <li key={c.id}>
              <Link
                href={`/procesos/${c.id}`}
                className="block rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-soft-sm)] transition-all hover:border-accent/40 hover:shadow-[var(--shadow-soft-md)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">{c.titulo}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
                      <Badge tone="neutral">{TIPO_CASO_LABEL[c.tipo]}</Badge>
                      {c.origen && <span>{c.origen}</span>}
                      <span>· Fase {c.faseActual}</span>
                      <span>· {formatDate(c.actualizadoEl)}</span>
                    </p>
                  </div>
                  <Badge tone={ESTADO_CASO_META[c.estado].tone}>
                    {ESTADO_CASO_META[c.estado].label}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-subtle">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        c.estado === "bloqueado" ? "bg-danger" : "bg-accent",
                      )}
                      style={{ width: `${c.avance}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-xs tnum text-fg-muted">
                    {c.avance}%
                  </span>
                  <span className="w-28 shrink-0 text-right">
                    <Avatar persona={c.responsableActual ? personaById.get(c.responsableActual) : undefined} />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
