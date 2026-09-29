"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Cada cuánto se intenta registrar. Menor que un minuto para no saltarse ninguno. */
const CADA_MS = 30_000;
/** Sin tocar nada en este tiempo, la pestaña abierta deja de contar como uso. */
const INACTIVO_MS = 2 * 60_000;

/**
 * Registra el tiempo de uso del CRM: un minuto por persona mientras la pestaña
 * está visible y la persona hizo algo hace poco (tablero de uso, 0097).
 *
 * Sin la condición de interacción, una pestaña olvidada abierta todo el día
 * sumaría ocho horas. El servidor fija usuario y minuto, y un minuto repetido
 * no cuenta dos veces, así que dos pestañas abiertas tampoco duplican.
 *
 * No pinta nada. Un fallo de red se ignora: perder un minuto de medición es
 * mejor que molestar a quien está trabajando.
 */
export function Latido() {
  const pathname = usePathname();
  const modulo = pathname.split("/")[1] || "inicio";
  const moduloRef = React.useRef(modulo);
  // 0 = aún no hay interacción; el efecto de abajo lo fija al montar.
  const ultimaInteraccion = React.useRef(0);

  const latir = React.useCallback(() => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - ultimaInteraccion.current > INACTIVO_MS) return;
    void createClient()
      .rpc("registrar_latido", { p_modulo: moduloRef.current })
      .then(
        () => undefined,
        () => undefined,
      );
  }, []);

  React.useEffect(() => {
    const tocar = () => {
      ultimaInteraccion.current = Date.now();
    };
    const eventos = ["pointerdown", "pointermove", "keydown", "scroll", "wheel", "touchstart"] as const;
    for (const e of eventos) window.addEventListener(e, tocar, { passive: true });

    const alVolver = () => {
      if (document.visibilityState === "visible") {
        tocar();
        latir();
      }
    };
    document.addEventListener("visibilitychange", alVolver);

    const id = window.setInterval(latir, CADA_MS);
    return () => {
      for (const e of eventos) window.removeEventListener(e, tocar);
      document.removeEventListener("visibilitychange", alVolver);
      window.clearInterval(id);
    };
  }, [latir]);

  // Cambiar de módulo es interacción: cuenta el minuto en el módulo nuevo.
  React.useEffect(() => {
    moduloRef.current = modulo;
    ultimaInteraccion.current = Date.now();
    latir();
  }, [modulo, latir]);

  return null;
}
