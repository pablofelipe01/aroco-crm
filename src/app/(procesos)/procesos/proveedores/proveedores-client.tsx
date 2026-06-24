"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, X, Plus, Users, Inbox } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ESTADO_TONE } from "@/lib/procesos/proveedor-opts";
import type { Departamento } from "@/lib/types/database";
import type { ProveedorLista } from "./page";
import { ProveedorForm } from "./proveedor-form";

export function ProveedoresClient({
  proveedores,
  departamentos,
  municipios,
  canWrite,
  canApprove,
  certOpts,
  selloOpts,
}: {
  proveedores: ProveedorLista[];
  departamentos: Departamento[];
  municipios: { departamento: string; nombre: string }[];
  canWrite: boolean;
  canApprove: boolean;
  certOpts: string[];
  selloOpts: string[];
}) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [depto, setDepto] = React.useState("");
  const [estado, setEstado] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);

  const filtrados = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return proveedores.filter((p) => {
      if (depto && p.departamento !== depto) return false;
      if (estado && p.estado !== estado) return false;
      if (
        s &&
        !`${p.nombre} ${p.codigo ?? ""} ${p.numero_documento ?? ""} ${p.asociacion ?? ""} ${p.municipio ?? ""}`
          .toLowerCase()
          .includes(s)
      )
        return false;
      return true;
    });
  }, [proveedores, q, depto, estado]);

  const habilitados = proveedores.filter((p) => p.estado === "Habilitado").length;
  const enEstudio = proveedores.filter((p) => p.estado === "En estudio").length;
  const hasFilters = q || depto || estado;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proveedores"
        description="Crea, busca y gestiona los proveedores de cacao."
        actions={
          <div className="flex items-center gap-2">
            {canApprove && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => router.push("/procesos/proveedores/aprobaciones")}
              >
                <Inbox className="h-4 w-4" />
                Aprobaciones
                {enEstudio > 0 && (
                  <Badge tone="warn" className="ml-1">{enEstudio}</Badge>
                )}
              </Button>
            )}
            {canWrite && (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" />
                Nuevo proveedor
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Proveedores" value={proveedores.length} icon={Users} />
        <StatCard label="Habilitados" value={habilitados} />
        <StatCard label="En estudio" value={enEstudio} />
        <StatCard label="Departamentos" value={departamentos.length} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, documento, asociación…"
            className="pl-9"
          />
        </div>
        <Select value={depto} onChange={(e) => setDepto(e.target.value)} className="w-auto">
          <option value="">Todo departamento</option>
          {departamentos.map((d) => (
            <option key={d.id} value={d.nombre}>
              {d.nombre}
            </option>
          ))}
        </Select>
        <Select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-auto">
          <option value="">Todo estado</option>
          {Object.keys(ESTADO_TONE).map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); setDepto(""); setEstado(""); }}>
            <X className="h-3.5 w-3.5" /> Limpiar
          </Button>
        )}
        <span className="ml-auto self-center text-xs text-fg-subtle">
          {filtrados.length} de {proveedores.length}
        </span>
      </div>

      {filtrados.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="Sin proveedores" />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 text-left font-medium">Proveedor</th>
                <th className="px-4 py-3 text-left font-medium">Documento</th>
                <th className="px-4 py-3 text-left font-medium">Ubicación</th>
                <th className="px-4 py-3 text-left font-medium">Asociación</th>
                <th className="px-4 py-3 text-left font-medium">Celular</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/procesos/proveedores/${p.id}`)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-fg">{p.nombre}</p>
                    <p className="text-xs text-fg-subtle">
                      {p.codigo ?? "—"}
                      {p.tipo_proveedor ? ` · ${p.tipo_proveedor}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-muted">
                    {p.numero_documento ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {[p.municipio, p.departamento].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{p.asociacion ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-muted">{p.celular ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={ESTADO_TONE[p.estado] ?? "neutral"}>{p.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProveedorForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        departamentos={departamentos}
        municipios={municipios}
        certOpts={certOpts}
        selloOpts={selloOpts}
        onSaved={(id) => {
          setFormOpen(false);
          router.push(`/procesos/proveedores/${id}`);
        }}
      />
    </div>
  );
}
