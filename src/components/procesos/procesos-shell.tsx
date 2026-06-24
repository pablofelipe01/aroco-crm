"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Workflow, Users, Sprout, ArrowLeftRight, Tags, ScrollText, ShoppingCart, Warehouse, Calculator } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/procesos", label: "Resumen", icon: LayoutDashboard },
  { href: "/procesos/proveedores", label: "Proveedores", icon: Sprout },
  { href: "/procesos/ordenes", label: "Órdenes de compra", icon: ShoppingCart },
  { href: "/procesos/recepcion", label: "Recepción en bodega", icon: Warehouse },
  { href: "/procesos/liquidacion", label: "Liquidación / Pago", icon: Calculator },
  { href: "/procesos/flujo", label: "Mapa del flujo", icon: Workflow },
  { href: "/procesos/equipo", label: "Equipo y carga", icon: Users },
];

const NAV_ADMIN = [
  { href: "/procesos/admin/catalogos", label: "Catálogos", icon: Tags },
  { href: "/procesos/admin/auditoria", label: "Auditoría", icon: ScrollText },
];

export function ProcesosShell({
  children,
  isAdmin = false,
  bell,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
  bell?: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = isAdmin ? [...NAV, ...NAV_ADMIN] : NAV;
  const isActive = (href: string) =>
    href === "/procesos" ? pathname === "/procesos" : pathname.startsWith(href);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center justify-between px-4">
          <Wordmark />
          {bell}
        </div>
        <div className="px-3 pb-1">
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-accent-soft-fg">
            Procesos
          </span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {nav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-fg"
                    : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Volver a Operación
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (móvil + acceso rápido) */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 lg:hidden">
          <Wordmark className="h-7" />
          <div className="flex items-center gap-1">
            {bell}
            <Link href="/dashboard" className="text-xs text-fg-muted hover:text-fg">
              Operación →
            </Link>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 lg:hidden">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium",
                isActive(item.href) ? "bg-accent text-accent-fg" : "text-fg-muted",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
