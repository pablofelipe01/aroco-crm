"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Download,
  Link2,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { colorDeArea } from "@/lib/areas";
import { initials } from "@/lib/utils";
import {
  NOMBRE_ESTADO_FIRMANTE,
  NOMBRE_ESTADO_SOBRE,
  NOMBRE_EVENTO,
  NOMBRE_TIPO,
  type EstadoFirmante,
  type EstadoSobre,
  type TipoSobre,
} from "@/lib/firmas/tipos";
import { anularSobre, enviarSobre, nuevoEnlace, reintentarCierre, urlArchivo } from "../actions";
import { EnlacesModal, type EnlaceFirma } from "../enlaces";
import { TONO_ESTADO } from "../firmas-client";

type Sobre = {
  id: string;
  codigo: string;
  titulo: string;
  tipo: string;
  idioma: string;
  mensaje: string | null;
  estado: string;
  enOrden: boolean;
  originalNombre: string;
  originalSha256: string;
  paginas: number;
  firmadoSha256: string | null;
  creadoEn: string;
  enviadoEn: string | null;
  completadoEn: string | null;
  venceEn: string | null;
  motivoAnulacion: string | null;
  creador: string;
};
type Firmante = {
  id: string;
  orden: number;
  nombre: string;
  email: string;
  rol: string | null;
  estado: string;
  notificadoEn: string | null;
  verificadoEn: string | null;
  firmadoEn: string | null;
  nombreFirmado: string | null;
  documentoFirmado: string | null;
  firmadoIp: string | null;
  rechazadoEn: string | null;
  motivoRechazo: string | null;
};
type Evento = {
  id: number;
  tipo: string;
  firmanteId: string | null;
  ocurridoEn: string;
  ip: string | null;
  detalle: unknown;
  hash: string;
};

const TONO_FIRMANTE: Record<string, BadgeTone> = {
  pendiente: "neutral",
  notificado: "info",
  firmado: "success",
  rechazado: "danger",
};

const cuando = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-CO", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Bogota",
      }).format(new Date(iso))
    : "—";

