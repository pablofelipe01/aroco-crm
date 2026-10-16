"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, ChevronDown, Languages, Check, FlaskConical } from "lucide-react";
import { initials, cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types/database";
import { useIdioma, useT } from "@/lib/i18n/provider";
import { cambiarIdioma } from "@/lib/i18n/actions";
import { IDIOMAS, type Idioma } from "@/lib/i18n";
import { ease } from "@/lib/motion";
import { DEPARTMENTS } from "@/lib/departments";
import { cambiarPerfilPrueba } from "@/lib/prueba/actions";

export function UserMenu({
  name,
  department,
  role,
  esPrueba = false,
}: {
  name: string;
  department?: string;
  role?: UserRole;
  esPrueba?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const t = useT();
  const idioma = useIdioma();
  const [cambiando, setCambiando] = React.useState<Idioma | null>(null);

  async function elegirIdioma(nuevo: Idioma) {
    if (nuevo === idioma) return setOpen(false);
    setCambiando(nuevo);
    // Se apaga a mano: `revalidatePath` vuelve a renderizar los componentes de
    // servidor, pero el estado de los de cliente sobrevive — este menú no se
    // vuelve a montar. Sin esto quedaba deshabilitado y solo dejaba cambiar de
    // idioma una vez, sin vuelta atrás.
    try {
      await cambiarIdioma(nuevo);
    } finally {
      setCambiando(null);
    }
    setOpen(false);
  }

  const [cambiandoPerfil, setCambiandoPerfil] = React.useState(false);
  const [errorPerfil, setErrorPerfil] = React.useState<string | null>(null);

  // El menú queda abierto a propósito: quien prueba suele ir saltando de un
  // perfil a otro y comparar.
  async function elegirPerfil(nuevoRol: string, nuevaArea: string) {
    setCambiandoPerfil(true);
    setErrorPerfil(null);
    try {
      const r = await cambiarPerfilPrueba(nuevoRol, nuevaArea);
      if (!r.ok) setErrorPerfil(r.error ?? null);
    } finally {
      setCambiandoPerfil(false);
    }
  }

  const nombreRol = (r: UserRole) =>
    r === "admin" ? t.shell.administrador : r === "admin_view" ? t.shell.adminVista : t.shell.miembro;

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative ml-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full pl-1 transition-colors hover:bg-bg-subtle"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="hidden text-right sm:block">
          <p className="text-xs font-medium leading-tight text-fg">{name}</p>
          {department && (
            <p className="text-[11px] leading-tight text-fg-subtle">
              {department}
            </p>
          )}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent font-mono text-xs font-medium text-accent-fg">
          {initials(name)}
        </div>
        <ChevronDown className="hidden h-3.5 w-3.5 text-fg-subtle sm:block" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={ease}
            className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-raised shadow-[var(--shadow-soft-lg)]"
          >
            <div className="border-b border-border px-3 py-3">
              <p className="text-sm font-medium text-fg">{name}</p>
              <p className="text-xs text-fg-muted">{department ?? "—"}</p>
              {role && (
                <span className="mt-1.5 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-soft-fg">
                  {nombreRol(role)}
                </span>
              )}
            </div>
            {esPrueba && (
              <div className="space-y-2 border-b border-border px-3 py-2.5">
                <p className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-fg-subtle">
                  <FlaskConical className="h-3.5 w-3.5" />
                  {t.shell.cuentaPrueba} · {t.shell.verComo}
                </p>
                <label className="block text-xs text-fg-muted">
                  {t.shell.rol}
                  <select
                    value={role ?? "member"}
                    disabled={cambiandoPerfil}
                    onChange={(e) => elegirPerfil(e.target.value, department ?? DEPARTMENTS[0])}
                    className="mt-1 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1.5 text-sm text-fg disabled:opacity-60"
                  >
                    {(["admin", "admin_view", "member"] as const).map((r) => (
                      <option key={r} value={r}>
                        {nombreRol(r)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-fg-muted">
                  {t.shell.area}
                  <select
                    value={department ?? DEPARTMENTS[0]}
                    disabled={cambiandoPerfil}
                    onChange={(e) => elegirPerfil(role ?? "member", e.target.value)}
                    className="mt-1 w-full rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1.5 text-sm text-fg disabled:opacity-60"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                {cambiandoPerfil && (
                  <p className="text-[11px] text-fg-subtle">{t.shell.cambiandoPerfil}</p>
                )}
                {errorPerfil && (
                  <p role="alert" className="text-[11px] text-danger">
                    {errorPerfil}
                  </p>
                )}
              </div>
            )}
            <div className="border-b border-border py-1.5">
              <p className="flex items-center gap-2 px-3 py-1 text-[11px] uppercase tracking-wide text-fg-subtle">
                <Languages className="h-3.5 w-3.5" />
                {t.shell.idioma}
              </p>
              {IDIOMAS.map((cod) => (
                <button
                  key={cod}
                  type="button"
                  role="menuitemradio"
                  aria-checked={cod === idioma}
                  disabled={cambiando !== null}
                  onClick={() => elegirIdioma(cod)}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-bg-subtle disabled:opacity-60",
                    cod === idioma ? "text-fg" : "text-fg-muted",
                  )}
                >
                  {cod === "es" ? t.shell.espanol : t.shell.ingles}
                  {cod === idioma && (
                    <Check className="h-3.5 w-3.5 text-accent-soft-fg" />
                  )}
                </button>
              ))}
            </div>

            <form action="/auth/signout" method="post">
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-fg transition-colors hover:bg-bg-subtle"
              >
                <LogOut className="h-4 w-4 text-fg-subtle" />
                {t.shell.salir}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
