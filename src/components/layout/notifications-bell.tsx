"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, AlertTriangle, Clock, TrendingUp, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/env";
import { cn, formatDate } from "@/lib/utils";
import { ease } from "@/lib/motion";
import type { Notification } from "@/lib/types/database";

const ICON: Record<string, React.ElementType> = {
  lead_followup: Clock,
  task_overdue: AlertTriangle,
  price_alert: TrendingUp,
};

const SEV_COLOR: Record<string, string> = {
  info: "text-info",
  warn: "text-warn",
  danger: "text-danger",
};

export function NotificationsBell() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Notification[]>([]);
  const ref = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    if (!hasSupabaseEnv()) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("read", false)
      .order("created_at", { ascending: false })
      .limit(20);
    setItems(data ?? []);
  }, []);

  React.useEffect(() => {
    // Poll the notifications system (external state) on mount and every minute.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch, not a sync setState
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAll() {
    if (!items.length) return;
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read: true })
      .in(
        "id",
        items.map((i) => i.id),
      );
    setItems([]);
  }

  const count = items.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        aria-label="Notificaciones"
        className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
      >
        <Bell className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-mono text-[9px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={ease}
            className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-raised shadow-[var(--shadow-soft-lg)]"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-sm font-semibold text-fg">Notificaciones</span>
              {count > 0 && (
                <button
                  onClick={markAll}
                  className="flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  <Check className="h-3 w-3" />
                  Marcar leídas
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {count === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-fg-subtle">
                  Sin notificaciones pendientes.
                </p>
              ) : (
                items.map((n) => {
                  const Icon = ICON[n.type] ?? Bell;
                  return (
                    <div
                      key={n.id}
                      className="flex gap-3 border-b border-border px-4 py-3 last:border-0"
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          SEV_COLOR[n.severity] ?? "text-fg-subtle",
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-fg">{n.title}</p>
                        {n.body && (
                          <p className="mt-0.5 text-xs text-fg-muted">{n.body}</p>
                        )}
                        <p className="mt-0.5 font-mono text-[10px] text-fg-subtle">
                          {formatDate(n.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
