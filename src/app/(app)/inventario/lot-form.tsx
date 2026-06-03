"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { InventoryLot } from "@/lib/types/database";
import { createLot, updateLot } from "./actions";

interface FormValues {
  code: string;
  entry_date: string;
  remision: string;
  origin: string;
  quality: string;
  qty_in_kg: string;
  qty_out_kg: string;
  samples_pasilla_merma_kg: string;
  purchase_price_cop_kg: string;
  notes: string;
}

function toValues(l: InventoryLot | null): FormValues {
  return {
    code: l?.code ?? "",
    entry_date: l?.entry_date ?? "",
    remision: l?.remision ?? "",
    origin: l?.origin ?? "",
    quality: l?.quality ?? "",
    qty_in_kg: String(l?.qty_in_kg ?? 0),
    qty_out_kg: String(l?.qty_out_kg ?? 0),
    samples_pasilla_merma_kg: String(l?.samples_pasilla_merma_kg ?? 0),
    purchase_price_cop_kg: l?.purchase_price_cop_kg != null ? String(l.purchase_price_cop_kg) : "",
    notes: l?.notes ?? "",
  };
}

export function LotForm({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: InventoryLot | null;
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
      ? await updateLot(initial.id, values)
      : await createLot(values);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: initial ? "Lote actualizado" : "Lote creado" });
    onSaved();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={initial ? "Editar lote" : "Nuevo lote"}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onSubmit} loading={formState.isSubmitting}>
            {initial ? "Guardar" : "Crear lote"}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Código procedencia *" className="sm:col-span-2">
          <Input {...register("code", { required: true })} placeholder="CO-MET-GRA-150526" className="font-mono" />
        </Field>
        <Field label="Fecha ingreso">
          <Input type="date" {...register("entry_date")} />
        </Field>
        <Field label="# Remisión">
          <Input {...register("remision")} />
        </Field>
        <Field label="Procedencia">
          <Input {...register("origin")} />
        </Field>
        <Field label="Calidad">
          <Input {...register("quality")} placeholder="Premium / CTE / Orgánico" />
        </Field>
        <Field label="Ingresada (kg)">
          <Input type="number" step="any" {...register("qty_in_kg")} className="font-mono tnum" />
        </Field>
        <Field label="Salida (kg)">
          <Input type="number" step="any" {...register("qty_out_kg")} className="font-mono tnum" />
        </Field>
        <Field label="Muestras / Pasilla / merma (kg)">
          <Input type="number" step="any" {...register("samples_pasilla_merma_kg")} className="font-mono tnum" />
        </Field>
        <Field label="Precio compra (COP/kg)">
          <Input type="number" step="any" {...register("purchase_price_cop_kg")} className="font-mono tnum" />
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          <Textarea {...register("notes")} rows={2} />
        </Field>
        <p className="text-xs text-fg-subtle sm:col-span-2">
          El disponible se calcula automáticamente (ingresada − salida).
        </p>
      </form>
    </Modal>
  );
}
