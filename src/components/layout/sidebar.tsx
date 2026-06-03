"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { navForDepartment, type Department } from "@/lib/nav";
import { Wordmark, Logo } from "@/components/brand";
import { cn } from "@/lib/utils";

export function Sidebar({
  department,
  collapsed,
  onToggleCollapse,
  onNavigate,
}: {
  department: Department | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = navForDepartment(department);

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Brand */}
      <div className="flex h-16 items-center justify-between px-4">
        {collapsed ? (
          <Logo className="mx-auto" />
        ) : (
          <Wordmark />
        )}
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          className={cn(
            "hidden rounded-[var(--radius-sm)] p-1.5 text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg lg:block",
            collapsed && "absolute",
          )}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform",
              collapsed && "rotate-180",
            )}
          />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "text-accent-soft-fg"
                  : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
                collapsed && "justify-center px-0",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-[var(--radius-md)] bg-accent-soft"
                  transition={{ type: "spring", stiffness: 460, damping: 36 }}
                />
              )}
              <item.icon className="relative z-10 h-[18px] w-[18px] shrink-0" />
              {!collapsed && (
                <span className="relative z-10 truncate">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="border-t border-border px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
            AROCO S.A.S
          </p>
          <p className="mt-0.5 text-[11px] text-fg-subtle">
            Plataforma comercial · v0.1
          </p>
        </div>
      )}
    </div>
  );
}
