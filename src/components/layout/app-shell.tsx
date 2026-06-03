"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CommandPaletteProvider } from "@/components/layout/command-palette";
import { AssistantProvider } from "@/components/assistant/assistant-panel";
import { NAV_ITEMS, type Department } from "@/lib/nav";
import { ease } from "@/lib/motion";

export interface ShellUser {
  name: string;
  department: Department | null;
  role?: "admin" | "member";
}

/** Resolve the page title/subtitle from the current route. */
function useRouteMeta() {
  const pathname = usePathname();
  const match = NAV_ITEMS.find(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
  );
  return {
    title: match?.label ?? "AROCO",
  };
}

export function AppShell({
  user,
  children,
}: {
  user: ShellUser;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { title } = useRouteMeta();
  const pathname = usePathname();

  return (
    <CommandPaletteProvider>
      <AssistantProvider>
      <div className="flex h-dvh overflow-hidden">
        {/* Desktop sidebar */}
        <aside
          className="hidden shrink-0 border-r border-border transition-[width] duration-200 lg:block"
          style={{ width: collapsed ? 72 : 256 }}
        >
          <Sidebar
            department={user.department}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((v) => !v)}
          />
        </aside>

        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <motion.div
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={ease}
                onClick={() => setMobileOpen(false)}
              />
              <motion.aside
                className="absolute inset-y-0 left-0 w-64 border-r border-border shadow-[var(--shadow-soft-lg)]"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", stiffness: 420, damping: 40 }}
              >
                <Sidebar
                  department={user.department}
                  collapsed={false}
                  onToggleCollapse={() => {}}
                  onNavigate={() => setMobileOpen(false)}
                />
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            title={title}
            onOpenMobileNav={() => setMobileOpen(true)}
            user={{
              name: user.name,
              department: user.department ?? undefined,
              role: user.role,
            }}
          />
          <main className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={ease}
                className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
      </AssistantProvider>
    </CommandPaletteProvider>
  );
}
