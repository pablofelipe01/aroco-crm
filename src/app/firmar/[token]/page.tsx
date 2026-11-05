import type { Metadata } from "next";
import { CheckCircle2, CircleSlash, Clock, Download, FileX2, XCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { accesoPorToken, contextoPeticion, huboEvento, registrarEvento, vigencias } from "@/lib/firmas/servidor";
import { textosFirma } from "@/lib/firmas/textos";
import { enmascararCorreo } from "@/lib/firmas/tipos";
import { MarcoFirma } from "@/components/firma/marco-firma";
import { FirmarClient } from "./firmar-client";

export const dynamic = "force-dynamic";

// El enlace es la llave: que no salga en el Referer ni lo indexe nadie.
export const metadata: Metadata = {
  title: "Firma electrónica",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function FirmarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const acceso = await accesoPorToken(admin, token);

  if (acceso.estado === "invalido") {
    const t = textosFirma("es");
    return (
      <MarcoFirma etiqueta={t.marca} pie={t.pie}>
        <Aviso icono={<FileX2 className="h-6 w-6" />} titulo={t.enlaceInvalido} nota={t.enlaceInvalidoNota} />
      </MarcoFirma>
    );
  }

  const { sobre, firmante } = acceso;
  const t = textosFirma(sobre.idioma);

  let contenido: React.ReactNode;
  switch (acceso.estado) {
    case "completo":
      contenido = (
        <Aviso
          tono="ok"
          icono={<CheckCircle2 className="h-6 w-6" />}
          titulo={t.completo}
          nota={t.completoNota}
          accion={
            <a
              href={`/firmar/${token}/firmado`}
              className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent-hover"
            >
              <Download className="h-4 w-4" />
              {t.descargarFirmado}
            </a>
          }
        />
      );
      break;
    case "firmado":
      contenido = <Aviso tono="ok" icono={<CheckCircle2 className="h-6 w-6" />} titulo={t.yaFirmaste} nota={t.yaFirmasteNota} />;
      break;
    case "rechazado":
      contenido = <Aviso icono={<XCircle className="h-6 w-6" />} titulo={t.rechazaste} nota={t.rechazasteNota} />;
      break;
    case "anulado":
      contenido = <Aviso icono={<CircleSlash className="h-6 w-6" />} titulo={t.anulado} nota={t.anuladoNota} />;
      break;
    case "vencido":
      contenido = <Aviso icono={<Clock className="h-6 w-6" />} titulo={t.vencido} nota={t.vencidoNota} />;
      break;
    case "activo": {
      if (!(await huboEvento(admin, firmante.id, "enlace_abierto", 10))) {
        await registrarEvento(admin, {
          sobreId: sobre.id,
          firmanteId: firmante.id,
          tipo: "enlace_abierto",
          ctx: await contextoPeticion(),
        });
      }
      const { verificado, codigoPendiente } = vigencias(firmante);
      contenido = (
        <FirmarClient
          token={token}
          idioma={sobre.idioma === "en" ? "en" : "es"}
          titulo={sobre.titulo}
          codigo={sobre.codigo}
          paginas={sobre.original_paginas}
          mensaje={sobre.mensaje}
          nombre={firmante.nombre}
          documento={firmante.documento ?? ""}
          correo={enmascararCorreo(firmante.email)}
          documentoAbierto={(await huboEvento(admin, firmante.id, "documento_abierto")) > 0}
          verificado={verificado}
          codigoPendiente={codigoPendiente}
        />
      );
      break;
    }
  }

  return (
    <MarcoFirma etiqueta={t.marca} pie={t.pie}>
      {acceso.estado !== "activo" && (
        <p className="mb-4 font-mono text-xs text-fg-subtle tnum">
          {sobre.codigo} · {sobre.titulo}
        </p>
      )}
      {contenido}
    </MarcoFirma>
  );
}

function Aviso({
  icono,
  titulo,
  nota,
  accion,
  tono = "neutro",
}: {
  icono: React.ReactNode;
  titulo: string;
  nota: string;
  accion?: React.ReactNode;
  tono?: "ok" | "neutro";
}) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-lg)] border border-border bg-surface px-6 py-12 text-center">
      <div
        className={
          "mb-4 flex h-12 w-12 items-center justify-center rounded-full " +
          (tono === "ok" ? "bg-success-soft text-success" : "bg-bg-muted text-fg-muted")
        }
      >
        {icono}
      </div>
      <h1 className="text-lg font-semibold text-fg">{titulo}</h1>
      <p className="mt-1 max-w-sm text-sm text-fg-muted">{nota}</p>
      {accion && <div className="mt-6">{accion}</div>}
    </div>
  );
}
