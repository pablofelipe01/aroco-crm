"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, FileText, Loader2, Mail, PenLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { textosFirma } from "@/lib/firmas/textos";
import { enviarCodigo, firmar, rechazar, verificarCodigo } from "./actions";

type Props = {
  token: string;
  idioma: "es" | "en";
  titulo: string;
  codigo: string;
  paginas: number;
  mensaje: string | null;
  nombre: string;
  documento: string;
  correo: string;
  documentoAbierto: boolean;
  verificado: boolean;
  codigoPendiente: boolean;
};

export function FirmarClient(p: Props) {
  const t = textosFirma(p.idioma);
  const router = useRouter();
  const urlDoc = `/firmar/${p.token}/documento`;

  const [abierto, setAbierto] = React.useState(p.documentoAbierto);
  const [verificado, setVerificado] = React.useState(p.verificado);
  const [codigoEnviado, setCodigoEnviado] = React.useState(p.codigoPendiente);
  const [codigo, setCodigo] = React.useState("");
  const [nombre, setNombre] = React.useState(p.nombre);
  const [documento, setDocumento] = React.useState(p.documento);
  const [modo, setModo] = React.useState<"dibujada" | "escrita">("dibujada");
  const [trazo, setTrazo] = React.useState<string | null>(null);
  const [acepta, setAcepta] = React.useState(false);
  const [ocupado, setOcupado] = React.useState<null | "codigo" | "verificar" | "firmar" | "rechazar">(null);
  const [error, setError] = React.useState<string | null>(null);
  const [rechazando, setRechazando] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");

  async function correr(que: NonNullable<typeof ocupado>, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setOcupado(que);
    setError(null);
    try {
      const r = await fn();
      if (!r.ok) setError(r.error ?? null);
      return r.ok;
    } catch {
      setError(p.idioma === "en" ? "Connection problem. Try again." : "Problema de conexión. Intenta de nuevo.");
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function onFirmar() {
    if (!abierto) return setError(t.primeroAbre);
    if (!verificado) return setError(t.primeroVerifica);
    if (modo === "dibujada" && !trazo) return setError(t.faltaFirma);
    if (!acepta) return setError(t.faltaConsentimiento);
    const ok = await correr("firmar", () =>
      firmar(p.token, { nombre, documento, modo, firmaPng: modo === "dibujada" ? trazo : null, consentimiento: acepta }),
    );
    if (ok) router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="font-mono text-xs text-fg-subtle tnum">{p.codigo}</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-fg">{p.titulo}</h1>
        <p className="mt-2 text-sm text-fg-muted">
          {t.saludo(p.nombre.split(" ")[0])}. {t.teEnvia}
        </p>
        {p.mensaje && (
          <blockquote className="mt-3 border-l-2 border-border-strong pl-3 text-sm whitespace-pre-line text-fg-muted">
            {p.mensaje}
          </blockquote>
        )}
      </div>

      {/* 1 · Documento */}
      <Paso n={1} titulo={t.paso1} hecho={abierto} nota={abierto ? t.documentoAbierto : t.paso1Nota}>
        <div className="hidden overflow-hidden rounded-[var(--radius-md)] border border-border sm:block">
          <iframe
            src={urlDoc}
            title={p.titulo}
            className="h-[28rem] w-full bg-bg-subtle"
            onLoad={() => setAbierto(true)}
          />
        </div>
        <a
          href={urlDoc}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setAbierto(true)}
          className="inline-flex h-10 items-center gap-2 self-start rounded-[var(--radius-md)] border border-border bg-surface px-4 text-sm font-medium text-fg hover:bg-bg-subtle"
        >
          <FileText className="h-4 w-4" />
          {t.abrirDocumento}
          <span className="text-xs text-fg-subtle">· {t.paginas(p.paginas)}</span>
          <ExternalLink className="h-3.5 w-3.5 text-fg-subtle" />
        </a>
      </Paso>

      {/* 2 · Identidad */}
      <Paso n={2} titulo={t.paso2} hecho={verificado} nota={verificado ? t.identidadOk : t.paso2Nota(p.correo)}>
        {!verificado && (
          <div className="flex flex-col gap-3">
            {codigoEnviado && (
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await correr("verificar", () => verificarCodigo(p.token, codigo))) setVerificado(true);
                }}
              >
                <Input
                  aria-label={t.codigo}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  className="w-36 text-center font-mono text-lg tracking-[0.3em] tnum"
                />
                <Button type="submit" disabled={codigo.replace(/\D/g, "").length !== 6 || !!ocupado}>
                  {ocupado === "verificar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {t.verificar}
                </Button>
              </form>
            )}
            <Button
              variant={codigoEnviado ? "ghost" : "secondary"}
              size={codigoEnviado ? "sm" : "md"}
              className="self-start"
              disabled={!!ocupado}
              onClick={async () => {
                if (await correr("codigo", () => enviarCodigo(p.token))) setCodigoEnviado(true);
              }}
            >
              {ocupado === "codigo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {codigoEnviado ? t.reenviarCodigo : t.enviarCodigo}
            </Button>
          </div>
        )}
      </Paso>

      {/* 3 · Firma */}
      <Paso n={3} titulo={t.paso3} hecho={false} deshabilitado={!abierto || !verificado}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
            {t.nombreCompleto}
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
            {t.documento}
            <Input value={documento} onChange={(e) => setDocumento(e.target.value)} />
          </label>
        </div>

        {modo === "dibujada" ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-fg-muted">{t.dibujaFirma}</span>
            <PadFirma onCambio={setTrazo} textoBorrar={t.borrar} etiqueta={t.dibujaFirma} />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-fg-muted">{t.firmaEscritaNota}</span>
            <div className="flex h-24 items-center rounded-[var(--radius-md)] border border-border bg-surface px-5">
              <span className="truncate text-2xl text-fg italic">{nombre}</span>
            </div>
          </div>
        )}
        <button
          type="button"
          className="self-start text-xs text-accent underline-offset-2 hover:underline"
          onClick={() => setModo(modo === "dibujada" ? "escrita" : "dibujada")}
        >
          {modo === "dibujada" ? t.usarEscrita : t.usarDibujada}
        </button>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] bg-bg-subtle p-3 text-sm text-fg">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
            checked={acepta}
            onChange={(e) => setAcepta(e.target.checked)}
          />
          <span>{t.consentimiento}</span>
        </label>

        <Button size="lg" onClick={onFirmar} disabled={!!ocupado || !abierto || !verificado}>
          {ocupado === "firmar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
          {t.firmar}
        </Button>
      </Paso>

      {error && (
        <p role="alert" className="rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="border-t border-border pt-4">
        {!rechazando ? (
          <button
            type="button"
            className="text-xs text-fg-subtle underline-offset-2 hover:text-fg-muted hover:underline"
            onClick={() => setRechazando(true)}
          >
            {t.rechazar}
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
              {t.motivoRechazo}
              <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </label>
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                disabled={!!ocupado}
                onClick={async () => {
                  if (await correr("rechazar", () => rechazar(p.token, motivo))) router.refresh();
                }}
              >
                {t.confirmarRechazo}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRechazando(false)}>
                {t.cancelar}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Paso({
  n,
  titulo,
  nota,
  hecho,
  deshabilitado,
  children,
}: {
  n: number;
  titulo: string;
  nota?: string;
  hecho: boolean;
  deshabilitado?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-opacity sm:p-5",
        deshabilitado && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-medium",
            hecho ? "bg-success text-white" : "bg-accent-soft text-accent-soft-fg",
          )}
        >
          {hecho ? <Check className="h-4 w-4" /> : n}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-fg">{titulo}</h2>
          {nota && <p className={cn("text-xs", hecho ? "text-success" : "text-fg-muted")}>{nota}</p>}
        </div>
      </div>
      {children && <div className="flex flex-col gap-3 sm:pl-10">{children}</div>}
    </section>
  );
}

/**
 * Recuadro para dibujar la firma con el dedo, el mouse o un lápiz.
 *
 * Siempre claro, en modo oscuro también: es «el papel» y la tinta oscura es la
 * que termina en el PDF. Por eso el fondo y la tinta no van con tokens del
 * tema.
 */
function PadFirma({
  onCambio,
  textoBorrar,
  etiqueta,
}: {
  onCambio: (png: string | null) => void;
  textoBorrar: string;
  etiqueta: string;
}) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const dibujando = React.useRef(false);
  const ultimo = React.useRef<{ x: number; y: number } | null>(null);
  const trazos = React.useRef(0);

  React.useEffect(() => {
    const c = ref.current!;
    const ajustar = () => {
      const r = c.getBoundingClientRect();
      // Hasta 2×: más resolución solo engorda el PNG que viaja por una red lenta.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const ctx = c.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#1c1917";
      trazos.current = 0;
      onCambio(null);
    };
    ajustar();
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, [onCambio]);

  const punto = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div className="flex flex-col gap-1">
      <canvas
        ref={ref}
        role="img"
        aria-label={etiqueta}
        className="h-40 w-full touch-none rounded-[var(--radius-md)] border border-dashed border-border-strong bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dibujando.current = true;
          ultimo.current = punto(e);
          const ctx = ref.current!.getContext("2d")!;
          ctx.beginPath();
          ctx.arc(ultimo.current.x, ultimo.current.y, 1.1, 0, Math.PI * 2);
          ctx.fillStyle = "#1c1917";
          ctx.fill();
        }}
        onPointerMove={(e) => {
          if (!dibujando.current || !ultimo.current) return;
          const ctx = ref.current!.getContext("2d")!;
          const p = punto(e);
          ctx.beginPath();
          ctx.moveTo(ultimo.current.x, ultimo.current.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ultimo.current = p;
        }}
        onPointerUp={() => {
          if (!dibujando.current) return;
          dibujando.current = false;
          trazos.current += 1;
          onCambio(ref.current!.toDataURL("image/png"));
        }}
        onPointerCancel={() => {
          dibujando.current = false;
        }}
      />
      <button
        type="button"
        className="self-end text-xs text-fg-subtle hover:text-fg"
        onClick={() => {
          const c = ref.current!;
          c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
          trazos.current = 0;
          onCambio(null);
        }}
      >
        {textoBorrar}
      </button>
    </div>
  );
}
