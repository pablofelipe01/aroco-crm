"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { motion } from "framer-motion";
import {
  Plus,
  HelpCircle,
  Check,
  Trash2,
  Pencil,
  RotateCcw,
  Archive,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { staggerContainer, fadeUp } from "@/lib/motion";
import { DEPARTMENTS } from "@/lib/departments";
import {
  PREGUNTA_PRIORIDADES,
  type PreguntaEstado,
  type PreguntaPrioridad,
} from "@/lib/schemas/pregunta";
import type { PreguntaConAutor } from "./page";
import {
  crearPregunta,
  editarPregunta,
  responderPregunta,
  cambiarEstadoPregunta,
  borrarPregunta,
} from "./actions";

const TONO_PRIORIDAD: Record<PreguntaPrioridad, BadgeTone> = {
  Alta: "danger",
  Media: "warn",
  Baja: "neutral",
};

const TONO_ESTADO: Record<PreguntaEstado, BadgeTone> = {
  Pendiente: "info",
  Respondida: "success",
  Descartada: "neutral",
};

type FormValues = {
  pregunta: string;
  contexto: string;
  bloquea: string;
  para_quien: string;
  area: string;
  prioridad: PreguntaPrioridad;
};

const EMPTY: FormValues = {
  pregunta: "",
  contexto: "",
  bloquea: "",
  para_quien: "",
  area: "",
  prioridad: "Media",
};

export function PreguntasClient({
  preguntas,
  userId,
}: {
  preguntas: PreguntaConAutor[];
  userId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [filtro, setFiltro] = React.useState<PreguntaEstado | "Todas">("Pendiente");
  const [editando, setEditando] = React.useState<PreguntaConAutor | null>(null);
  const [abierto, setAbierto] = React.useState(false);
  const [respondiendo, setRespondiendo] = React.useState<PreguntaConAutor | null>(null);
  const [textoRespuesta, setTextoRespuesta] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);

  const { register, handleSubmit, reset } = useForm<FormValues>({ defaultValues: EMPTY });

  const pendientes = preguntas.filter((p) => p.estado === "Pendiente").length;
  const visibles =
    filtro === "Todas" ? preguntas : preguntas.filter((p) => p.estado === filtro);

  function abrirNueva() {
    setEditando(null);
    reset(EMPTY);
    setAbierto(true);
  }

  function abrirEdicion(p: PreguntaConAutor) {
    setEditando(p);
    reset({
      pregunta: p.pregunta,
      contexto: p.contexto ?? "",
      bloquea: p.bloquea ?? "",
      para_quien: p.para_quien ?? "",
      area: p.area ?? "",
      prioridad: p.prioridad,
    });
    setAbierto(true);
  }

  async function onSubmit(values: FormValues) {
    setGuardando(true);
    const res = editando
      ? await editarPregunta(editando.id, values)
      : await crearPregunta(values);
    setGuardando(false);
    if (!res.ok) return toast({ title: res.error ?? "No se pudo guardar.", tone: "error" });
    setAbierto(false);
    router.refresh();
  }

  async function guardarRespuesta() {
    if (!respondiendo) return;
    setGuardando(true);
    const res = await responderPregunta({ id: respondiendo.id, respuesta: textoRespuesta });
    setGuardando(false);
    if (!res.ok) return toast({ title: res.error ?? "No se pudo guardar.", tone: "error" });
    setRespondiendo(null);
    setTextoRespuesta("");
    router.refresh();
  }

  async function cambiar(id: string, estado: PreguntaEstado) {
    const res = await cambiarEstadoPregunta(id, estado);
    if (!res.ok) return toast({ title: res.error ?? "No se pudo cambiar.", tone: "error" });
    router.refresh();
  }

  async function borrar(p: PreguntaConAutor) {
    const res = await borrarPregunta(p.id);
    if (!res.ok) return toast({ title: res.error ?? "No se pudo borrar.", tone: "error" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Preguntas pendientes"
        description={
          pendientes > 0
            ? `${pendientes} sin respuesta — para repasar en la próxima reunión`
            : "Todo respondido por ahora"
        }
        actions={
          <Button onClick={abrirNueva}>
            <Plus className="size-4" />
            Nueva pregunta
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {(["Pendiente", "Respondida", "Descartada", "Todas"] as const).map((f) => {
          const n =
            f === "Todas" ? preguntas.length : preguntas.filter((p) => p.estado === f).length;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={
                "rounded-[var(--radius-md)] border px-3 py-1.5 text-sm transition-colors " +
                (filtro === f
                  ? "border-accent bg-accent-soft text-accent-soft-fg"
                  : "border-border text-fg-muted hover:bg-bg-muted")
              }
            >
              {f} <span className="font-mono tnum text-xs">({n})</span>
            </button>
          );
        })}
      </div>

      {visibles.length === 0 ? (
        <EmptyState
          icon={<HelpCircle className="size-6" />}
          title={
            filtro === "Pendiente" ? "No hay preguntas pendientes" : `Nada en «${filtro}»`
          }
          description="Anota aquí lo que quede sin resolver y aparecerá listo para la próxima reunión."
          action={<Button onClick={abrirNueva}>Nueva pregunta</Button>}
        />
      ) : (
        <motion.ul
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="space-y-3"
        >
          {visibles.map((p) => (
            <motion.li key={p.id} variants={fadeUp}>
              <Card>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-base font-medium text-fg">
                      {p.pregunta}
                    </p>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Badge tone={TONO_PRIORIDAD[p.prioridad]}>{p.prioridad}</Badge>
                      <Badge tone={TONO_ESTADO[p.estado]}>{p.estado}</Badge>
                      {p.area && <Badge>{p.area}</Badge>}
                    </div>
                  </div>

                  {p.contexto && (
                    <p className="text-sm text-fg-muted">{p.contexto}</p>
                  )}
                  {p.bloquea && (
                    <p className="text-sm">
                      <span className="text-fg-subtle">Está esperando esto: </span>
                      <span className="text-fg-muted">{p.bloquea}</span>
                    </p>
                  )}

                  {p.respuesta && (
                    <div className="rounded-[var(--radius-md)] border border-success/30 bg-success-soft/40 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-fg-subtle">
                        Respuesta
                      </p>
                      <p className="mt-1 text-sm text-fg">{p.respuesta}</p>
                      {p.respondida_en && (
                        <p className="mt-1 font-mono tnum text-xs text-fg-subtle">
                          {formatDate(p.respondida_en)}
                          {p.respondio ? ` · ${p.respondio}` : ""}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                    <p className="text-xs text-fg-subtle">
                      {p.para_quien ? `Preguntarle a ${p.para_quien}` : "Sin destinatario"}
                      {p.autor ? ` · anotada por ${p.autor}` : ""}
                      {p.created_at ? ` · ${formatDate(p.created_at)}` : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-1">
                      {p.estado === "Pendiente" ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRespondiendo(p);
                              setTextoRespuesta(p.respuesta ?? "");
                            }}
                          >
                            <Check className="size-4" />
                            Responder
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => cambiar(p.id, "Descartada")}
                          >
                            <Archive className="size-4" />
                            Descartar
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => cambiar(p.id, "Pendiente")}
                        >
                          <RotateCcw className="size-4" />
                          Reabrir
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => abrirEdicion(p)}>
                        <Pencil className="size-4" />
                        Editar
                      </Button>
                      {/* Solo lo propio y sin responder: lo demás es historial
                          y la RLS lo va a rechazar igual. */}
                      {p.created_by === userId && p.estado === "Pendiente" && (
                        <Button size="sm" variant="ghost" onClick={() => borrar(p)}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            </motion.li>
          ))}
        </motion.ul>
      )}

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title={editando ? "Editar pregunta" : "Nueva pregunta"}
        description="Lo que quede sin resolver, anotado antes de que se olvide."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-pregunta" loading={guardando}>
              Guardar
            </Button>
          </>
        }
      >
        <form
          id="form-pregunta"
          onSubmit={handleSubmit(onSubmit)}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <Field label="Pregunta *" className="sm:col-span-2">
            <Textarea
              rows={2}
              {...register("pregunta", { required: true })}
              placeholder="¿Cuál es la fórmula real de la Bonificación Calidad?"
            />
          </Field>
          <Field label="Contexto" className="sm:col-span-2">
            <Textarea
              rows={3}
              {...register("contexto")}
              placeholder="Qué se sabe hasta ahora y por qué salió la duda."
            />
          </Field>
          <Field label="¿Qué está esperando esta respuesta?" className="sm:col-span-2">
            <Input
              {...register("bloquea")}
              placeholder="El cotizador nacional no se puede terminar sin ella."
            />
          </Field>
          <Field label="Preguntarle a">
            <Input {...register("para_quien")} placeholder="Renata Bonilla" />
          </Field>
          <Field label="Área">
            <Select {...register("area")}>
              <option value="">— Sin área —</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridad">
            <Select {...register("prioridad")}>
              {PREGUNTA_PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>

      <Modal
        open={respondiendo !== null}
        onClose={() => setRespondiendo(null)}
        title="Responder"
        description={respondiendo?.pregunta}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRespondiendo(null)}>
              Cancelar
            </Button>
            <Button onClick={guardarRespuesta} loading={guardando}>
              Guardar respuesta
            </Button>
          </>
        }
      >
        <Field label="Respuesta">
          <Textarea
            rows={5}
            value={textoRespuesta}
            onChange={(e) => setTextoRespuesta(e.target.value)}
            placeholder="Lo que se acordó en la reunión."
          />
        </Field>
      </Modal>
    </div>
  );
}
