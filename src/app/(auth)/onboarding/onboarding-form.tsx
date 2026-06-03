"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DEPARTMENTS } from "@/lib/nav";
import { completeOnboarding, type OnboardingState } from "./actions";

export function OnboardingForm({ initialName }: { initialName: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <Field label="Nombre completo">
        <Input
          name="full_name"
          defaultValue={initialName}
          placeholder="Tu nombre"
          required
        />
      </Field>
      <Field label="Departamento" hint="Define a qué módulos tienes acceso.">
        <Select name="department" defaultValue="" required>
          <option value="" disabled>
            Selecciona…
          </option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Contraseña" hint="Mínimo 8 caracteres.">
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          required
        />
      </Field>
      <Field label="Confirmar contraseña">
        <Input
          name="password_confirm"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          required
        />
      </Field>

      {state.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" loading={pending}>
        Continuar
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}
