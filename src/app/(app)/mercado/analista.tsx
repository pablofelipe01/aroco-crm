"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Sparkles, Send, Loader2, Wrench, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { TarjetaPropuesta } from "@/components/assistant/propuesta";
import type { AgentProposal } from "@/components/assistant/actions";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

type Mensaje = {
  rol: "user" | "assistant";
  texto: string;
  herramientas: string[];
  propuestas: AgentProposal[];
};

/** Lo que manda el servidor por el canal SSE. */
type Evento =
  | { t: "texto"; delta: string }
  | { t: "herramienta"; nombre: string }
  | { t: "propuesta"; propuesta: AgentProposal }
  | { t: "error"; mensaje: string }
  | { t: "fin" };

/**
 * El analista de Mercado, al lado del tablero.
 *
 * Entra con `foto`: el texto de lo que hay en pantalla, armado en el servidor
 * del mismo objeto que pintó las tarjetas. Por eso puede hablar de «las 25,32 t
 * descubiertas» sin ir a buscarlas, y por eso el número que dice es el mismo
 * que se ve dos centímetros a la izquierda.
 *
 * La respuesta llega en streaming porque estas preguntas encadenan consultas
 * —la posición entera se recarga en cada una— y un turno puede tardar medio
 * minuto. Con un spinner mudo eso se siente colgado; viendo el texto aparecer,
 * no.
 */
