"use client";

import * as React from "react";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Botón de selección grande, para el dedo en la plantación. */
export function Chip({
  activo,
  onClick,
  disabled,
  mono,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  disabled?: boolean;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-h-11 rounded-full border px-4 text-sm transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        mono && "tnum font-mono",
        activo
          ? "border-accent bg-accent text-accent-fg"
          : "border-border bg-surface text-fg hover:border-border-strong",
        disabled && "cursor-default",
      )}
    >
      {children}
    </button>
  );
}

export function Numero({
  label,
  valor,
  error,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  valor: string;
  error?: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      <Input
        inputMode="decimal"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="tnum h-12 text-base"
      />
    </Field>
  );
}
