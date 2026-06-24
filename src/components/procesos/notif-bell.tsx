"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Notificacion } from "@/lib/types/database";
import { marcarNotificacionLeida, marcarTodasLeidas } from "@/app/(procesos)/notif-actions";

function hace(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export function NotifBell({
  items,
  unread,
}: {
  items: Notificacion[];
  unread: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function abrir(n: Notificacion) {
    setOpen(false);
    if (!n.leida) await marcarNotificacionLeida(n.id);
    if (n.enlace) router.push(n.enlace);
    else router.refresh();
  }

  async function todas() {
    await marcarTodasLeidas();
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notificaciones"
        className="relative rounded-[var(--radius-md)] p-2 text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tnum">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-medium text-fg">Notificaciones</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={todas}
                className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-fg-subtle">Sin notificaciones.</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => abrir(n)}
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-bg-subtle/60",
                        !n.leida && "bg-accent-soft/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                          n.leida ? "bg-transparent" : "bg-accent",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-fg">{n.titulo}</span>
                        {n.cuerpo && (
                          <span className="block truncate text-xs text-fg-muted">{n.cuerpo}</span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-fg-subtle">{hace(n.created_at)}</span>
                      </span>
                      {!n.leida && <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-fg-subtle" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
