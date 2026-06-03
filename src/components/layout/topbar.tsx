"use client";

import { Menu, Search, Sparkles, Command } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCommandPalette } from "@/components/layout/command-palette";
import { UserMenu } from "@/components/layout/user-menu";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { useAssistant } from "@/components/assistant/assistant-panel";

export function Topbar({
  title,
  subtitle,
  actions,
  onOpenMobileNav,
  user,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onOpenMobileNav: () => void;
  user?: {
    name: string;
    department?: string;
    role?: "admin" | "member";
  } | null;
}) {
  const palette = useCommandPalette();
  const assistant = useAssistant();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-surface/70 lg:px-6">
      <button
        onClick={onOpenMobileNav}
        aria-label="Abrir menú"
        className="rounded-[var(--radius-md)] p-2 text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold leading-tight text-fg">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs text-fg-muted">{subtitle}</p>
        )}
      </div>

      {/* Command palette trigger */}
      <button
        onClick={palette.open}
        className="hidden items-center gap-2 rounded-[var(--radius-md)] border border-border bg-bg-subtle/60 px-3 py-2 text-sm text-fg-subtle transition-colors hover:border-border-strong hover:text-fg-muted md:flex"
      >
        <Search className="h-4 w-4" />
        <span>Buscar…</span>
        <kbd className="ml-2 flex items-center gap-0.5 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px]">
          <Command className="h-2.5 w-2.5" />K
        </kbd>
      </button>

      <div className="flex items-center gap-1">
        {actions}

        <button
          onClick={assistant.open}
          aria-label="Abrir asistente IA"
          className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-accent transition-colors hover:bg-accent-soft"
        >
          <Sparkles className="h-[18px] w-[18px]" />
        </button>

        <NotificationsBell />

        <ThemeToggle />

        {user && (
          <UserMenu
            name={user.name}
            department={user.department}
            role={user.role}
          />
        )}
      </div>
    </header>
  );
}
