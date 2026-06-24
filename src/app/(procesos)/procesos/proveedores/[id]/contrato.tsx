"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSignature, Plus, Pencil, MessageSquarePlus, FileDown } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { Contrato } from "@/lib/types/database";
import { guardarContrato, agregarNovedad } from "../actions";

const LUGAR_DEFAULT = "Cra 90 # 81A-14, Barrio La Primavera, Localidad Engativá (Bogotá)";

type F = Record<string, string>;
const initial = (c?: Contrato | null): F => ({
  numero_contrato: c?.numero_contrato ?? "",
  humedad_maxima: c?.humedad_maxima != null ? String(c.humedad_maxima) : "",
  granos_enteros_minimo: c?.granos_enteros_minimo != null ? String(c.granos_enteros_minimo) : "",
  fermentacion_minima: c?.fermentacion_minima != null ? String(c.fermentacion_minima) : "",
  libre_olores: c?.libre_olores ?? "",
  lugar_entrega: c?.lugar_entrega ?? LUGAR_DEFAULT,
  forma_pago: c?.forma_pago ?? "",
  garantia: c?.garantia ?? "",
  sanciones_calidad: c?.sanciones_calidad ?? "",
  bonificaciones_calidad: c?.bonificaciones_calidad ?? "",
  estado: c?.estado ?? "Vigente",
});

export function ContratoCard({
  proveedorId,
  contrato,
  canWrite,
}: {
  proveedorId: string;
  contrato: Contrato | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<F>(() => initial(contrato));
  const [saving, setSaving] = React.useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function abrir() {
    setForm(initial(contrato));
    setOpen(true);
  }

  async function onSave() {
    setSaving(true);
    const res = await guardarContrato(proveedorId, form);
    setSaving(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Contrato guardado" });
    setOpen(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-accent" /> Contrato
        </CardTitle>
        <div className="flex items-center gap-2">
          {contrato && (
            <Badge tone={contrato.estado === "Vigente" ? "success" : "neutral"}>
              {contrato.estado}
            </Badge>
          )}
          {contrato && (
            <Link href={`/print/contrato/${proveedorId}`} target="_blank">
              <Button size="sm" variant="secondary">
                <FileDown className="h-4 w-4" /> Generar PDF
              </Button>
            </Link>
          )}
          {canWrite && (
            <Button size="sm" variant="secondary" onClick={abrir}>
              {contrato ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {contrato ? "Editar" : "Crear contrato"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {!contrato ? (
          <p className="text-sm text-fg-subtle">Aún no hay contrato para este proveedor.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <Dato label="Humedad máx." v={pct(contrato.humedad_maxima)} />
              <Dato label="Granos enteros mín." v={pct(contrato.granos_enteros_minimo)} />
              <Dato label="Fermentación mín." v={pct(contrato.fermentacion_minima)} />
              <Dato label="Libre de olores/insectos/moho" v={contrato.libre_olores} />
              <Dato label="Forma de pago" v={contrato.forma_pago} />
              <Dato label="Garantía" v={contrato.garantia} />
              <Dato label="Lugar de entrega" v={contrato.lugar_entrega} className="sm:col-span-3" />
            </dl>
            {(contrato.sanciones_calidad || contrato.bonificaciones_calidad) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {contrato.sanciones_calidad && (
                  <Bloque label="Sanciones por calidad" v={contrato.sanciones_calidad} />
                )}
                {contrato.bonificaciones_calidad && (
                  <Bloque label="Bonificaciones por calidad" v={contrato.bonificaciones_calidad} />
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Novedades
                titulo="Novedades del proveedor"
                texto={contrato.novedades_proveedor}
                contratoId={contrato.id}
                origen="proveedor"
                canWrite={canWrite}
              />
              <Novedades
                titulo="Novedades de AROCO"
                texto={contrato.novedades_aroco}
                contratoId={contrato.id}
                origen="aroco"
                canWrite={canWrite}
              />
            </div>
          </>
        )}
      </CardBody>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={contrato ? "Editar contrato" : "Crear contrato"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={onSave} loading={saving}>Guardar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Número de contrato (ej. CTO-AROCM-004)">
            <Input value={form.numero_contrato} onChange={(e) => set("numero_contrato", e.target.value)} className="font-mono" />
          </Field>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-soft-fg">Condiciones de calidad</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Humedad máxima (%)"><Input type="number" step="any" value={form.humedad_maxima} onChange={(e) => set("humedad_maxima", e.target.value)} className="font-mono tnum" /></Field>
            <Field label="Granos enteros mínimo (%)"><Input type="number" step="any" value={form.granos_enteros_minimo} onChange={(e) => set("granos_enteros_minimo", e.target.value)} className="font-mono tnum" /></Field>
            <Field label="Fermentación mínima (%)"><Input type="number" step="any" value={form.fermentacion_minima} onChange={(e) => set("fermentacion_minima", e.target.value)} className="font-mono tnum" /></Field>
            <Field label="Libre de olores, insectos y moho">
              <Select value={form.libre_olores} onChange={(e) => set("libre_olores", e.target.value)}>
                <option value="">—</option>
                <option value="Si">Si</option>
                <option value="No">No</option>
              </Select>
            </Field>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-accent-soft-fg">Condiciones comerciales</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Forma de pago"><Input value={form.forma_pago} onChange={(e) => set("forma_pago", e.target.value)} /></Field>
            <Field label="Garantía"><Input value={form.garantia} onChange={(e) => set("garantia", e.target.value)} /></Field>
            <Field label="Lugar de entrega" className="sm:col-span-2"><Input value={form.lugar_entrega} onChange={(e) => set("lugar_entrega", e.target.value)} /></Field>
            <Field label="Sanciones por calidad" className="sm:col-span-2"><Textarea rows={2} value={form.sanciones_calidad} onChange={(e) => set("sanciones_calidad", e.target.value)} /></Field>
            <Field label="Bonificaciones por calidad" className="sm:col-span-2"><Textarea rows={2} value={form.bonificaciones_calidad} onChange={(e) => set("bonificaciones_calidad", e.target.value)} /></Field>
            <Field label="Estado">
              <Select value={form.estado} onChange={(e) => set("estado", e.target.value)}>
                <option value="Vigente">Vigente</option>
                <option value="Cancelado">Cancelado</option>
              </Select>
            </Field>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function pct(v: number | null): string | null {
  if (v == null) return null;
  return `${v} (${(v * 100).toFixed(v < 1 ? 0 : 2)}%)`;
}

function Dato({ label, v, className }: { label: string; v: string | null; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="text-fg">{v ?? "—"}</dd>
    </div>
  );
}

function Bloque({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{v}</p>
    </div>
  );
}

function Novedades({
  titulo,
  texto,
  contratoId,
  origen,
  canWrite,
}: {
  titulo: string;
  texto: string | null;
  contratoId: string;
  origen: "proveedor" | "aroco";
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [val, setVal] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function add() {
    if (!val.trim()) return;
    setSaving(true);
    const res = await agregarNovedad(contratoId, origen, val);
    setSaving(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo agregar", description: res.error });
      return;
    }
    setVal("");
    router.refresh();
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border p-3">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{titulo}</p>
      {texto ? (
        <p className="mb-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-fg">{texto}</p>
      ) : (
        <p className="mb-2 text-xs text-fg-subtle">Sin observaciones.</p>
      )}
      {canWrite && (
        <div className="flex items-center gap-1.5">
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="Agregar observación…"
            className="text-sm"
          />
          <Button size="sm" variant="secondary" onClick={add} loading={saving} disabled={!val.trim()}>
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
