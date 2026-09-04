"use client";

import * as React from "react";
import { Check, Clock, Eye, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { seguimientoAprobacion, type SeguimientoAprobador } from "./actions";

/**
 * A quién se le mandó la solicitud y quién falta por decidir.
 *
 * Pedido en la revisión del 1-sep-2026. El aviso a los aprobadores existía
 * desde 0055, pero no se veía en ninguna pantalla: quien pedía algo miraba un
 * «Pendiente» sin saber si le había llegado a alguien, a quién, ni desde
 * cuándo. Un estado que no dice de quién depende no es seguimiento.
 *
 * Basta con que UNO apruebe —así funciona el módulo—, así que los demás no
 * están «faltando»: están enterados y sin actuar. Por eso la etiqueta dice
 * «sin decidir» y no «pendiente de él», que sonaría a reclamo.
 */

/** Días completos entre una fecha y hoy. */
function diasDesde(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function Espera({ desde }: { desde: string }) {
  const dias = diasDesde(desde);
  if (dias === 0) return <>hoy</>;
  if (dias === 1) return <>hace 1 día</>;
  return <>hace {dias} días</>;
}

export function SeguimientoAprobacion({
  solicitudId,
  estado,
  enviadaEn,
}: {
  solicitudId: string;
  estado: string;
  enviadaEn: string | null;
}) {
  const [datos, setDatos] = React.useState<SeguimientoAprobador[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [prevId, setPrevId] = React.useState(solicitudId);
  if (solicitudId !== prevId) {
    setPrevId(solicitudId);
    setDatos(null);
    setError(null);
  }

  React.useEffect(() => {
    let vigente = true;
    seguimientoAprobacion(solicitudId).then((r) => {
      if (!vigente) return;
      if (!r.ok) {
        setError(r.error ?? "No se pudo cargar el seguimiento.");
        setDatos([]);
        return;
      }
      setDatos(r.aprobadores);
    });
    return () => {
      vigente = false;
    };
  }, [solicitudId]);

  // En borrador todavía no se le envió a nadie: no hay nada que rastrear y un
  // recuadro vacío solo haría pensar que algo falló.
  if (estado === "Borrador") return null;

  const decidida = estado === "Aprobada" || estado === "Rechazada";

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
          Aprobación
        </h3>
        {enviadaEn && (
          <span className="text-xs text-fg-muted">
            Enviada el {formatDate(enviadaEn)}
            {!decidida && (
              <>
                {" · "}
                <Espera desde={enviadaEn} />
              </>
            )}
          </span>
        )}
      </div>

      {error ? (
        // Un fallo aquí no puede verse igual que «no se le mandó a nadie».
        <p className="mt-2 text-xs text-danger">{error}</p>
      ) : datos === null ? (
        <p className="mt-2 text-xs text-fg-subtle">Cargando…</p>
      ) : datos.length === 0 ? (
        <p className="mt-2 text-xs text-fg-subtle">
          No hay nadie con permiso para aprobar compras. Nadie recibió esta
          solicitud.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {datos.map((a) => (
            <li
              key={a.profile_id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="text-fg">{a.nombre}</span>
              <span className="flex items-center gap-2 text-xs text-fg-subtle">
                {a.avisado_en ? (
                  <span className="inline-flex items-center gap-1">
                    {/* Que le llegara y que lo abriera son cosas distintas, y
                        la diferencia es justo lo que se quería ver. */}
                    {a.leido ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <Mail className="h-3 w-3" />
                    )}
                    {a.leido ? "leído" : "avisado"} {formatDate(a.avisado_en)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-warn">
                    <Clock className="h-3 w-3" />
                    sin aviso
                  </span>
                )}
                {a.decidio ? (
                  <Badge tone="success">
                    <Check className="mr-1 h-3 w-3" />
                    decidió
                  </Badge>
                ) : decidida ? null : (
                  <Badge tone="neutral">sin decidir</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
