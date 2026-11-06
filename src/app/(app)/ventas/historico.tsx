"use client";

import { ExternalLink, LineChart } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";

/**
 * «Histórico Ventas AROCO», el informe de Data Studio (Looker Studio) que pidió
 * el cliente, con sus filtros de fecha, cliente, período, proveedor y departamento.
 *
 * Va incrustado y no rehecho: el informe ya existe y lo mantienen en Data
 * Studio. Para que cargue dentro del CRM el informe necesita «Insertar
 * informe» activado (Archivo → Insertar informe) y que quien lo mira tenga
 * acceso a él con su cuenta de Google. Si no, el marco muestra «Can't access
 * report» y queda el enlace para abrirlo aparte. La inserción se activó el
 * 2026-11-06.
 */
const INFORME = "813efff0-61d1-4a0f-a9eb-466775989f87";
const URL_EMBED = `https://lookerstudio.google.com/embed/reporting/${INFORME}`;
const URL_INFORME = `https://lookerstudio.google.com/reporting/${INFORME}`;

export function HistoricoVentas() {
  const t = useT().ventas;
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <LineChart className="h-4 w-4 text-fg-subtle" />
            {t.historicoTitulo}
          </CardTitle>
          <p className="mt-0.5 text-xs text-fg-muted">{t.historicoDescripcion}</p>
        </div>
        <a
          href={URL_INFORME}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent-soft"
        >
          {t.historicoAbrir}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </CardHeader>
      {/* El lienzo del informe es 600 × 725: el marco guarda esa proporción
          para que se vea entero, sin barra de desplazamiento propia. En un
          celular no baja de 600 px y se desplaza de lado. */}
      <div className="overflow-x-auto">
        <iframe
          src={URL_EMBED}
          title={t.historicoTitulo}
          className="block aspect-[600/725] w-full min-w-[600px] border-0 bg-surface"
          allowFullScreen
          sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          loading="lazy"
        />
      </div>
      <p className="border-t border-border px-5 py-2.5 text-xs text-fg-subtle">{t.historicoAyuda}</p>
    </Card>
  );
}
