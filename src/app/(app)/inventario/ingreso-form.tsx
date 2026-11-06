"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { BODEGAS, NOMBRE_BODEGA, NOMBRE_TIPO, bodegaPorOrigen } from "@/lib/inventory/bodegas";
import {
  CLASES_CRM,
  NOMBRE_CLASE_CRM,
  TIPO_DE_CLASE,
  colIn,
  ingresoSchema,
  type ClaseCrm,
} from "@/lib/inventory/carga";
import { formatNumber } from "@/lib/utils";
import type { InventoryLot } from "@/lib/types/database";
import { crearIngreso, editarIngreso } from "./carga-actions";

export type ProveedorOpcion = {
  id: string;
  nombre: string;
  departamento: string | null;
  municipio: string | null;
};

type Estado = {
  entry_date: string;
  bodega: string;
  proveedor_id: string;
  proveedor: string;
  departamento: string;
  municipio: string;
  remision: string;
  odc: string;
  recepcion: string;
  responsable: string;
  kilos: Record<ClaseCrm, string>;
  bultos_in: string;
  purchase_price_cop_kg: string;
  bonificacion_cop_kg: string;
  cadmio: string;
  pct_humedad: string;
  pct_fermentacion_total: string;
  notes: string;
};

const hoy = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

function inicial(l: InventoryLot | null): Estado {
  const t = (v: unknown) => (v == null ? "" : String(v));
  const base = l?.purchase_price_cop_kg != null ? l.purchase_price_cop_kg - (l.bonificacion_cop_kg ?? 0) : null;
  return {
    entry_date: l?.entry_date ?? hoy(),
    // Vacía = automática; solo se precarga si alguien la eligió a mano.
    bodega: l?.bodega_por ? (l.bodega ?? "") : "",
    proveedor_id: l?.proveedor_id ?? "",
    proveedor: l?.proveedor ?? "",
    departamento: l?.departamento ?? "",
    municipio: l?.municipio ?? "",
    remision: t(l?.remision),
    odc: t(l?.odc),
    recepcion: t(l?.recepcion),
    responsable: t(l?.responsable),
    kilos: Object.fromEntries(
      CLASES_CRM.map((c) => {
        const v = l ? Number((l as Record<string, unknown>)[colIn(c)]) || 0 : 0;
        return [c, v ? String(v) : ""];
      }),
    ) as Record<ClaseCrm, string>,
    bultos_in: l?.bultos_in ? String(l.bultos_in) : "",
    purchase_price_cop_kg: t(base),
    bonificacion_cop_kg: t(l?.bonificacion_cop_kg),
    cadmio: l?.cadmio ?? "",
    pct_humedad: t(l?.pct_humedad),
    pct_fermentacion_total: t(l?.pct_fermentacion_total),
    notes: t(l?.notes),
  };
}

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

/**
 * Registrar (o corregir) un ingreso a bodega. Los kilos van por clase, como
 * en el archivo; el disponible lo calcula la base.
 */
