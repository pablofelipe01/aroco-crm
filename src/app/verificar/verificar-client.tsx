"use client";

import * as React from "react";
import { CheckCircle2, FileSearch, Loader2, ShieldAlert, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { consultarHuella, type ResultadoHuella } from "./actions";

/** Fecha y hora de Colombia, igual que en el certificado. */
function fecha(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function VerificarClient() {
  const [estado, setEstado] = React.useState<
    | { fase: "inicio" }
    | { fase: "calculando"; nombre: string }
    | { fase: "listo"; nombre: string; huella: string; r: ResultadoHuella }
    | { fase: "error"; mensaje: string }
  >({ fase: "inicio" });
  const [encima, setEncima] = React.useState(false);

  async function revisar(archivo: File | undefined) {
    if (!archivo) return;
    setEstado({ fase: "calculando", nombre: archivo.name });
    try {
      // La huella se calcula aquí, en el navegador: el PDF no se sube a ningún lado.
      const buf = await archivo.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buf);
      const huella = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
      const r = await consultarHuella(huella);
      setEstado({ fase: "listo", nombre: archivo.name, huella, r });
    } catch {
      setEstado({ fase: "error", mensaje: "No se pudo leer el archivo. · Could not read the file." });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-fg">Verificar un documento firmado</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Sube el PDF y comprobamos si es idéntico al que se firmó con AROCO. El archivo no sale de tu
          dispositivo: solo se compara su huella digital (SHA-256).
        </p>
        <p className="mt-1 text-xs text-fg-subtle">
          Upload the PDF to check whether it is identical to the one signed with AROCO. The file never
          leaves your device: only its SHA-256 fingerprint is compared.
        </p>
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setEncima(false);
          revisar(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed px-6 py-10 text-center transition-colors",
          encima ? "border-accent bg-accent-soft" : "border-border-strong bg-surface hover:bg-bg-subtle",
        )}
      >
        {estado.fase === "calculando" ? (
          <Loader2 className="h-6 w-6 animate-spin text-fg-muted" />
        ) : (
          <Upload className="h-6 w-6 text-fg-muted" />
        )}
        <span className="text-sm font-medium text-fg">Elegir PDF · Choose PDF</span>
        <span className="text-xs text-fg-subtle">o arrástralo aquí · or drop it here</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => revisar(e.target.files?.[0])}
        />
      </label>

      {estado.fase === "error" && (
        <p role="alert" className="rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-sm text-danger">
          {estado.mensaje}
        </p>
      )}

      {estado.fase === "listo" && (
        <div role="status" className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
          {estado.r.encontrado && estado.r.cual === "firmado" ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div className="min-w-0">
                <p className="font-semibold text-fg">Documento auténtico · Authentic document</p>
                <p className="mt-1 text-sm text-fg-muted">
                  Coincide exactamente con <span className="font-mono tnum">{estado.r.codigo}</span>, «
                  {estado.r.titulo}», firmado por todos el {fecha(estado.r.completadoEn)}.
                </p>
                <ul className="mt-3 flex flex-col gap-1 text-sm">
                  {estado.r.firmantes.map((f, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-x-4 text-fg">
                      <span>{f.nombre}</span>
                      <span className="font-mono text-xs text-fg-subtle tnum">{fecha(f.firmadoEn)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : estado.r.encontrado ? (
            <div className="flex items-start gap-3">
              <FileSearch className="mt-0.5 h-5 w-5 shrink-0 text-info" />
              <div>
                <p className="font-semibold text-fg">Es el original sin firmar · Unsigned original</p>
                <p className="mt-1 text-sm text-fg-muted">
                  Este archivo es el que se envió a firma en{" "}
                  <span className="font-mono tnum">{estado.r.codigo}</span> («{estado.r.titulo}»). La copia
                  firmada es otro PDF, con el certificado al final.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
              <div>
                <p className="font-semibold text-fg">No coincide · No match</p>
                <p className="mt-1 text-sm text-fg-muted">
                  Este PDF no es idéntico a ningún documento firmado con AROCO. Si lo editaste, lo
                  imprimiste o lo guardaste de nuevo, la huella cambia: verifica la copia que llegó por
                  correo.
                </p>
              </div>
            </div>
          )}
          <p className="mt-4 font-mono text-[11px] break-all text-fg-subtle tnum">
            {estado.nombre} · SHA-256 {estado.huella}
          </p>
        </div>
      )}
    </div>
  );
}
