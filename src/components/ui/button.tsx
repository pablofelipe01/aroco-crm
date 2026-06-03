"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active shadow-[var(--shadow-soft-sm)]",
  secondary:
    "bg-surface text-fg border border-border hover:bg-bg-subtle hover:border-border-strong",
  ghost: "text-fg-muted hover:bg-bg-subtle hover:text-fg",
  outline:
    "border border-accent text-accent hover:bg-accent-soft dark:hover:bg-accent-soft",
  danger: "bg-danger text-white hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-[var(--radius-sm)]",
  md: "h-10 px-4 text-sm gap-2 rounded-[var(--radius-md)]",
  lg: "h-12 px-6 text-base gap-2 rounded-[var(--radius-md)]",
  icon: "h-9 w-9 rounded-[var(--radius-md)]",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex select-none items-center justify-center font-medium transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
          "disabled:pointer-events-none disabled:opacity-50",
          "active:scale-[0.98]",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
