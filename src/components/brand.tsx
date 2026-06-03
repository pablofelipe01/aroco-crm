import { cn } from "@/lib/utils";

/** AROCO cacao-pod mark — a simple, scalable inline SVG. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-7 w-7", className)}
      aria-hidden
      fill="none"
    >
      <defs>
        <linearGradient id="aroco-pod" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent-mid)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <path
        d="M16 2c5 3 8 8 8 14s-3 11-8 14c-5-3-8-8-8-14S11 5 16 2Z"
        fill="url(#aroco-pod)"
      />
      <path
        d="M16 5v22M12 9c2 1.5 2 13 0 14M20 9c-2 1.5-2 13 0 14"
        stroke="var(--accent-fg)"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Logo />
      <div className="leading-none">
        <span className="text-base font-bold tracking-tight text-fg">
          AROCO
        </span>
        <span className="ml-1 font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
          cacao
        </span>
      </div>
    </div>
  );
}