export function DetalleSobre({
  sobre,
  firmantes,
  eventos,
  cadenaIntegra,
}: {
  sobre: Sobre;
  firmantes: Firmante[];
  eventos: Evento[];
  cadenaIntegra: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [ocupado, setOcupado] = React.useState<string | null>(null);
  const [enlaces, setEnlaces] = React.useState<EnlaceFirma[]>([]);
  const [anulando, setAnulando] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");

  const nombres = new Map(firmantes.map((f) => [f.id, f.nombreFirmado ?? f.nombre]));
  const todosFirmaron = firmantes.length > 0 && firmantes.every((f) => f.estado === "firmado");
  const cierreFallido = sobre.estado === "enviado" && todosFirmaron;

  async function correr<T extends { ok: boolean; error?: string }>(
    clave: string,
    fn: () => Promise<T>,
    exito?: string,
  ): Promise<T | null> {
    setOcupado(clave);
    try {
      const r = await fn();
      if (!r.ok) {
        toast({ tone: "error", title: "No se pudo", description: r.error });
        return null;
      }
      if (exito) toast({ tone: "success", title: exito });
      router.refresh();
      return r;
    } finally {
      setOcupado(null);
    }
  }

  async function descargar(cual: "original" | "firmado") {
    const r = await correr(cual, () => urlArchivo(sobre.id, cual));
    if (r && "url" in r) window.location.href = r.url as string;
  }

  const puedeAnular = sobre.estado === "borrador" || sobre.estado === "enviado";

  return (
    <div className="flex flex-col gap-5">
      <Link href="/firmas" className="inline-flex items-center gap-1 self-start text-xs text-fg-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Firmas
      </Link>
      <PageHeader
        className="mb-0"
        title={sobre.titulo}
        description={`${sobre.codigo} · ${NOMBRE_TIPO[sobre.tipo as TipoSobre]?.es ?? sobre.tipo} · ${sobre.idioma === "en" ? "en inglés" : "en español"} · creado por ${sobre.creador}`}
        actions={
          <>
            {sobre.estado === "completado" && (
              <Button onClick={() => descargar("firmado")} disabled={!!ocupado}>
                {ocupado === "firmado" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                PDF firmado
              </Button>
            )}
            {sobre.estado === "borrador" && (
              <Button
                onClick={async () => {
                  const r = await correr("enviar", () => enviarSobre(sobre.id), "Sobre enviado a firma");
                  if (r && "enlaces" in r) setEnlaces(r.enlaces as EnlaceFirma[]);
                }}
                disabled={!!ocupado}
              >
                {ocupado === "enviar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar a firma
              </Button>
            )}
            {cierreFallido && (
              <Button onClick={() => correr("cierre", () => reintentarCierre(sobre.id), "PDF sellado")} disabled={!!ocupado}>
                {ocupado === "cierre" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sellar PDF
              </Button>
            )}
            <Button variant="secondary" onClick={() => descargar("original")} disabled={!!ocupado}>
              <Download className="h-4 w-4" />
              Original
            </Button>
            {puedeAnular && (
              <Button variant="ghost" onClick={() => setAnulando(true)} disabled={!!ocupado}>
                <Ban className="h-4 w-4" />
                Anular
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        <Badge tone={TONO_ESTADO[sobre.estado] ?? "neutral"}>{NOMBRE_ESTADO_SOBRE[sobre.estado as EstadoSobre] ?? sobre.estado}</Badge>
        {sobre.enviadoEn && <span>Enviado {cuando(sobre.enviadoEn)}</span>}
        {sobre.estado === "enviado" && sobre.venceEn && <span>· vence {cuando(sobre.venceEn)}</span>}
        {sobre.completadoEn && <span>· firmado por todos {cuando(sobre.completadoEn)}</span>}
        <span>· {sobre.enOrden ? "en orden" : "en paralelo"}</span>
      </div>
      {sobre.estado === "anulado" && sobre.motivoAnulacion && (
        <p className="rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-sm text-danger">Anulado: {sobre.motivoAnulacion}</p>
      )}
      {cierreFallido && (
        <p className="rounded-[var(--radius-md)] bg-warn-soft px-3 py-2 text-sm text-warn">
          Firmaron todos pero el PDF no se alcanzó a sellar. Usa «Sellar PDF» para terminarlo.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Firmantes</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-border">
            {firmantes.map((f) => (
              <li key={f.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-medium text-white"
                    style={{ backgroundColor: colorDeArea(null) }}
                  >
                    {initials(f.nombre)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">
                      {sobre.enOrden && <span className="mr-1 font-mono text-xs text-fg-subtle tnum">{f.orden}.</span>}
                      {f.nombre}
                      {f.rol && <span className="ml-1.5 text-xs font-normal text-fg-muted">· {f.rol}</span>}
                    </p>
                    <p className="truncate text-xs text-fg-muted">{f.email}</p>
                    {f.estado === "firmado" && (
                      <p className="mt-1 text-xs text-fg-muted">
                        Firmó como <span className="text-fg">{f.nombreFirmado}</span>
                        {f.documentoFirmado && <> · {f.documentoFirmado}</>} · {cuando(f.firmadoEn)}
                        {f.firmadoIp && <span className="font-mono tnum"> · IP {f.firmadoIp}</span>}
                      </p>
                    )}
                    {f.estado === "rechazado" && (
                      <p className="mt-1 text-xs text-danger">
                        Rechazó {cuando(f.rechazadoEn)}
                        {f.motivoRechazo && <>: «{f.motivoRechazo}»</>}
                      </p>
                    )}
                    {f.estado === "notificado" && (
                      <p className="mt-1 text-xs text-fg-muted">
                        Enlace enviado {cuando(f.notificadoEn)}
                        {f.verificadoEn && <> · identidad verificada {cuando(f.verificadoEn)}</>}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
                  <Badge tone={TONO_FIRMANTE[f.estado] ?? "neutral"}>
                    {NOMBRE_ESTADO_FIRMANTE[f.estado as EstadoFirmante] ?? f.estado}
                  </Badge>
                  {sobre.estado === "enviado" && f.estado === "notificado" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Genera un enlace nuevo (el anterior deja de servir) y lo reenvía por correo"
                      disabled={!!ocupado}
                      onClick={async () => {
                        const r = await correr(f.id, () => nuevoEnlace(f.id));
                        if (r && "enlace" in r) setEnlaces([r.enlace as EnlaceFirma]);
                      }}
                    >
                      {ocupado === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                      Nuevo enlace
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integridad</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-3 text-xs">
            <p className={`flex items-center gap-1.5 text-sm ${cadenaIntegra ? "text-success" : "text-danger"}`}>
              {cadenaIntegra ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              {cadenaIntegra ? "Registro de eventos íntegro" : "El registro de eventos no cuadra"}
            </p>
            <Huella etiqueta={`Original · ${sobre.originalNombre} · ${sobre.paginas} pág.`} valor={sobre.originalSha256} />
            {sobre.firmadoSha256 && <Huella etiqueta="PDF firmado" valor={sobre.firmadoSha256} />}
            {sobre.mensaje && (
              <div>
                <p className="text-fg-subtle">Mensaje del correo</p>
                <p className="mt-0.5 whitespace-pre-line text-fg-muted">{sobre.mensaje}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registro de eventos</CardTitle>
        </CardHeader>
        <ol className="divide-y divide-border">
          {eventos.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 px-5 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-4">
              <span className="w-32 shrink-0 font-mono text-xs text-fg-subtle tnum">{cuando(e.ocurridoEn)}</span>
              <span className="min-w-0 flex-1 text-fg">
                {NOMBRE_EVENTO[e.tipo] ?? e.tipo}
                {e.firmanteId && <span className="text-fg-muted"> · {nombres.get(e.firmanteId)}</span>}
                <DetalleEvento detalle={e.detalle} />
              </span>
              <span className="shrink-0 font-mono text-[11px] text-fg-subtle tnum">{e.ip ?? ""}</span>
            </li>
          ))}
        </ol>
      </Card>

      <EnlacesModal enlaces={enlaces} onClose={() => setEnlaces([])} />

      <Modal
        open={anulando}
        onClose={() => setAnulando(false)}
        title="Anular sobre"
        description="Los enlaces dejan de servir y nadie más puede firmar. No se puede deshacer."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAnulando(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={motivo.trim().length < 3 || !!ocupado}
              onClick={async () => {
                if (await correr("anular", () => anularSobre(sobre.id, motivo), "Sobre anulado")) setAnulando(false);
              }}
            >
              Anular
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
          Motivo
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
      </Modal>
    </div>
  );
}

function Huella({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-fg-subtle">{etiqueta}</p>
      <p className="mt-0.5 font-mono text-[11px] break-all text-fg-muted tnum">SHA-256 {valor}</p>
    </div>
  );
}

/** Lo útil del detalle: por qué falló un correo, el motivo de un rechazo. */
function DetalleEvento({ detalle }: { detalle: unknown }) {
  const d = (detalle ?? {}) as Record<string, unknown>;
  const texto = (d.error ?? d.motivo ?? d.email ?? d.destino) as string | undefined;
  if (!texto || typeof texto !== "string") return null;
  return <span className="block truncate text-xs text-fg-subtle sm:inline sm:before:content-['_·_']">{texto}</span>;
}
