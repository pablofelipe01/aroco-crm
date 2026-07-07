"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { InventoryQuality } from "@/lib/types/database";
import { createQualityRow, updateQualityRow } from "./actions";

interface FormValues {
  procedencia: string;
  entry_date: string;
  oc: string;
  por_llegar_kg: string;
  en_bodega_kg: string;
  purchase_price_cop_kg: string;
  qty_b_kg: string;
  qty_c_kg: string;
  qty_premium_kg: string;
  qty_organico_kg: string;
  cadmio: string;
}

const num = (v: number | null | undefined) =>
  v != null && Number(v) !== 0 ? String(v) : "";

function toValues(r: InventoryQuality | null): FormValues {
  return {
    procedencia: r?.procedencia ?? "",
    entry_date: r?.entry_date ?? "",
    oc: r?.oc ?? "",
    por_llegar_kg: num(r?.por_llegar_kg),
    en_bodega_kg: num(r?.en_bodega_kg),
    purchase_price_cop_kg: num(r?.purchase_price_cop_kg),
    qty_b_kg: num(r?.qty_b_kg),
    qty_c_kg: num(r?.qty_c_kg),
    qty_premium_kg: num(r?.qty_premium_kg),
    qty_organico_kg: num(r?.qty_organico_kg),
    cadmio: r?.cadmio ?? "",
  };
}

export function QualityForm({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: InventoryQuality | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: toValues(initial),
  });

  const [prevKey, setPrevKey] = React.useState("");
  const key = `${open}:${initial?.id ?? "new"}`;
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) reset(toValues(initial));
  }

  const onSubmit = handleSubmit(async (values) => {
    const res = initial
      ? await updateQualityRow(initial.id, values)
      : await createQualityRow(values);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: initial ? "Fila actualizada" : "Fila creada" });
    onSaved();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={initial ? "Editar fila manual" : "Nueva fila manual"}
      description="Estas filas no se sobreescriben con el sync diario de la hoja."
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onSubmit} loading={formState.isSubmitting}>
            {initial ? "Guardar cambios" : "Crear fila"}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Procedencia *" className="sm:col-span-2">
          <Input {...register("procedencia", { required: true })} placeholder="p. ej. Arauca" />
        </Field>
        <Field label="Fecha de ingreso">
          <Input type="date" {...register("entry_date")} />
        </Field>
        <Field label="OC">
          <Input {...register("oc")} placeholder="Orden de compra" />
        </Field>
        <Field label="Por llegar (kg)">
          <Input type="number" step="0.001" min="0" {...register("por_llegar_kg")} />
        </Field>
        <Field label="En bodega (kg)">
          <Input type="number" step="0.001" min="0" {...register("en_bodega_kg")} />
        </Field>
        <Field label="Valor compra (COP/kg)">
          <Input type="number" step="0.01" min="0" {...register("purchase_price_cop_kg")} />
        </Field>
        <Field label="Cadmio">
          <Input {...register("cadmio")} placeholder="p. ej. ≤ 0,4 ppm" />
        </Field>
        <Field label="Calidad B (kg)">
          <Input type="number" step="0.001" min="0" {...register("qty_b_kg")} />
        </Field>
        <Field label="Calidad C (kg)">
          <Input type="number" step="0.001" min="0" {...register("qty_c_kg")} />
        </Field>
        <Field label="Premium (kg)">
          <Input type="number" step="0.001" min="0" {...register("qty_premium_kg")} />
        </Field>
        <Field label="Orgánico (kg)">
          <Input type="number" step="0.001" min="0" {...register("qty_organico_kg")} />
        </Field>
      </form>
    </Modal>
  );
}
