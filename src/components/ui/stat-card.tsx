"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useFormatos } from "@/lib/i18n/provider";

export function StatCard({
  label,
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  icon: Icon,
  delta,
  hint,
}: {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  icon?: LucideIcon;
  delta?: number;
  hint?: string;
}) {
  const f = useFormatos();
  const positive = (delta ?? 0) >= 0;
  return (
    <motion.div
      variants={fadeUp}
      className="group relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-soft-sm)] transition-shadow hover:shadow-[var(--shadow-soft-md)]"
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-accent-soft to-transparent opacity-60" />
      <div className="relative flex items-start justify-between">
        <p className="text-sm font-medium text-fg-muted">{label}</p>
        {Icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent-soft-fg">
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <p className="relative mt-3 text-3xl font-bold tracking-tight text-fg">
        <AnimatedCounter
          value={value}
          decimals={decimals}
          prefix={prefix}
          suffix={suffix}
        />
      </p>
      <div className="relative mt-2 flex items-center gap-2">
        {delta !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              positive ? "text-success" : "text-danger",
            )}
          >
            {positive ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {/* Un decimal y con el separador del idioma: sin esto salía
                «1.4670823399963322%» en Mercado (2026-11-04). */}
            {f.numero(Math.abs(delta), 1)} %
          </span>
        )}
        {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
      </div>
    </motion.div>
  );
}
