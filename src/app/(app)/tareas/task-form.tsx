"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { TASK_STATUSES, TASK_STATUS_META } from "@/lib/status";
import type { TeamMember } from "@/lib/types/database";
import type { TaskWithPerson } from "./page";
import { createTask, updateTask } from "./actions";

interface FormValues {
  name: string;
  description: string;
  person_id: string;
  source: string;
  start_date: string;
  due_date: string;
  status: string;
  notes: string;
}

function toValues(t: TaskWithPerson | null): FormValues {
  return {
    name: t?.name ?? "",
    description: t?.description ?? "",
    person_id: t?.person_id ?? "",
    source: t?.source ?? "",
    start_date: t?.start_date ?? "",
    due_date: t?.due_date ?? "",
    status: t?.status ?? "pending",
    notes: t?.notes ?? "",
  };
}

export function TaskForm({
  open,
  onClose,
  team,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  team: TeamMember[];
  initial: TaskWithPerson | null;
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
    const person = team.find((t) => t.id === values.person_id);
    const payload = {
      ...values,
      person_id: values.person_id || null,
      person_name: person?.name ?? null,
    };
    const res = initial
      ? await updateTask(initial.id, payload)
      : await createTask(payload);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: initial ? "Tarea actualizada" : "Tarea creada" });
    onSaved();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={initial ? "Editar tarea" : "Nueva tarea"}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onSubmit} loading={formState.isSubmitting}>
            {initial ? "Guardar" : "Crear tarea"}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tarea *" className="sm:col-span-2">
          <Input {...register("name", { required: true })} placeholder="¿Qué hay que hacer?" />
        </Field>
        <Field label="Responsable">
          <Select {...register("person_id")} defaultValue="">
            <option value="">Sin asignar</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select {...register("status")}>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_META[s].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Inicio">
          <Input type="date" {...register("start_date")} />
        </Field>
        <Field label="Vencimiento">
          <Input type="date" {...register("due_date")} />
        </Field>
        <Field label="Origen" className="sm:col-span-2">
          <Input {...register("source")} placeholder="p. ej. Reunión comercial" />
        </Field>
        <Field label="Descripción" className="sm:col-span-2">
          <Textarea {...register("description")} rows={2} />
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          <Textarea {...register("notes")} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}
