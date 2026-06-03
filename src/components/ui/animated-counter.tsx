"use client";

import * as React from "react";
import {
  useMotionValue,
  useTransform,
  animate,
  useInView,
  motion,
} from "framer-motion";

export function AnimatedCounter({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) =>
    new Intl.NumberFormat("es-CO", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(v),
  );

  React.useEffect(() => {
    if (!inView) return;
    const controls = animate(count, value, {
      duration: 1,
      ease: [0.22, 1, 0.36, 1],
    });
    return controls.stop;
  }, [inView, value, count]);

  return (
    <span ref={ref} className="tnum">
      {prefix}
      <motion.span>{rounded}</motion.span>
      {suffix}
    </span>
  );
}
