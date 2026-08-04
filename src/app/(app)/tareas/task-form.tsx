"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  TASK_SOURCES,
  SYSTEM_TASK_SOURCES,
  OTRO_ORIGEN,
  isKnownSource,
} from "@/lib/task-sources";
import { useToast } from "@/components/ui/toast";
import { TASK_STATUSES, TASK_STATUS_META } from "@/lib/status";
import type { TeamMember } from "@/lib/types/database";
import type { TaskWithPerson } from "./page";
import { createTask, updateTask } from "./actions";

interface FormValues {
  name: string;
  description: string;
  start_date: string;
  due_date: string;
  status: string;
  notes: string;
}

function toValues(t: TaskWithPerson | null): FormValues {
  return {
    name: t?.name ?? "",
    description: t?.description ?? "",
    start_date: t?.start_date ?? "",
    due_date: t?.due_date ?? "",
    status: t?.status ?? "pending",
    notes: t?.notes ?? "",
  };
}

/**
 * El origen se reparte en dos controles: el desplegable y, si se elige "Otro",
 * una caja de texto. Un valor que no esté en la lista abre "Otro" con el texto
 * ya puesto, para no perder lo que hubiera.
 */
function toSource(t: TaskWithPerson | null): { sel: string; libre: string } {
  const actual = t?.source ?? "";
  if (!actual) return { sel: "", libre: "" };
  if (isKnownSource(actual)) return { sel: actual, libre: "" };
  return { sel: OTRO_ORIGEN, libre: actual };
}

/** Ids de los responsables actuales, con el principal como respaldo. */
function toAssignees(t: TaskWithPerson | null): string[] {
  if (!t) return [];
  if (t.assignees.length > 0) return t.assignees.map((a) => a.id);
  return t.person_id ? [t.person_id] : [];
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
  // La selección múltiple y el origen son controlados, así que viven fuera de
  // react-hook-form.
  const [assignees, setAssignees] = React.useState<string[]>(toAssignees(initial));
  const [source, setSource] = React.useState(() => toSource(initial));
  const [prevKey, setPrevKey] = React.useState("");
  const key = `${open}:${initial?.id ?? "new"}`;
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) {
      reset(toValues(initial));
      setAssignees(toAssignees(initial));
      setSource(toSource(initial));
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const origen =
      source.sel === OTRO_ORIGEN ? source.libre.trim() : source.sel.trim();
    const payload = {
      ...values,
      source: origen || null,
      assignee_ids: assignees,
      // Solo se conserva el nombre libre cuando el acta trajo a alguien que no
      // está en el catálogo del equipo; con responsables reales lo deriva el
      // trigger a partir del primero.
      person_name: assignees.length === 0 ? (initial?.person_name ?? null) : null,
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
        <Field
          label="Responsables"
          hint={
            assignees.length > 1
              ? `${assignees.length} personas · la primera figura como principal`
              : "Puedes asignar la tarea a varias personas"
          }
        >
          <MultiSelect
            label="Sin asignar"
            options={team.map((t) => ({ value: t.id, label: t.name }))}
            selected={assignees}
            onChange={setAssignees}
          />
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
        <Field
          label="Origen"
          className="sm:col-span-2"
          hint="De dónde nace la tarea. Sirve para agrupar y filtrar."
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={source.sel}
              onChange={(e) => setSource((s) => ({ ...s, sel: e.target.value }))}
              className="sm:w-64"
            >
              <option value="">Sin origen</option>
              {TASK_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              {/* El valor puesto por el sistema al ingerir un acta solo aparece
                  si la tarea ya lo tiene: nadie lo elige a mano. */}
              {SYSTEM_TASK_SOURCES.filter((s) => s === source.sel).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={OTRO_ORIGEN}>Otro…</option>
            </Select>
            {source.sel === OTRO_ORIGEN && (
              <Input
                value={source.libre}
                onChange={(e) => setSource((s) => ({ ...s, libre: e.target.value }))}
                placeholder="¿De dónde salió?"
                className="flex-1"
                autoFocus
              />
            )}
          </div>
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
