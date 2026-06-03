import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "warn"
  | "danger"
  | "info"
  | "success";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-bg-muted text-fg-muted border-border-strong/60",
  accent: "bg-accent-soft text-accent-soft-fg border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
  success: "bg-success-soft text-success border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  dot = false,
  children,
  ...props
}: {
  tone?: BadgeTone;
  dot?: boolean;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      )}
      {children}
    </span>
  );
}
