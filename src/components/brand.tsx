import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Square AROCO monogram — a serif "a" + accent dot on a cacao tile, echoing the
 * official wordmark. Used in compact spots (collapsed sidebar, etc.). Colours
 * come from the brand tokens so it stays consistent across themes.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--brand-cocoa)" />
      <text
        x="15.5"
        y="24.5"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="24"
        fill="var(--brand-tan)"
      >
        a
      </text>
      <circle cx="25" cy="8.5" r="2.4" fill="var(--brand-tan)" />
    </svg>
  );
}

/**
 * Official AROCO wordmark (transparent PNG). Rendered with a fixed height and
 * automatic width so it never stretches or distorts, regardless of container.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/aroco-logo.png"
      alt="AROCO — aroma colombiano"
      width={408}
      height={134}
      priority
      className={cn("h-9 w-auto", className)}
    />
  );
}
