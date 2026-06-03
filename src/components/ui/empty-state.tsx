import * as React from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-dashed border-border-strong bg-surface/50 px-6 py-16 text-center",
        className,
      )}
    >
      {/* Faded cacao-pod watermark for character */}
      <Logo className="pointer-events-none absolute -bottom-6 -right-4 h-32 w-32 opacity-[0.04]" />
      {icon && (
        <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg">
          {icon}
        </div>
      )}
      <h3 className="relative text-base font-semibold text-fg">{title}</h3>
      {description && (
        <p className="relative mt-1.5 max-w-sm text-sm text-fg-muted">
          {description}
        </p>
      )}
      {action && <div className="relative mt-5">{action}</div>}
    </div>
  );
}
