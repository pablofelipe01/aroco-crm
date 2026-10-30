import * as React from "react";
import { cn } from "@/lib/utils";
import { EncabezadoScroll } from "@/components/ui/scroll-efectos";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  // Se desvanece al bajar (rediseño del 2026-10-30); el título sigue en la barra
  // superior.
  return (
    <EncabezadoScroll>
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div>
        <h2 className="text-xl font-bold tracking-tight text-fg">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-fg-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
    </EncabezadoScroll>
  );
}
