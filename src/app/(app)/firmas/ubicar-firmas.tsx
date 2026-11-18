"use client";

import * as React from "react";
import { Loader2, MousePointerClick, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RECUADRO_FIRMA, type PosicionFirma } from "@/lib/firmas/tipos";

/**
 * Ubicar la firma de cada firmante sobre el PDF, como en DocuSign. Pedido de
 * Nicolás (2026-11-17): la firma quedaba solo en el certificado del final.
 *
 * Se elige el firmante arriba y se toca la línea de firma en la página; el
 * recuadro se puede arrastrar, mover con las flechas o quitar. Las posiciones
 * van en fracciones de la página (ver `PosicionFirma`), así que no importa el
 * tamaño al que se dibuja aquí.
 */

type Pagina = { ancho: number; alto: number; girada: boolean };
type PdfJs = typeof import("pdfjs-dist");
type Doc = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;

let pdfjsCargado: Promise<PdfJs> | null = null;
function cargarPdfJs(): Promise<PdfJs> {
  pdfjsCargado ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    return m;
  });
  return pdfjsCargado;
}

const MAX_PAGINAS = 40;
const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function UbicarFirmas({
  archivo,
  firmantes,
  posiciones,
  onCambio,
}: {
  archivo: File;
  firmantes: { nombre: string }[];
  posiciones: (PosicionFirma | null)[];
  onCambio: (i: number, p: PosicionFirma | null) => void;
}) {
  // Lo cargado va con su archivo: si cambia el PDF, lo viejo deja de valer sin
  // tener que vaciar el estado dentro del efecto.
  const [carga, setCarga] = React.useState<{
    archivo: File;
    doc: Doc | null;
    paginas: Pagina[];
    error: string | null;
  } | null>(null);
  const [activo, setActivo] = React.useState(0);
  const vigente = carga?.archivo === archivo ? carga : null;
  const doc = vigente?.doc ?? null;
  const paginas = vigente?.paginas ?? [];
  const error = vigente?.error ?? null;

  React.useEffect(() => {
    let vivo = true;
    let tarea: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await cargarPdfJs();
        const t = pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) });
        tarea = t;
        const d = await t.promise;
        const info: Pagina[] = [];
        for (let n = 1; n <= Math.min(d.numPages, MAX_PAGINAS); n++) {
          const p = await d.getPage(n);
          const v = p.getViewport({ scale: 1 });
          info.push({ ancho: v.width, alto: v.height, girada: p.rotate % 360 !== 0 });
        }
        if (vivo) setCarga({ archivo, doc: d, paginas: info, error: null });
      } catch {
        if (vivo) {
          setCarga({ archivo, doc: null, paginas: [], error: "No se pudo mostrar el PDF. Revisa que no tenga contraseña." });
        }
      }
    })();
    return () => {
      vivo = false;
      void tarea?.destroy();
    };
  }, [archivo]);

  const activoValido = Math.min(activo, Math.max(0, firmantes.length - 1));

  function colocar(i: number, pagina: number, cx: number, cy: number) {
    const { w, h } = RECUADRO_FIRMA;
    onCambio(i, {
      pagina,
      x: limitar(cx - w / 2, 0, 1 - w),
      y: limitar(cy - h / 2, 0, 1 - h),
      w,
      h,
    });
    // Pasa solo al siguiente que falte, para ubicar todos de corrido.
    const siguiente = firmantes.findIndex((_, j) => j !== i && !posiciones[j]);
    if (siguiente >= 0) setActivo(siguiente);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Firmante a ubicar">
        {firmantes.map((f, i) => {
          const pos = posiciones[i];
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={activoValido === i}
              onClick={() => setActivo(i)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                activoValido === i
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-border text-fg-muted hover:bg-bg-subtle",
              )}
            >
              <span className="font-mono tnum">{i + 1}</span>
              <span className="max-w-40 truncate">{f.nombre.trim() || "Sin nombre"}</span>
              <span className={cn("font-mono text-[10px] tnum", pos ? "text-success" : "text-fg-subtle")}>
                {pos ? `p. ${pos.pagina}` : "sin ubicar"}
              </span>
            </button>
          );
        })}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
        <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
        Toca la línea de firma de <strong className="font-medium text-fg-muted">
          {firmantes[activoValido]?.nombre.trim() || `el firmante ${activoValido + 1}`}
        </strong>
        . Arrastra el recuadro para ajustarlo. Sin ubicar, la firma va solo en el certificado del final.
      </p>

      {error ? (
        <p role="alert" className="rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : !doc ? (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-fg-subtle">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando el PDF…
        </div>
      ) : (
        <div className="flex max-h-[60vh] flex-col items-center gap-4 overflow-y-auto rounded-[var(--radius-md)] bg-bg-subtle p-3">
          {paginas.map((p, k) => (
            <PaginaPdf
              key={k}
              doc={doc}
              numero={k + 1}
              pagina={p}
              firmantes={firmantes}
              posiciones={posiciones}
              activo={activoValido}
              onColocar={(cx, cy) => colocar(activoValido, k + 1, cx, cy)}
              onCambio={onCambio}
            />
          ))}
          {doc.numPages > MAX_PAGINAS && (
            <p className="text-xs text-fg-subtle">
              Se muestran las primeras {MAX_PAGINAS} páginas de {doc.numPages}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PaginaPdf({
  doc,
  numero,
  pagina,
  firmantes,
  posiciones,
  activo,
  onColocar,
  onCambio,
}: {
  doc: Doc;
  numero: number;
  pagina: Pagina;
  firmantes: { nombre: string }[];
  posiciones: (PosicionFirma | null)[];
  activo: number;
  onColocar: (cx: number, cy: number) => void;
  onCambio: (i: number, p: PosicionFirma | null) => void;
}) {
  const lienzo = React.useRef<HTMLCanvasElement>(null);
  const caja = React.useRef<HTMLDivElement>(null);
  const ancho = 560;
  const alto = (ancho * pagina.alto) / pagina.ancho;

  React.useEffect(() => {
    let tarea: { cancel: () => void; promise: Promise<void> } | null = null;
    let vivo = true;
    (async () => {
      const p = await doc.getPage(numero);
      const c = lienzo.current;
      if (!vivo || !c) return;
      const dpr = window.devicePixelRatio || 1;
      const v = p.getViewport({ scale: (ancho / pagina.ancho) * dpr });
      c.width = Math.floor(v.width);
      c.height = Math.floor(v.height);
      tarea = p.render({ canvas: c, viewport: v });
      await tarea.promise.catch(() => {});
    })();
    return () => {
      vivo = false;
      tarea?.cancel();
    };
  }, [doc, numero, pagina.ancho]);

  // Fracción de la página bajo el puntero.
  const fraccion = (e: { clientX: number; clientY: number }) => {
    const r = caja.current!.getBoundingClientRect();
    return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
  };

  return (
    <div className="flex w-full max-w-[560px] flex-col items-center gap-1">
      <div
        ref={caja}
        className={cn(
          "relative w-full overflow-hidden bg-white shadow-[var(--shadow-soft-sm)]",
          pagina.girada ? "cursor-not-allowed" : "cursor-crosshair",
        )}
        style={{ aspectRatio: `${ancho} / ${alto}` }}
        onClick={(e) => {
          if (pagina.girada || e.target !== e.currentTarget.firstChild) return;
          const { fx, fy } = fraccion(e);
          onColocar(fx, fy);
        }}
      >
        <canvas ref={lienzo} className="block h-full w-full" aria-label={`Página ${numero}`} />
        {pagina.girada && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/70 p-4 text-center text-xs text-fg-muted">
            Esta página está girada: ubica la firma en otra.
          </div>
        )}
        {posiciones.map((pos, i) =>
          pos && pos.pagina === numero ? (
            <Recuadro
              key={i}
              indice={i}
              nombre={firmantes[i]?.nombre ?? ""}
              pos={pos}
              activo={activo === i}
              fraccion={fraccion}
              onCambio={(p) => onCambio(i, p)}
            />
          ) : null,
        )}
      </div>
      <span className="font-mono text-[10px] text-fg-subtle tnum">Página {numero}</span>
    </div>
  );
}

function Recuadro({
  indice,
  nombre,
  pos,
  activo,
  fraccion,
  onCambio,
}: {
  indice: number;
  nombre: string;
  pos: PosicionFirma;
  activo: boolean;
  fraccion: (e: { clientX: number; clientY: number }) => { fx: number; fy: number };
  onCambio: (p: PosicionFirma | null) => void;
}) {
  const agarre = React.useRef<{ dx: number; dy: number } | null>(null);
  const mover = (x: number, y: number) =>
    onCambio({ ...pos, x: limitar(x, 0, 1 - pos.w), y: limitar(y, 0, 1 - pos.h) });

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Firma de ${nombre || `firmante ${indice + 1}`}, página ${pos.pagina}. Flechas para mover, Suprimir para quitar.`}
      className={cn(
        "absolute flex touch-none select-none items-end justify-between gap-1 rounded-[var(--radius-sm)] border-2 border-dashed px-1.5 pb-0.5 text-[10px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        activo ? "border-accent bg-accent-soft/70 text-fg" : "border-fg-subtle bg-surface/70 text-fg-muted",
      )}
      style={{
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        width: `${pos.w * 100}%`,
        height: `${pos.h * 100}%`,
        cursor: "move",
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const { fx, fy } = fraccion(e);
        agarre.current = { dx: fx - pos.x, dy: fy - pos.y };
      }}
      onPointerMove={(e) => {
        if (!agarre.current) return;
        const { fx, fy } = fraccion(e);
        mover(fx - agarre.current.dx, fy - agarre.current.dy);
      }}
      onPointerUp={() => (agarre.current = null)}
      onPointerCancel={() => (agarre.current = null)}
      onKeyDown={(e) => {
        const paso = e.shiftKey ? 0.05 : 0.01;
        const d: Record<string, [number, number]> = {
          ArrowLeft: [-paso, 0],
          ArrowRight: [paso, 0],
          ArrowUp: [0, -paso],
          ArrowDown: [0, paso],
        };
        if (d[e.key]) {
          e.preventDefault();
          mover(pos.x + d[e.key][0], pos.y + d[e.key][1]);
        } else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          onCambio(null);
        }
      }}
    >
      <span className="truncate">
        <span className="font-mono tnum">{indice + 1}</span> · {nombre.trim() || "Firma"}
      </span>
      <button
        type="button"
        aria-label={`Quitar la firma de ${nombre || `firmante ${indice + 1}`}`}
        className="mb-auto mt-0.5 shrink-0 rounded-full p-0.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
        onClick={(e) => {
          e.stopPropagation();
          onCambio(null);
        }}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
