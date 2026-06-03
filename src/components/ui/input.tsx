"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full bg-surface text-fg placeholder:text-fg-subtle border border-border rounded-[var(--radius-md)] " +
  "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-accent " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(fieldBase, "h-10 px-3 text-sm", className)}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldBase, "min-h-20 px-3 py-2 text-sm", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(fieldBase, "h-10 px-3 text-sm appearance-none pr-8", className)}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({
  className,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "block text-xs font-medium text-fg-muted mb-1.5",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      {label && <Label>{label}</Label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
