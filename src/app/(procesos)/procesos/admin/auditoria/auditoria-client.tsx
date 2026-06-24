"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  X,
  ScrollText,
  Sprout,
  FileText,
  Files,
  Tags,
  ShoppingCart,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { AuditLog } from "@/lib/types/database";

const ENTIDADES: Record<string, { label: string; icon: React.ElementType }> = {
  proveedor: { label: "Proveedor", icon: Sprout },
  orden: { label: "Orden de compra", icon: ShoppingCart },
  contrato: { label: "Contrato", icon: FileText },
  documento: { label: "Documento", icon: Files },
  catalogo: { label: "Catálogo", icon: Tags },
};

const ACCION_TONE: Record<string, "neutral" | "success" | "warn" | "danger" | "info"> = {
  crear: "success",
  actualizar: "info",
  estado: "warn",
  eliminar: "danger",
  documento_subir: "info",
  documento_eliminar: "danger",
  novedad: "neutral",
  aprobar: "success",
  rechazar: "danger",
  enviar_revision: "warn",
  emitir: "info",
};

const ACCION_LABEL: Record<string, string> = {
  crear: "Creación",
  actualizar: "Actualización",
  estado: "Cambio de estado",
  eliminar: "Eliminación",
  documento_subir: "Documento subido",
  documento_eliminar: "Documento eliminado",
  novedad: "Novedad",
  aprobar: "Aprobación",
  rechazar: "Rechazo",
  enviar_revision: "Envío a revisión",
  emitir: "Emisión",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

export function AuditoriaClient({ entradas }: { entradas: AuditLog[] }) {
  const [q, setQ] = React.useState("");
  const [entidad, setEntidad] = React.useState("");
  const [accion, setAccion] = React.useState("");

  const acciones = React.useMemo(
    () => Array.from(new Set(entradas.map((e) => e.accion))).sort(),
    [entradas],
  );

  const filtradas = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return entradas.filter((e) => {
      if (entidad && e.entidad !== entidad) return false;
      if (accion && e.accion !== accion) return false;
      if (
        s &&
        !`${e.descripcion} ${e.usuario_nombre ?? ""} ${e.entidad}`.toLowerCase().includes(s)
      )
        return false;
      return true;
    });
  }, [entradas, q, entidad, accion]);

  const hasFilters = q || entidad || accion;

  return (
    <div className="space-y-6">
      <Link
        href="/procesos/proveedores"
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> Proveedores
      </Link>

      <PageHeader
        title="Log de auditoría"
        description="Registro de las acciones de escritura del módulo. Solo administradores."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Descripción o usuario…"
            className="pl-9"
          />
        </div>
        <Select value={entidad} onChange={(e) => setEntidad(e.target.value)} className="w-auto">
          <option value="">Toda entidad</option>
          {Object.entries(ENTIDADES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
        <Select value={accion} onChange={(e) => setAccion(e.target.value)} className="w-auto">
          <option value="">Toda acción</option>
          {acciones.map((a) => (
            <option key={a} value={a}>
              {ACCION_LABEL[a] ?? a}
            </option>
          ))}
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              setEntidad("");
              setAccion("");
            }}
          >
            <X className="h-3.5 w-3.5" /> Limpiar
          </Button>
        )}
        <span className="ml-auto self-center text-xs text-fg-subtle">
          {filtradas.length} de {entradas.length}
        </span>
      </div>

      {filtradas.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-6 w-6" />}
          title="Sin registros"
          description={hasFilters ? "Ningún evento coincide con el filtro." : "Aún no hay actividad registrada."}
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 text-left font-medium">Fecha</th>
                <th className="px-4 py-3 text-left font-medium">Entidad</th>
                <th className="px-4 py-3 text-left font-medium">Acción</th>
                <th className="px-4 py-3 text-left font-medium">Detalle</th>
                <th className="px-4 py-3 text-left font-medium">Usuario</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((e) => {
                const ent = ENTIDADES[e.entidad];
                const Icon = ent?.icon ?? ScrollText;
                return (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-bg-subtle/50">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-fg-muted">
                      {fmt(e.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-fg-muted">
                        <Icon className="h-3.5 w-3.5" />
                        {ent?.label ?? e.entidad}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={ACCION_TONE[e.accion] ?? "neutral"}>
                        {ACCION_LABEL[e.accion] ?? e.accion}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-fg">
                      {e.entidad_id &&
                      (e.entidad === "proveedor" ||
                        e.entidad === "contrato" ||
                        e.entidad === "documento") ? (
                        <Link
                          href={`/procesos/proveedores/${e.entidad_id}`}
                          className="hover:text-accent"
                        >
                          {e.descripcion}
                        </Link>
                      ) : e.entidad === "orden" && e.entidad_id ? (
                        <Link href={`/procesos/ordenes/${e.entidad_id}`} className="hover:text-accent">
                          {e.descripcion}
                        </Link>
                      ) : (
                        e.descripcion
                      )}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{e.usuario_nombre ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
