"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ease } from "@/lib/motion";

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "md" | "lg";
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const w = width === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80]">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={ease}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            className={cn(
              "absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-surface shadow-[var(--shadow-soft-lg)]",
              w,
            )}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 40 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                {title && (
                  <h2 className="truncate text-base font-semibold text-fg">
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <div className="mt-0.5 text-sm text-fg-muted">{subtitle}</div>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="rounded-[var(--radius-sm)] p-1.5 text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-border bg-bg-subtle/50 px-5 py-3">
                {footer}
              </div>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
