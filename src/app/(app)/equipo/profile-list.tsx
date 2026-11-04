"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { colorDeArea } from "@/lib/areas";
import { DEPARTMENTS, type Department } from "@/lib/departments";
import type { Profile } from "@/lib/types/database";
import {
  actualizarPerfil,
  setProfileRole,
  toggleProfileActive,
  type CambiosPerfil,
} from "./actions";

type Permiso =
  | "aprueba_compras"
  | "ve_mercado"
  | "ve_uso"
  | "ve_comisiones_todas"
  | "verifica_proveedores";

/** Permisos por persona que ganan sobre el rol (ver `navForUser`). */
const PERMISOS: { clave: Permiso; label: string; nota: string }[] = [
  { clave: "aprueba_compras", label: "Aprueba compras", nota: "Aprueba solicitudes de Compras Adm" },
  { clave: "ve_mercado", label: "Ve Mercado", nota: "Posiciones del bróker, márgenes y P&L" },
  { clave: "ve_comisiones_todas", label: "Ve todas las comisiones", nota: "Sin esto, solo ve las suyas" },
  { clave: "verifica_proveedores", label: "Verifica proveedores", nota: "Marca proveedores como verificados" },
  { clave: "ve_uso", label: "Ve Uso del CRM", nota: "Tablero de uso del equipo" },
];

export function ProfileList({
  profiles,
  currentUserId,
}: {
  profiles: Profile[];
  currentUserId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [abierto, setAbierto] = React.useState<string | null>(null);

  async function correr(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(id);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: ok });
    router.refresh();
  }

  const guardar = (id: string, cambios: CambiosPerfil, ok = "Perfil actualizado") =>
    correr(id, () => actualizarPerfil(id, cambios), ok);

  if (!profiles.length) {
    return (
      <p className="px-5 py-8 text-center text-sm text-fg-subtle">
        Aún no hay usuarios. Invita al primero arriba.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {profiles.map((p) => {
        const isSelf = p.id === currentUserId;
        const ocupado = busy === p.id;
        const disabled = isSelf || ocupado;
        const expandido = abierto === p.id;
        return (
          <li key={p.id} className="px-5 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-xs font-medium text-white"
                  style={{ backgroundColor: colorDeArea(p.department) }}
                  title={p.department ?? "Sin área"}
                >
                  {initials(p.full_name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">
                    {p.full_name}
                    {isSelf && <span className="ml-1 text-xs text-fg-subtle">(tú)</span>}
                  </p>
                  <p className="truncate text-xs text-fg-muted">{p.email}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label={`Área de ${p.full_name}`}
                  value={p.department ?? ""}
                  disabled={ocupado}
                  onChange={(e) =>
                    guardar(p.id, { department: (e.target.value || null) as Department | null }, "Área actualizada")
                  }
                  className="h-8 w-auto py-0 text-xs"
                >
                  <option value="">Sin área</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>

                <Select
                  aria-label={`Rol de ${p.full_name}`}
                  value={p.role}
                  disabled={disabled}
                  onChange={(e) =>
                    correr(
                      p.id,
                      () => setProfileRole(p.id, e.target.value as "admin" | "member"),
                      "Rol actualizado",
                    )
                  }
                  className="h-8 w-auto py-0 text-xs"
                  title={isSelf ? "No puedes cambiar tu propio rol" : "Cambiar rol"}
                >
                  <option value="member">Miembro</option>
                  <option value="admin">Administrador</option>
                </Select>

                <button
                  type="button"
                  onClick={() =>
                    correr(
                      p.id,
                      () => toggleProfileActive(p.id, !p.active),
                      p.active ? "Usuario desactivado" : "Usuario activado",
                    )
                  }
                  disabled={disabled}
                  title={isSelf ? "No puedes desactivar tu cuenta" : "Activar / desactivar"}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                    p.active
                      ? "border-transparent bg-success-soft text-success"
                      : "border-transparent bg-danger-soft text-danger",
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {p.active ? "Activo" : "Inactivo"}
                </button>

                <Button
                  size="sm"
                  variant="ghost"
                  aria-expanded={expandido}
                  aria-controls={`perfil-${p.id}`}
                  onClick={() => setAbierto(expandido ? null : p.id)}
                >
                  Perfil
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 transition-transform", expandido && "rotate-180")}
                  />
                </Button>
              </div>
            </div>

            {expandido && (
              <EditorPerfil
                key={`${p.id}-${p.updated_at}`}
                perfil={p}
                ocupado={ocupado}
                onGuardar={(c, ok) => guardar(p.id, c, ok)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function EditorPerfil({
  perfil,
  ocupado,
  onGuardar,
}: {
  perfil: Profile;
  ocupado: boolean;
  onGuardar: (c: CambiosPerfil, ok?: string) => void;
}) {
  const [nombre, setNombre] = React.useState(perfil.full_name);
  const cambioNombre = nombre.trim() !== perfil.full_name && nombre.trim().length >= 2;

  return (
    <div
      id={`perfil-${perfil.id}`}
      className="mt-3 grid gap-4 rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-4 sm:grid-cols-2"
    >
      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (cambioNombre) onGuardar({ full_name: nombre }, "Nombre actualizado");
        }}
      >
        <label htmlFor={`nombre-${perfil.id}`} className="text-xs font-medium text-fg-muted">
          Nombre completo
        </label>
        <div className="flex gap-2">
          <Input
            id={`nombre-${perfil.id}`}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="h-8 text-sm"
          />
          <Button type="submit" size="sm" disabled={!cambioNombre || ocupado}>
            Guardar
          </Button>
        </div>
      </form>

      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-xs font-medium text-fg-muted">Permisos</legend>
        {PERMISOS.map(({ clave, label, nota }) => (
          <label key={clave} className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
              checked={Boolean(perfil[clave])}
              disabled={ocupado}
              onChange={(e) =>
                onGuardar({ [clave]: e.target.checked }, `${label}: ${e.target.checked ? "sí" : "no"}`)
              }
            />
            <span>
              <span className="text-fg">{label}</span>
              <span className="block text-xs text-fg-subtle">{nota}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
