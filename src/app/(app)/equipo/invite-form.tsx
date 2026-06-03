"use client";

import * as React from "react";
import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DEPARTMENTS } from "@/lib/nav";
import { inviteUser, type InviteState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(
    inviteUser,
    {},
  );

  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Correo (@aroco.co)" className="sm:col-span-2">
        <Input name="email" type="email" placeholder="nombre@aroco.co" required />
      </Field>
      <Field label="Nombre completo">
        <Input name="full_name" placeholder="Nombre del invitado" />
      </Field>
      <Field label="Departamento">
        <Select name="department" defaultValue="">
          <option value="">Sin asignar</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Rol" className="sm:col-span-2">
        <Select name="role" defaultValue="member">
          <option value="member">Miembro</option>
          <option value="admin">Administrador</option>
        </Select>
      </Field>

      {state.error && (
        <p className="text-sm text-danger sm:col-span-2" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm text-success sm:col-span-2" role="status">
          {state.success}
        </p>
      )}

      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          <UserPlus className="h-4 w-4" />
          Enviar invitación
        </Button>
      </div>
    </form>
  );
}
