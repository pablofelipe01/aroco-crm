"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  // Hydration gate (documented next-themes pattern): the resolved theme is
  // only known on the client, so we defer the icon until after mount.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client mount gate
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Activar modo claro" : "Activar modo oscuro"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {mounted && (
          <motion.span
            key={isDark ? "moon" : "sun"}
            initial={{ rotate: -45, opacity: 0, scale: 0.6 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 45, opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.18 }}
          >
            {isDark ? (
              <Moon className="h-[18px] w-[18px]" />
            ) : (
              <Sun className="h-[18px] w-[18px]" />
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
