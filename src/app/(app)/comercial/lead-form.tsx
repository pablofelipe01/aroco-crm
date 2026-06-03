"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { LEAD_STAGES } from "@/lib/status";
import { MARKETS, LEAD_TYPES } from "@/lib/schemas/lead";
import type { TeamMember } from "@/lib/types/database";
import type { LeadWithOwner } from "./page";
import { createLead, updateLead } from "./actions";

interface FormValues {
  company: string;
  contact_name: string;
  country: string;
  city: string;
  market: string;
  type: string;
  status: string;
  commercial_owner: string;
  product_interest: string;
  volume: string;
  next_action: string;
  next_action_date: string;
  notes: string;
}

function toValues(lead: LeadWithOwner | null): FormValues {
  return {
    company: lead?.company ?? "",
    contact_name: lead?.contact_name ?? "",
    country: lead?.country ?? "",
    city: lead?.city ?? "",
    market: lead?.market ?? "",
    type: lead?.type ?? "",
    status: lead?.status ?? "Nuevo",
    commercial_owner: lead?.commercial_owner ?? "",
    product_interest: lead?.product_interest ?? "",
    volume: lead?.volume ?? "",
    next_action: lead?.next_action ?? "",
    next_action_date: lead?.next_action_date ?? "",
    notes: lead?.notes ?? "",
  };
}

export function LeadForm({
  open,
  onClose,
  team,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  team: TeamMember[];
  initial: LeadWithOwner | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: toValues(initial),
  });
  const [prevKey, setPrevKey] = React.useState<string>("");

  // Reset the form whenever the modal opens or the edited lead changes.
  const key = `${open}:${initial?.id ?? "new"}`;
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) reset(toValues(initial));
  }

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      ...values,
      market: values.market || null,
      type: values.type || null,
      commercial_owner: values.commercial_owner || null,
    };
    const res = initial
      ? await updateLead(initial.id, payload)
      : await createLead(payload);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({
      tone: "success",
      title: initial ? "Lead actualizado" : "Lead creado",
    });
    onSaved();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={initial ? "Editar lead" : "Nuevo lead"}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={onSubmit}
            loading={formState.isSubmitting}
          >
            {initial ? "Guardar cambios" : "Crear lead"}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Empresa *" className="sm:col-span-2">
          <Input {...register("company", { required: true })} placeholder="Nombre de la empresa" />
        </Field>
        <Field label="Contacto">
          <Input {...register("contact_name")} />
        </Field>
        <Field label="Responsable">
          <Select {...register("commercial_owner")} defaultValue="">
            <option value="">Sin asignar</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="País">
          <Input {...register("country")} />
        </Field>
        <Field label="Ciudad / Región">
          <Input {...register("city")} />
        </Field>
        <Field label="Mercado">
          <Select {...register("market")} defaultValue="">
            <option value="">—</option>
            {MARKETS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tipo">
          <Select {...register("type")} defaultValue="">
            <option value="">—</option>
            {LEAD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select {...register("status")}>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Volumen">
          <Input {...register("volume")} placeholder="p. ej. 25 MT/mes" />
        </Field>
        <Field label="Producto / Interés" className="sm:col-span-2">
          <Input {...register("product_interest")} />
        </Field>
        <Field label="Próxima acción">
          <Input {...register("next_action")} />
        </Field>
        <Field label="Fecha próxima acción">
          <Input type="date" {...register("next_action_date")} />
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          <Textarea {...register("notes")} rows={3} />
        </Field>
      </form>
    </Modal>
  );
}
