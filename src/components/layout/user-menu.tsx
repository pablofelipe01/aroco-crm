"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, ChevronDown } from "lucide-react";
import { initials } from "@/lib/utils";
import { ease } from "@/lib/motion";

export function UserMenu({
  name,
  department,
  role,
}: {
  name: string;
  department?: string;
  role?: "admin" | "member";
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

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
                  {role === "admin" ? "Administrador" : "Miembro"}
                </span>
              )}
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-fg transition-colors hover:bg-bg-subtle"
              >
                <LogOut className="h-4 w-4 text-fg-subtle" />
                Cerrar sesión
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
