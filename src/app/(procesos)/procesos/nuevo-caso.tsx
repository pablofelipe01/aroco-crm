"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { TipoCaso } from "@/lib/procesos/types";
import { crearCaso } from "./actions";

export function NuevoCaso() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [tipo, setTipo] = React.useState<TipoCaso>("proveedor");
  const [titulo, setTitulo] = React.useState("");
  const [origen, setOrigen] = React.useState("");

  function reset() {
    setTipo("proveedor");
    setTitulo("");
    setOrigen("");
  }

  async function onSave() {
    if (!titulo.trim()) {
      toast({ tone: "error", title: "Falta el título" });
      return;
    }
    setSaving(true);
    const res = await crearCaso({
      tipo,
      titulo,
      origen: tipo === "orden_compra" ? origen || null : null,
    });
    setSaving(false);
    if (!res.ok || !res.id) {
      toast({ tone: "error", title: "No se pudo crear", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Proceso creado" });
    setOpen(false);
    reset();
    router.push(`/procesos/${res.id}`);
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nuevo proceso
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        title="Nuevo proceso"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={onSave} loading={saving}>
              Crear
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Tipo de caso">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCaso)}>
              <option value="proveedor">Proveedor (Fases 1 y 5)</option>
              <option value="orden_compra">Orden de Compra (Fases 2, 3 y 4)</option>
            </Select>
          </Field>
          <Field label="Título">
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={tipo === "proveedor" ? "Proveedor: Finca El Roble" : "OC-2026-014"}
            />
          </Field>
          {tipo === "orden_compra" && (
            <Field label="Origen (sugiere la rama de la Fase 2/4)">
              <Select value={origen} onChange={(e) => setOrigen(e.target.value)}>
                <option value="">—</option>
                <option value="Programa ROC">Programa ROC / Finca</option>
                <option value="Otros sin novedades">Otros SIN novedades</option>
                <option value="Otros con novedades">Otros CON novedades</option>
              </Select>
            </Field>
          )}
        </div>
      </Modal>
    </>
  );
}