export function AnalistaMercado({
  foto,
  onCerrar,
}: {
  foto: string;
  onCerrar: () => void;
}) {
  const t = useT();
  const [mensajes, setMensajes] = React.useState<Mensaje[]>([]);
  const [entrada, setEntrada] = React.useState("");
  const [cargando, setCargando] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const sugerencias = [
    t.mercado.analistaSugerencia1,
    t.mercado.analistaSugerencia2,
    t.mercado.analistaSugerencia3,
    t.mercado.analistaSugerencia4,
  ];

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [mensajes, cargando]);

  // Si se cierra la pantalla a media respuesta, cortar la petición: sin esto
  // el stream sigue vivo y el servidor sigue gastando.
  React.useEffect(() => () => abortRef.current?.abort(), []);

  function nuevaConversacion() {
    abortRef.current?.abort();
    setMensajes([]);
    setEntrada("");
    setCargando(false);
  }

  /** Aplica un evento sobre el último mensaje del asistente. */
  function aplicar(ev: Evento) {
    setMensajes((prev) => {
      const copia = [...prev];
      const ultimo = copia[copia.length - 1];
      if (!ultimo || ultimo.rol !== "assistant") return prev;
      if (ev.t === "texto") {
        copia[copia.length - 1] = { ...ultimo, texto: ultimo.texto + ev.delta };
      } else if (ev.t === "herramienta") {
        copia[copia.length - 1] = {
          ...ultimo,
          herramientas: [...ultimo.herramientas, ev.nombre],
        };
      } else if (ev.t === "propuesta") {
        copia[copia.length - 1] = {
          ...ultimo,
          propuestas: [...ultimo.propuestas, ev.propuesta],
        };
      } else if (ev.t === "error") {
        copia[copia.length - 1] = {
          ...ultimo,
          texto: ultimo.texto ? `${ultimo.texto}\n\n${ev.mensaje}` : ev.mensaje,
        };
      }
      return copia;
    });
  }

  async function enviar(texto: string) {
    const q = texto.trim();
    if (!q || cargando) return;

    const historia: Mensaje[] = [
      ...mensajes,
      { rol: "user", texto: q, herramientas: [], propuestas: [] },
    ];
    setMensajes([
      ...historia,
      { rol: "assistant", texto: "", herramientas: [], propuestas: [] },
    ]);
    setEntrada("");
    setCargando(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/agent/mercado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          messages: historia.map((m) => ({ role: m.rol, content: m.texto })),
          foto,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        aplicar({
          t: "error",
          mensaje: data?.error ?? t.mercado.analistaError,
        });
        return;
      }

      const lector = res.body.getReader();
      const decodificador = new TextDecoder();
      let resto = "";
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        resto += decodificador.decode(value, { stream: true });
        // Los eventos van separados por línea en blanco; el último trozo puede
        // venir cortado a la mitad y espera al siguiente paquete.
        const partes = resto.split("\n\n");
        resto = partes.pop() ?? "";
        for (const parte of partes) {
          const linea = parte.trim();
          if (!linea.startsWith("data:")) continue;
          try {
            aplicar(JSON.parse(linea.slice(5)) as Evento);
          } catch {
            // Un evento ilegible no debe tumbar la conversación entera.
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        aplicar({ t: "error", mensaje: t.mercado.analistaSinConexion });
      }
    } finally {
      setCargando(false);
      abortRef.current = null;
    }
  }

  const vacio = mensajes.length === 0;

  return (
    <div className="border-border bg-surface flex h-full max-h-[calc(100vh-7rem)] min-h-[28rem] flex-col overflow-hidden rounded-[var(--radius-lg)] border shadow-[var(--shadow-soft)]">
      <header className="border-border flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-fg flex items-center gap-2 text-sm font-medium">
            <Sparkles className="text-accent h-4 w-4" />
            {t.mercado.analistaTitulo}
          </h2>
          <p className="text-fg-subtle mt-0.5 text-xs">
            {t.mercado.analistaSubtitulo}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!vacio && (
            <Button
              size="icon"
              variant="ghost"
              onClick={nuevaConversacion}
              aria-label={t.mercado.analistaLimpiar}
              title={t.mercado.analistaLimpiar}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={onCerrar}
            aria-label={t.mercado.analistaCerrar}
            title={t.mercado.analistaCerrar}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div
        ref={scrollRef}
        aria-live="polite"
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        {vacio && !cargando && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="bg-accent-soft text-accent-soft-fg flex h-12 w-12 items-center justify-center rounded-full">
              <Sparkles className="h-6 w-6" />
            </div>
            <p className="text-fg-muted max-w-xs text-sm">
              {t.mercado.analistaInvitacion}
            </p>
            <div className="flex w-full flex-col gap-2">
              {sugerencias.map((s) => (
                <button
                  key={s}
                  onClick={() => void enviar(s)}
                  className="border-border bg-surface text-fg-muted hover:border-accent hover:text-fg rounded-[var(--radius-md)] border px-3 py-2 text-left text-xs transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-fg-subtle text-[11px]">
              {t.mercado.analistaNoEjecuta}
            </p>
          </div>
        )}

        {mensajes.map((m, i) => (
          <React.Fragment key={i}>
            {m.herramientas.length > 0 && (
              <p className="text-fg-subtle flex items-center gap-1 self-start text-[10px]">
                <Wrench className="h-3 w-3" />
                {t.mercado.analistaConsultando} {m.herramientas.join(", ")}
              </p>
            )}

            {(m.texto || m.rol === "user") && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "max-w-[88%] rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm",
                  m.rol === "user"
                    ? "bg-accent text-accent-fg self-end"
                    : "border-border bg-surface text-fg self-start border",
                )}
              >
                <p className="leading-relaxed whitespace-pre-wrap">{m.texto}</p>
              </motion.div>
            )}

            {m.propuestas.map((p, j) => (
              <TarjetaPropuesta key={`${i}:${j}`} propuesta={p} />
            ))}
          </React.Fragment>
        ))}

        {/* Mientras no ha llegado ni una letra, el turno está pensando. */}
        {cargando && mensajes[mensajes.length - 1]?.texto === "" && (
          <div className="border-border bg-surface text-fg-muted flex items-center gap-2 self-start rounded-[var(--radius-md)] border px-3.5 py-2.5 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t.mercado.analistaPensando}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(entrada);
        }}
        className="border-border flex items-end gap-2 border-t px-4 py-3"
      >
        <Textarea
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar(entrada);
            }
          }}
          placeholder={t.mercado.analistaPlaceholder}
          rows={1}
          className="min-h-10 flex-1 resize-none"
        />
        <Button
          type="submit"
          size="icon"
          loading={cargando}
          disabled={!entrada.trim()}
        >
          {!cargando && <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
