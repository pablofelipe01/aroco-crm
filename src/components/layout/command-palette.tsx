"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  CornerDownLeft,
  Users,
  Boxes,
  FileText,
  Loader2,
} from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { ease } from "@/lib/motion";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/env";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon?: React.ReactNode;
  run: () => void;
}

interface CommandPaletteContextValue {
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const Ctx = React.createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette() {
  const ctx = React.useContext(Ctx);
  if (!ctx)
    throw new Error("useCommandPalette must be used within <CommandPaletteProvider>");
  return ctx;
}

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [results, setResults] = React.useState<Command[]>([]);
  const [searching, setSearching] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const open = React.useCallback(() => setIsOpen(true), []);
  const close = React.useCallback(() => setIsOpen(false), []);
  const toggle = React.useCallback(() => setIsOpen((v) => !v), []);

  // Build the command list. In later phases this will also include
  // leads / lots / quotes pulled from Supabase for instant navigation.
  const commands = React.useMemo<Command[]>(() => {
    const navCommands: Command[] = NAV_ITEMS.map((item) => ({
      id: `nav:${item.href}`,
      label: `Ir a ${item.label}`,
      group: "Navegación",
      icon: <item.icon className="h-4 w-4" />,
      run: () => router.push(item.href),
    }));

    const createCommands: Command[] = [
      {
        id: "new:lead",
        label: "Nuevo lead",
        hint: "Comercial",
        group: "Crear",
        run: () => router.push("/comercial?new=1"),
      },
      {
        id: "new:quote",
        label: "Nueva cotización",
        hint: "Cotizaciones",
        group: "Crear",
        run: () => router.push("/cotizaciones?new=1"),
      },
      {
        id: "new:task",
        label: "Nueva tarea",
        hint: "Tareas",
        group: "Crear",
        run: () => router.push("/tareas?new=1"),
      },
    ];

    return [...navCommands, ...createCommands];
  }, [router]);

  const staticFiltered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.hint ?? ""} ${c.group}`.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Static commands first, then live entity results.
  const filtered = React.useMemo(
    () => [...staticFiltered, ...results],
    [staticFiltered, results],
  );

  // Debounced live search across leads / lots / quotes.
  React.useEffect(() => {
    const q = query.trim();
    /* eslint-disable react-hooks/set-state-in-effect -- live search syncs to Supabase (external system) */
    if (!isOpen || q.length < 2 || !hasSupabaseEnv()) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    const handle = setTimeout(async () => {
      const supabase = createClient();
      const like = `%${q}%`;
      const [leads, lots, quotes] = await Promise.all([
        supabase.from("leads").select("id, company, status").ilike("company", like).limit(5),
        supabase.from("inventory_lots").select("id, code, qty_available_kg").ilike("code", like).limit(5),
        supabase
          .from("quotes")
          .select("id, quote_number, client_name")
          .or(`quote_number.ilike.${like},client_name.ilike.${like}`)
          .limit(5),
      ]);
      if (cancelled) return;
      const out: Command[] = [];
      for (const l of leads.data ?? [])
        out.push({
          id: `lead:${l.id}`,
          label: l.company,
          hint: l.status,
          group: "Leads",
          icon: <Users className="h-4 w-4" />,
          run: () => router.push(`/comercial?lead=${l.id}`),
        });
      for (const lot of lots.data ?? [])
        out.push({
          id: `lot:${lot.id}`,
          label: lot.code,
          hint: `${Math.round(lot.qty_available_kg)} kg`,
          group: "Inventario",
          icon: <Boxes className="h-4 w-4" />,
          run: () => router.push(`/inventario?lot=${lot.id}`),
        });
      for (const qt of quotes.data ?? [])
        out.push({
          id: `quote:${qt.id}`,
          label: qt.quote_number ?? qt.client_name ?? "Cotización",
          hint: qt.client_name ?? undefined,
          group: "Cotizaciones",
          icon: <FileText className="h-4 w-4" />,
          run: () => router.push(`/cotizaciones?quote=${qt.id}`),
        });
      setResults(out);
      setSearching(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, isOpen, router]);

  // Reset on open/close, focus input.
  React.useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset palette state when the overlay opens
      setQuery("");
      setActive(0);
      setResults([]);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const onQueryChange = (value: string) => {
    setQuery(value);
    setActive(0);
  };

  // Global ⌘K / Ctrl+K + Escape.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape" && isOpen) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle, close, isOpen]);

  const runCommand = (c: Command) => {
    close();
    c.run();
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[active];
      if (c) runCommand(c);
    }
  };

  // Group filtered commands preserving order.
  const groups = React.useMemo(() => {
    const map = new Map<string, Command[]>();
    filtered.forEach((c) => {
      const arr = map.get(c.group) ?? [];
      arr.push(c);
      map.set(c.group, arr);
    });
    return Array.from(map.entries());
  }, [filtered]);

  let flatIndex = -1;

  return (
    <Ctx.Provider value={{ open, close, toggle }}>
      {children}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[12vh]">
            <motion.div
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={ease}
              onClick={close}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Paleta de comandos"
              className="relative w-full max-w-xl overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-raised shadow-[var(--shadow-soft-lg)]"
              initial={{ opacity: 0, scale: 0.98, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -8 }}
              transition={{ type: "spring", stiffness: 480, damping: 34 }}
            >
              <div className="flex items-center gap-3 border-b border-border px-4">
                <Search className="h-4 w-4 shrink-0 text-fg-subtle" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  onKeyDown={onInputKey}
                  placeholder="Buscar o saltar a…"
                  className="h-12 w-full bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
                />
                {searching ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-fg-subtle" />
                ) : (
                  <kbd className="hidden rounded border border-border bg-bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle sm:inline">
                    ESC
                  </kbd>
                )}
              </div>
              <div className="max-h-[50vh] overflow-y-auto p-2">
                {groups.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-fg-subtle">
                    Sin resultados para “{query}”.
                  </p>
                )}
                {groups.map(([group, items]) => (
                  <div key={group} className="mb-1">
                    <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                      {group}
                    </p>
                    {items.map((c) => {
                      flatIndex++;
                      const isActive = flatIndex === active;
                      const idx = flatIndex;
                      return (
                        <button
                          key={c.id}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => runCommand(c)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm transition-colors",
                            isActive
                              ? "bg-accent-soft text-accent-soft-fg"
                              : "text-fg hover:bg-bg-subtle",
                          )}
                        >
                          <span className="text-fg-subtle">{c.icon}</span>
                          <span className="flex-1">{c.label}</span>
                          {c.hint && (
                            <span className="text-xs text-fg-subtle">
                              {c.hint}
                            </span>
                          )}
                          {isActive && (
                            <CornerDownLeft className="h-3.5 w-3.5 text-fg-subtle" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 border-t border-border bg-bg-subtle/40 px-4 py-2 text-[11px] text-fg-subtle">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-border bg-surface px-1 font-mono">↑</kbd>
                  <kbd className="rounded border border-border bg-surface px-1 font-mono">↓</kbd>
                  navegar
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-border bg-surface px-1 font-mono">↵</kbd>
                  abrir
                </span>
                <span className="ml-auto">Leads · Inventario · Cotizaciones</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
