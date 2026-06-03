"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types/database";
import { setProfileRole, toggleProfileActive } from "./actions";

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

  async function onRole(id: string, role: "admin" | "member") {
    setBusy(id);
    const res = await setProfileRole(id, role);
    setBusy(null);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo cambiar el rol", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Rol actualizado" });
    router.refresh();
  }

  async function onActive(id: string, active: boolean) {
    setBusy(id);
    const res = await toggleProfileActive(id, active);
    setBusy(null);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo actualizar", description: res.error });
      return;
    }
    toast({ tone: "success", title: active ? "Usuario activado" : "Usuario desactivado" });
    router.refresh();
  }

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
        const disabled = isSelf || busy === p.id;
        return (
          <li
            key={p.id}
            className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-xs font-medium text-accent-fg">
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
              {p.department && <Badge tone="neutral">{p.department}</Badge>}

              <Select
                value={p.role}
                disabled={disabled}
                onChange={(e) => onRole(p.id, e.target.value as "admin" | "member")}
                className="h-8 w-auto py-0 text-xs"
                title={isSelf ? "No puedes cambiar tu propio rol" : "Cambiar rol"}
              >
                <option value="member">Miembro</option>
                <option value="admin">Administrador</option>
              </Select>

              <button
                onClick={() => onActive(p.id, !p.active)}
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
            </div>
          </li>
        );
      })}
    </ul>
  );
}
