"use client";

import * as React from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { cn } from "@/lib/utils";

/*
 * Efectos ligados al scroll (revisión del 2026-10-30, muestra en Comercial).
 *
 * La página no se desplaza en `window` sino en el <main> del shell, así que
 * todo mide contra ese <main>. Con «reducir movimiento» activo no hay
 * desplazamientos ni escalas: solo queda lo que no se mueve (sombras, fondo).
 */

/** Scroll vertical del <main> que contiene a `ref`, como MotionValue. */
function useScrollMain(ref: React.RefObject<HTMLElement | null>): MotionValue<number> {
  const y = useMotionValue(0);
  React.useEffect(() => {
    const main = ref.current?.closest("main");
    if (!main) return;
    const m = main;
    const leer = () => y.set(m.scrollTop);
    leer();
    m.addEventListener("scroll", leer, { passive: true });
    return () => m.removeEventListener("scroll", leer);
  }, [ref, y]);
  return y;
}

/**
 * Envoltura del encabezado de página: al bajar se desvanece y se encoge un
 * poco mientras sale por arriba. El título ya está en la barra superior, así
 * que no se pierde de vista.
 */
export function EncabezadoScroll({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reducir = useReducedMotion();
  const scroll = useScrollMain(ref);
  // 0 → 96 px de scroll: lo que mide más o menos un encabezado.
  const opacity = useTransform(scroll, [0, 96], [1, 0]);
  const scale = useTransform(scroll, [0, 96], [1, 0.97]);
  const y = useTransform(scroll, [0, 96], [0, 12]);
  return (
    <motion.div
      ref={ref}
      style={reducir ? undefined : { opacity, scale, y, transformOrigin: "left bottom" }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Barra fija arriba (filtros) que se nota cuando queda pegada: fondo
 * translúcido con desenfoque y sombra suave. Suelta se ve plana, como antes.
 * Lleva `data-fijo-encima` para que ScrollFijo se pare bajo ella.
 */
export function BarraFija({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [fijada, setFijada] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    const main = el?.closest("main");
    if (!el || !main) return;
    const b = el;
    const m = main;
    function medir() {
      const pegada =
        getComputedStyle(b).position === "sticky" &&
        m.scrollTop > 0 &&
        b.getBoundingClientRect().top - m.getBoundingClientRect().top <= 1;
      setFijada(pegada);
    }
    medir();
    m.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    return () => {
      m.removeEventListener("scroll", medir);
      window.removeEventListener("resize", medir);
    };
  }, []);

  return (
    <div
      ref={ref}
      data-fijo-encima
      data-fijada={fijada || undefined}
      className={cn(
        // -mx-3/px-3 siempre, para que al pegarse cambie solo el aspecto y no
        // se corra nada de lugar.
        "z-20 -mx-3 rounded-[var(--radius-lg)] border border-transparent bg-bg-base px-3 py-2 transition-[background-color,box-shadow,border-color] duration-200 sm:sticky sm:top-0",
        "data-[fijada]:border-border data-[fijada]:bg-bg-base/80 data-[fijada]:shadow-[var(--shadow-soft-md)] data-[fijada]:backdrop-blur-md",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Aparece con un fundido y un leve deslizamiento al entrar en pantalla. */
export function Revelar({
  className,
  children,
  retraso = 0,
}: {
  className?: string;
  children: React.ReactNode;
  /** Segundos; para escalonar bloques vecinos. */
  retraso?: number;
}) {
  const reducir = useReducedMotion();
  if (reducir) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1], delay: retraso }}
    >
      {children}
    </motion.div>
  );
}
