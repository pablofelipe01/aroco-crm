"use client";

import * as React from "react";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { TaskNote } from "@/lib/types/database";
import { addTaskNote, deleteTaskNote, listTaskNotes } from "./actions";

/**
 * Bitácora de la tarea: varias notas fechadas en vez de un solo campo.
 *
 * Antes había un único «Notas» que la segunda anotación pisaba. Lo que se pidió
 * en la revisión del 1-sep-2026 es poder seguir una tarea en el tiempo —qué se
 * intentó, con quién se habló, qué quedó pendiente— y para eso cada entrada
 * necesita su fecha y su autor.
 *
 * Se guarda al momento de escribirla, no al «Guardar» del formulario: si una
 * nota se pierde porque alguien cerró el modal, deja de servir como constancia.
 */

/** «04 sep 2026, 3:12 p. m.» en hora de Bogotá, que es donde se escribió. */
function cuando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function TaskLog({
  taskId,
  currentUserId,
}: {
  taskId: string;
  currentUserId?: string;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = React.useState<TaskNote[] | null>(null);
  const [texto, setTexto] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);

  // Al cambiar de tarea la bitácora vuelve a «cargando» EN EL RENDER, no en un
  // efecto: hacerlo después dejaría un parpadeo en el que se leen las notas de
  // la tarea anterior bajo el título de la nueva.
  const [prevTaskId, setPrevTaskId] = React.useState(taskId);
  if (taskId !== prevTaskId) {
    setPrevTaskId(taskId);
    setNotes(null);
  }

  React.useEffect(() => {
    let vigente = true;
    listTaskNotes(taskId).then((r) => {
      // Si mientras tanto se abrió otra tarea, esta respuesta ya no es de la
      // que se está mirando y pintarla mostraría la bitácora equivocada.
      if (!vigente) return;
      if (!r.ok) {
        toast({ tone: "error", title: "No se pudo cargar la bitácora", description: r.error });
        setNotes([]);
        return;
      }
      setNotes(r.notes);
    });
    return () => {
      vigente = false;
    };
  }, [taskId, toast]);

  async function agregar() {
    const cuerpo = texto.trim();
    if (!cuerpo) return;
    setGuardando(true);
    const res = await addTaskNote(taskId, cuerpo);
    setGuardando(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo agregar la nota", description: res.error });
      return;
    }
    setTexto("");
    const r = await listTaskNotes(taskId);
    if (r.ok) setNotes(r.notes);
  }

  async function borrar(n: TaskNote) {
    if (!confirm("¿Borrar esta nota de la bitácora?")) return;
    const previas = notes;
    setNotes((ns) => (ns ?? []).filter((x) => x.id !== n.id));
    const res = await deleteTaskNote(n.id);
    if (!res.ok) {
      setNotes(previas);
      toast({ tone: "error", title: "No se pudo borrar", description: res.error });
    }
  }

  return (
    <section className="mt-6 border-t border-border pt-4">
      <h3 className="mb-3 text-sm font-medium text-fg">
        Bitácora
        {notes && notes.length > 0 && (
          <span className="ml-2 font-mono text-xs text-fg-subtle tnum">
            {notes.length}
          </span>
        )}
      </h3>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          placeholder="¿Qué pasó con esta tarea?"
          className="flex-1"
          // Ctrl/⌘+Enter guarda sin soltar el teclado: quien escribe una
          // bitácora suele encadenar varias notas seguidas.
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void agregar();
            }
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={agregar}
          loading={guardando}
          disabled={!texto.trim()}
        >
          <MessageSquarePlus className="h-4 w-4" />
          Agregar
        </Button>
      </div>

      {notes === null ? (
        <p className="mt-4 text-xs text-fg-subtle">Cargando bitácora…</p>
      ) : notes.length === 0 ? (
        <p className="mt-4 text-xs text-fg-subtle">
          Todavía no hay notas. La primera queda fechada con hoy.
        </p>
      ) : (
        <ol className="mt-4 space-y-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[11px] text-fg-subtle tnum">
                  {cuando(n.created_at)}
                  {n.author_name ? ` · ${n.author_name}` : ""}
                </span>
                {/* El botón solo aparece en las notas propias. La regla de
                    verdad está en la RLS; esto evita ofrecer algo que la base
                    va a rechazar. */}
                {currentUserId && n.created_by === currentUserId && (
                  <button
                    type="button"
                    onClick={() => borrar(n)}
                    className="shrink-0 rounded p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                    aria-label="Borrar nota"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {/* `whitespace-pre-wrap`: la gente escribe la bitácora con
                  saltos de línea y perderlos vuelve ilegible una nota larga. */}
              <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{n.body}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
