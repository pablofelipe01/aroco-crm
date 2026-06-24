"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { OC_CASOS, sugerirCaso, COP } from "@/lib/procesos/oc-opts";
import type { OcCaso } from "@/lib/procesos/oc-opts";
import type { OrdenCompra } from "@/lib/types/database";
import type { ProveedorHabilitado } from "./page";
import { crearOrden, actualizarOrden } from "./actions";

export function OrdenForm({
  open,
  onClose,
  proveedores,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  proveedores: ProveedorHabilitado[];
  initial?: OrdenCompra | null;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const editing = Boolean(initial);
  const [proveedorId, setProveedorId] = React.useState("");
  const [volumen, setVolumen] = React.useState("");
  const [precio, setPrecio] = React.useState("");
  const [fecha, setFecha] = React.useState("");
  const [lugar, setLugar] = React.useState("");
  const [obs, setObs] = React.useState("");
  const [caso, setCaso] = React.useState<OcCaso>("otros_sin");
  const [saving, setSaving] = React.useState(false);
  const [prev, setPrev] = React.useState(false);

  if (open !== prev) {
    setPrev(open);
    if (open) {
      setProveedorId(initial?.proveedor_id ?? "");
      setVolumen(initial?.volumen_kg != null ? String(initial.volumen_kg) : "");
      setPrecio(initial?.precio_kg != null ? String(initial.precio_kg) : "");
      setFecha(initial?.fecha_entrega ?? "");
      setLugar(initial?.lugar_entrega ?? "");
      setObs(initial?.observaciones ?? "");
      setCaso(initial?.tipo_caso ?? "otros_sin");
    }
  }

  function onProveedor(id: string) {
    setProveedorId(id);
    const p = proveedores.find((x) => x.id === id);
    setCaso(sugerirCaso(p?.programa));
  }

  const total = (Number(volumen) || 0) * (Number(precio) || 0);

  async function submit() {
    if (!proveedorId) {
      toast({ tone: "error", title: "Selecciona el proveedor." });
      return;
    }
    setSaving(true);
    const payload = {
      proveedor_id: proveedorId,
      volumen_kg: volumen ? Number(volumen) : null,
      precio_kg: precio ? Number(precio) : null,
      fecha_entrega: fecha || null,
      lugar_entrega: lugar || null,
      observaciones: obs || null,
      tipo_caso: caso,
    };
    const res = editing
      ? await actualizarOrden(initial!.id, payload)
      : await crearOrden(payload);
    setSaving(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: editing ? "Orden actualizada" : "Orden creada (borrador)" });
    onClose();
    if (editing) {
      onSaved?.();
      router.refresh();
    } else if (res.id) {
      router.push(`/procesos/ordenes/${res.id}`);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? "Editar orden de compra" : "Nueva orden de compra"}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={submit} loading={saving} disabled={!proveedorId}>
            {editing ? "Guardar cambios" : "Crear borrador"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Proveedor (habilitado)">
          <Select value={proveedorId} onChange={(e) => onProveedor(e.target.value)} disabled={editing}>
            <option value="">Selecciona…</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
          {proveedores.length === 0 && (
            <p className="mt-1 text-xs text-fg-subtle">
              No hay proveedores habilitados todavía.
            </p>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Volumen (kg)">
            <Input type="number" inputMode="decimal" value={volumen} onChange={(e) => setVolumen(e.target.value)} />
          </Field>
          <Field label="Precio por kg (COP)">
            <Input type="number" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </Field>
        </div>

        <p className="rounded-[var(--radius-md)] bg-bg-subtle/50 px-3 py-2 text-sm">
          Valor total estimado: <b className="tnum">{COP.format(total)}</b>
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fecha de entrega">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Lugar de entrega">
            <Input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Bodega / finca…" />
          </Field>
        </div>

        <Field label="Tipo de caso (define la aprobación)">
          <Select value={caso} onChange={(e) => setCaso(e.target.value as OcCaso)}>
            {OC_CASOS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.etiqueta}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-fg-subtle">
            {OC_CASOS.find((c) => c.id === caso)?.descripcion}
          </p>
        </Field>

        <Field label="Observaciones">
          <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