export function IngresoForm({
  open,
  onClose,
  lote,
  proveedores,
  onGuardado,
}: {
  open: boolean;
  onClose: () => void;
  /** Lote a corregir; null para uno nuevo. */
  lote: InventoryLot | null;
  proveedores: ProveedorOpcion[];
  onGuardado: () => void;
}) {
  const { toast } = useToast();
  const [v, setV] = React.useState<Estado>(() => inicial(lote));
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  // Al abrir, se parte de los datos del lote (o en blanco).
  const [abierto, setAbierto] = React.useState(false);
  if (open !== abierto) {
    setAbierto(open);
    if (open) {
      setV(inicial(lote));
      setError(null);
    }
  }

  const set = <K extends keyof Estado>(k: K, val: Estado[K]) => setV((s) => ({ ...s, [k]: val }));
  const total = CLASES_CRM.reduce((t, c) => t + (num(v.kilos[c]) ?? 0), 0);

  function elegirProveedor(id: string) {
    const p = proveedores.find((x) => x.id === id);
    setV((s) => ({
      ...s,
      proveedor_id: id,
      proveedor: p?.nombre ?? s.proveedor,
      departamento: p?.departamento ?? s.departamento,
      municipio: p?.municipio ?? s.municipio,
    }));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const datos = {
      entry_date: v.entry_date,
      bodega: v.bodega || null,
      proveedor_id: v.proveedor_id || null,
      proveedor: v.proveedor,
      departamento: v.departamento,
      municipio: v.municipio,
      remision: v.remision,
      odc: v.odc,
      recepcion: v.recepcion,
      responsable: v.responsable,
      kilos: Object.fromEntries(CLASES_CRM.map((c) => [c, num(v.kilos[c]) ?? 0])),
      bultos_in: num(v.bultos_in) ?? 0,
      purchase_price_cop_kg: num(v.purchase_price_cop_kg),
      bonificacion_cop_kg: num(v.bonificacion_cop_kg),
      cadmio: v.cadmio || null,
      pct_humedad: num(v.pct_humedad),
      pct_fermentacion_total: num(v.pct_fermentacion_total),
      notes: v.notes.trim() || null,
    };
    const p = ingresoSchema.safeParse(datos);
    if (!p.success) {
      setError(p.error.issues[0]?.message ?? "Revisa los datos.");
      return;
    }
    setGuardando(true);
    const r = lote ? await editarIngreso(lote.id, datos) : await crearIngreso(datos);
    setGuardando(false);
    if (!r.ok) {
      setError(r.error ?? "No se pudo guardar.");
      return;
    }
    toast({
      tone: "success",
      title: lote ? "Ingreso corregido" : "Ingreso registrado",
      description: r.detalle,
    });
    onGuardado();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={lote ? "Corregir ingreso" : "Nuevo ingreso a bodega"}
      description="Los kilos van por clase. El disponible se calcula solo con las salidas y ajustes."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="form-ingreso" loading={guardando}>
            {lote ? "Guardar cambios" : "Registrar ingreso"}
          </Button>
        </>
      }
    >
      <form id="form-ingreso" onSubmit={guardar} className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Fecha de ingreso">
            <Input type="date" value={v.entry_date} onChange={(e) => set("entry_date", e.target.value)} required />
          </Field>
          <Field label="Bodega">
            <Select value={v.bodega} onChange={(e) => set("bodega", e.target.value)}>
              <option value="">
                Automática · {NOMBRE_BODEGA[bodegaPorOrigen(v.departamento, null)]}
              </option>
              {BODEGAS.map((b) => (
                <option key={b} value={b}>
                  {NOMBRE_BODEGA[b]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsable de recepción">
            <Input value={v.responsable} onChange={(e) => set("responsable", e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Proveedor" hint="De la lista de proveedores, o escríbelo abajo.">
            <Select value={v.proveedor_id} onChange={(e) => elegirProveedor(e.target.value)}>
              <option value="">— Otro —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nombre del proveedor">
            <Input value={v.proveedor} onChange={(e) => set("proveedor", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Departamento">
              <Input value={v.departamento} onChange={(e) => set("departamento", e.target.value)} />
            </Field>
            <Field label="Municipio">
              <Input value={v.municipio} onChange={(e) => set("municipio", e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Remisión / lote">
            <Input value={v.remision} onChange={(e) => set("remision", e.target.value)} className="font-mono" />
          </Field>
          <Field label="ODC AROCO">
            <Input value={v.odc} onChange={(e) => set("odc", e.target.value)} className="font-mono" />
          </Field>
          <Field label="Recepción bodega">
            <Input value={v.recepcion} onChange={(e) => set("recepcion", e.target.value)} className="font-mono" />
          </Field>
          <Field label="Bultos">
            <Input
              type="number"
              min="0"
              step="1"
              value={v.bultos_in}
              onChange={(e) => set("bultos_in", e.target.value)}
              className="font-mono tnum"
            />
          </Field>
        </div>

        <fieldset className="rounded-[var(--radius-md)] border border-border p-3">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">
            Kilos recibidos por clase
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {CLASES_CRM.map((c) => (
              <Field key={c} label={`${NOMBRE_CLASE_CRM[c]} · ${NOMBRE_TIPO[TIPO_DE_CLASE[c]]}`}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={v.kilos[c]}
                  onChange={(e) => setV((s) => ({ ...s, kilos: { ...s.kilos, [c]: e.target.value } }))}
                  className="font-mono tnum"
                  aria-label={`Kilos de ${NOMBRE_CLASE_CRM[c]}`}
                />
              </Field>
            ))}
          </div>
          <p className="mt-3 text-right text-sm text-fg-muted">
            Total recibido:{" "}
            <span className="font-mono font-semibold tnum text-fg">{formatNumber(total, 2)} kg</span>
          </p>
        </fieldset>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="Valor base (COP/kg)">
            <Input
              type="number"
              min="0"
              value={v.purchase_price_cop_kg}
              onChange={(e) => set("purchase_price_cop_kg", e.target.value)}
              className="font-mono tnum"
            />
          </Field>
          <Field label="Bonificación (COP/kg)">
            <Input
              type="number"
              min="0"
              value={v.bonificacion_cop_kg}
              onChange={(e) => set("bonificacion_cop_kg", e.target.value)}
              className="font-mono tnum"
            />
          </Field>
          <Field label="Cadmio">
            <Select value={v.cadmio} onChange={(e) => set("cadmio", e.target.value)}>
              <option value="">Sin medir</option>
              <option value="BAJO">Bajo</option>
              <option value="ALTO">Alto</option>
            </Select>
          </Field>
          <Field label="Humedad %">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={v.pct_humedad}
              onChange={(e) => set("pct_humedad", e.target.value)}
              className="font-mono tnum"
            />
          </Field>
          <Field label="Fermentación %">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={v.pct_fermentacion_total}
              onChange={(e) => set("pct_fermentacion_total", e.target.value)}
              className="font-mono tnum"
            />
          </Field>
        </div>

        <Field label="Notas">
          <Textarea rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>

        {error && (
          <p role="alert" className="rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
