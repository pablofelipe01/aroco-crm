"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "warn" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (t: Omit<Toast, "id">) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const icons = {
  success: CheckCircle2,
  error: XCircle,
  warn: AlertTriangle,
  info: Info,
} as const;

const toneClasses: Record<ToastTone, string> = {
  success: "text-success",
  error: "text-danger",
  warn: "text-warn",
  info: "text-info",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const counter = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback<ToastContextValue["toast"]>(
    (t) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { ...t, id }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = icons[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: 24, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 460, damping: 34 }}
                className="pointer-events-auto flex items-start gap-3 rounded-[var(--radius-md)] border border-border bg-surface-raised p-3.5 shadow-[var(--shadow-soft-md)]"
              >
                <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", toneClasses[t.tone])} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{t.title}</p>
                  {t.description && (
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {t.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Cerrar notificación"
                  className="rounded-[var(--radius-sm)] p-1 text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
