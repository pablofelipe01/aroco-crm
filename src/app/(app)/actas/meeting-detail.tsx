"use client";

import * as React from "react";
import {
  ClipboardList,
  FileDown,
  Layers,
  Lock,
  Pencil,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { TASK_STATUS_META, type TaskStatus } from "@/lib/status";
import type { MeetingWithCount, MeetingTemaLite, ProfileLite } from "./page";
import {
  setAttendeeAccess,
  setAttendeeManage,
  addMeetingViewer,
  removeMeetingViewer,
  actualizarActa,
  agruparActa,
  guardarTema,
} from "./actions";

type MeetingTask = {
  id: string;
  name: string;
  status: string;
  due_date: string | null;
  person_name: string | null;
  tema_id: string | null;
  task_assignees: { team_members: { name: string } | null }[] | null;
};

/** Responsables de la tarea; cae al nombre suelto si no hay ninguno del equipo. */
function responsables(t: MeetingTask): string {
  const names = (t.task_assignees ?? [])
    .map((a) => a.team_members?.name)
    .filter((n): n is string => !!n);
  if (names.length === 0) return t.person_name ?? "";
  if (names.length <= 2) return names.join(" y ");
  return `${names[0]} y ${names.length - 1} más`;
}

/**
 * Reparto del acceso al acta. Solo lo ve quien la administra: un SuperAdmin
 * que asistió, o el Gerente General. La base vuelve a comprobarlo al escribir
 * (0049), así que esconderlo aquí es comodidad, no la seguridad.
 */
function AccessPanel({
  meeting,
  profiles,
  onChanged,
}: {
  meeting: MeetingWithCount;
  profiles: ProfileLite[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [añadir, setAñadir] = React.useState("");

  const invitados = meeting.meeting_attendees;
  const yaEstan = new Set(invitados.map((a) => a.profile_id).filter(Boolean));
  const disponibles = profiles.filter((p) => !yaEstan.has(p.id));
  /** La delegación solo surte efecto en quien tiene acceso total (0050). */
  const superAdmins = new Set(
    profiles.filter((p) => p.role === "admin").map((p) => p.id),
  );
  const esSuperAdmin = (id: string | null) => id != null && superAdmins.has(id);

  async function correr(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(id);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo cambiar", description: res.error });
      return;
    }
    onChanged();
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-3">
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
        <Users className="h-3.5 w-3.5" />
        Quién puede ver esta acta
      </h3>
      <p className="mb-3 text-xs text-fg-subtle">
        {meeting.restricted
          ? "El acta está restringida: solo la ven los marcados, más quienes la administran."
          : "El acta está abierta a todo el equipo. Estas marcas empiezan a aplicar cuando la restrinjas."}
      </p>

      {invitados.length === 0 ? (
        <p className="text-sm text-fg-subtle">
          No hay nadie en la lista. Si la restringes, solo la verán quienes la administran.
        </p>
      ) : (
        <ul className="space-y-1">
          {invitados.map((a) => {
            const sinCuenta = !a.profile_id;
            return (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-1"
              >
                <input
                  type="checkbox"
                  checked={a.can_view && !sinCuenta}
                  disabled={sinCuenta || busy === a.id}
                  onChange={(e) =>
                    correr(a.id, () => setAttendeeAccess(a.id, e.target.checked))
                  }
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">
                  {a.name ?? a.email}
                </span>
                {!a.attended && <Badge tone="neutral">no asistió</Badge>}
                {sinCuenta && (
                  // Sin cuenta en el CRM no hay a quién dar acceso: la marca
                  // no haría nada y confundiría.
                  <Badge tone="neutral">sin cuenta</Badge>
                )}
                {esSuperAdmin(a.profile_id) && (
                  <label className="flex shrink-0 items-center gap-1 text-xs text-fg-subtle">
                    <input
                      type="checkbox"
                      checked={a.can_manage || a.attended}
                      // Quien asistió ya administra por regla; la casilla solo
                      // sirve para dárselo a quien no estuvo.
                      disabled={a.attended || busy === a.id}
                      onChange={(e) =>
                        correr(a.id, () => setAttendeeManage(a.id, e.target.checked))
                      }
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    administra
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => correr(a.id, () => removeMeetingViewer(a.id))}
                  disabled={busy === a.id}
                  className="rounded p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                  aria-label={`Quitar a ${a.name ?? a.email} de la lista`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {disponibles.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <Select
            value={añadir}
            onChange={(e) => setAñadir(e.target.value)}
            className="h-9 flex-1 py-0 text-sm"
          >
            <option value="">Dar acceso a alguien más…</option>
            {disponibles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            disabled={!añadir || busy === "add"}
            onClick={() =>
              correr("add", async () => {
                const res = await addMeetingViewer(meeting.id, añadir);
                if (res.ok) setAñadir("");
                return res;
              })
            }
          >
            Añadir
          </Button>
        </div>
      )}
    </div>
  );
}


/** Una tarea de la lista, con su estado y responsables. */
function FilaTarea({ t }: { t: MeetingTask }) {
  return (
    <li className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-border px-3 py-2">
      <Badge tone={TASK_STATUS_META[t.status as TaskStatus].tone} dot>
        {TASK_STATUS_META[t.status as TaskStatus].label}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-fg">{t.name}</p>
        {responsables(t) && (
          <p className="truncate text-xs text-fg-subtle">{responsables(t)}</p>
        )}
      </div>
      {t.due_date && (
        <span className="shrink-0 font-mono text-xs tnum text-fg-subtle">
          {formatDate(t.due_date)}
        </span>
      )}
    </li>
  );
}

/**
 * Un tema: lo que se dijo del asunto y los compromisos que salieron de él.
 *
 * El título se edita en el sitio. Corregir a mano un tema mal nombrado es más
 * rápido que volver a agrupar el acta entera, y no arriesga los que sí
 * quedaron bien.
 */
function BloqueTema({
  tema,
  tareas,
  puedeEditar,
  onChanged,
}: {
  tema: MeetingTemaLite;
  tareas: MeetingTask[];
  puedeEditar: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editando, setEditando] = React.useState(false);
  const [titulo, setTitulo] = React.useState(tema.titulo);
  const [resumen, setResumen] = React.useState(tema.resumen ?? "");
  const [guardando, setGuardando] = React.useState(false);

  async function guardar() {
    setGuardando(true);
    const res = await guardarTema({ id: tema.id, titulo, resumen });
    setGuardando(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    setEditando(false);
    onChanged();
  }

  return (
    <section className="rounded-[var(--radius-md)] border border-border p-3">
      {editando ? (
        <div className="space-y-2">
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="font-medium"
          />
          <Textarea
            value={resumen}
            onChange={(e) => setResumen(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTitulo(tema.titulo);
                setResumen(tema.resumen ?? "");
                setEditando(false);
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" loading={guardando} onClick={guardar} disabled={!titulo.trim()}>
              Guardar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold text-fg">{tema.titulo}</h4>
            <div className="flex shrink-0 items-center gap-1">
              {tareas.length > 0 && (
                <Badge tone="neutral">{tareas.length}</Badge>
              )}
              {puedeEditar && (
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  className="rounded p-1 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                  aria-label={`Editar el tema ${tema.titulo}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          {tema.resumen && (
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">
              {tema.resumen}
            </p>
          )}
        </>
      )}

      {tareas.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {tareas.map((t) => (
            <FilaTarea key={t.id} t={t} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Edición del acta: título, fecha y cuerpo. */
function FormularioActa({
  meeting,
  onDone,
  onCancel,
}: {
  meeting: MeetingWithCount;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = React.useState(meeting.title);
  const [fecha, setFecha] = React.useState(meeting.meeting_date ?? "");
  const [notes, setNotes] = React.useState(meeting.notes ?? "");
  const [guardando, setGuardando] = React.useState(false);

  async function guardar() {
    setGuardando(true);
    const res = await actualizarActa({
      id: meeting.id,
      title,
      meeting_date: fecha || null,
      notes,
    });
    setGuardando(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Acta actualizada" });
    onDone();
  }

  return (
    <div className="space-y-4">
      <Field label="Título">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Fecha de la reunión">
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Field>
      <Field
        label="Acta"
        hint="Es el registro de la reunión: corrige errores, no reescribas lo que se dijo."
      >
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={16}
          className="font-mono text-xs"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" loading={guardando} onClick={guardar} disabled={!title.trim()}>
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}

/**
 * Lectura del acta dentro del CRM. Las actas del correo traen el cuerpo
 * completo en `notes`; las subidas a mano, el archivo.
 *
 * No hace falta comprobar permisos de lectura aquí: si el acta llegó a la
 * lista es porque la RLS la dejó pasar (0044/0045/0049).
 */
export function MeetingDetail({
  meeting,
  open,
  onClose,
  onDownload,
  profiles,
  onChanged,
}: {
  meeting: MeetingWithCount | null;
  open: boolean;
  onClose: () => void;
  onDownload: (filePath: string) => void;
  profiles: ProfileLite[];
  onChanged: () => void;
}) {
  // `null` = todavía sin cargar. El componente se remonta por acta (key en el
  // padre), así que no hace falta reiniciar el estado dentro del efecto.
  const [tasks, setTasks] = React.useState<MeetingTask[] | null>(null);
  const loading = tasks === null;
  const { toast } = useToast();
  const [editando, setEditando] = React.useState(false);
  const [agrupando, setAgrupando] = React.useState(false);

  const meetingId = meeting?.id;
  React.useEffect(() => {
    if (!open || !meetingId) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("tasks")
        .select(
          "id, name, status, due_date, person_name, tema_id, task_assignees(team_members(name))",
        )
        .eq("meeting_id", meetingId)
        .order("due_date", { ascending: true, nullsFirst: false });
      // Los tipos generados no traen las relaciones, así que el planificador
      // de tipos no resuelve el embed aunque PostgREST sí lo haga.
      if (!cancelled) setTasks((data ?? []) as unknown as MeetingTask[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, meetingId]);

  if (!meeting) return null;

  const invitados = meeting.meeting_attendees ?? [];
  const temas = meeting.temas ?? [];
  const listaTareas = tasks ?? [];
  // Las que la agrupación no colocó en ningún tema. Se muestran aparte en vez
  // de esconderlas: una tarea que desaparece de la pantalla al agrupar es una
  // tarea que nadie vuelve a mirar.
  const sueltas = listaTareas.filter(
    (t) => !t.tema_id || !temas.some((x) => x.id === t.tema_id),
  );

  async function alAgrupar() {
    if (!meeting) return;
    setAgrupando(true);
    const res = await agruparActa(meeting.id);
    setAgrupando(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo agrupar", description: res.error });
      return;
    }
    toast({
      tone: "success",
      title: `${res.count} tema${res.count === 1 ? "" : "s"}`,
      description: "El acta quedó agrupada por asunto.",
    });
    onChanged();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={meeting.title}
      subtitle={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-fg-muted">
            {formatDate(meeting.meeting_date ?? meeting.created_at)}
          </span>
          {meeting.restricted && (
            <Badge tone="warn">
              <Lock className="h-3 w-3" />
              Restringida
            </Badge>
          )}
          <Badge tone="neutral">{meeting.tasks?.[0]?.count ?? 0} tareas</Badge>
        </div>
      }
      footer={
        <>
          {meeting.puedeEditar && !editando && (
            <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
              <Pencil className="h-4 w-4" />
              Editar acta
            </Button>
          )}
          {meeting.file_path && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onDownload(meeting.file_path!)}
            >
              <FileDown className="h-4 w-4" />
              Descargar {meeting.file_name ?? "acta"}
            </Button>
          )}
        </>
      }
    >
      {editando ? (
        <FormularioActa
          meeting={meeting}
          onDone={() => {
            setEditando(false);
            onChanged();
          }}
          onCancel={() => setEditando(false)}
        />
      ) : (
      <div className="space-y-6">
        {invitados.length > 0 && !meeting.canManage && (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
              <Users className="h-3.5 w-3.5" />
              Invitados
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {invitados.map((a) => (
                <Badge key={a.id} tone="neutral">
                  {a.name ?? a.email}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {meeting.canManage && (
          <AccessPanel meeting={meeting} profiles={profiles} onChanged={onChanged} />
        )}

        {/* ── Por tema ─────────────────────────────────────────────────
            Lo que pidió Álvaro: leer el acta por asunto y no por el orden en
            que se habló. Cuando hay temas mandan ellos, y el acta completa
            queda debajo para quien quiera el texto tal cual se transcribió. */}
        {temas.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
              <Layers className="h-3.5 w-3.5" />
              Por tema
            </h3>
            <div className="space-y-2.5">
              {temas.map((tema) => (
                <BloqueTema
                  key={tema.id}
                  tema={tema}
                  tareas={listaTareas.filter((t) => t.tema_id === tema.id)}
                  puedeEditar={meeting.puedeEditar}
                  onChanged={onChanged}
                />
              ))}
            </div>

            {sueltas.length > 0 && (
              <div className="mt-3">
                <h4 className="mb-1.5 text-xs text-fg-subtle">Sin tema asignado</h4>
                <ul className="space-y-1.5">
                  {sueltas.map((t) => (
                    <FilaTarea key={t.id} t={t} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
              {temas.length > 0 ? "Acta completa" : "Acta"}
            </h3>
            {meeting.puedeEditar && meeting.notes && (
              <Button
                size="sm"
                variant="ghost"
                loading={agrupando}
                onClick={alAgrupar}
              >
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                {temas.length > 0 ? "Reagrupar" : "Agrupar por tema"}
              </Button>
            )}
          </div>
          {meeting.notes ? (
            // El acta del correo llega como texto plano con sus saltos de
            // línea; se respetan tal cual en vez de reformatearlos.
            <div className="max-h-[55vh] overflow-y-auto rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
                {meeting.notes}
              </p>
            </div>
          ) : meeting.file_path ? (
            <p className="text-sm text-fg-subtle">
              El contenido está en el archivo adjunto; descárgalo abajo.
            </p>
          ) : (
            <p className="text-sm text-fg-subtle">Esta acta no tiene contenido guardado.</p>
          )}
        </div>

        {/* Sin temas, las tareas van en una sola lista, como hasta ahora. */}
        {temas.length === 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
              <ClipboardList className="h-3.5 w-3.5" />
              Tareas generadas
            </h3>
            {/* El mismo reparto que el globo de la lista, pero visible sin
                depender del hover. */}
            {meeting.taskLoad.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {meeting.taskLoad.map((r) => (
                  <Badge key={r.name} tone="neutral">
                    {r.name} · {r.count}
                  </Badge>
                ))}
              </div>
            )}
            {loading ? (
              <p className="text-sm text-fg-subtle">Cargando…</p>
            ) : listaTareas.length === 0 ? (
              <p className="text-sm text-fg-subtle">No se crearon tareas desde esta acta.</p>
            ) : (
              <ul className="space-y-1.5">
                {listaTareas.map((t) => (
                  <FilaTarea key={t.id} t={t} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      )}
    </Drawer>
  );
}
