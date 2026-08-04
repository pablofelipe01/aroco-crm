"use client";

import * as React from "react";
import { ClipboardList, FileDown, Lock, Users, X } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { TASK_STATUS_META, type TaskStatus } from "@/lib/status";
import type { MeetingWithCount } from "./page";
import type { Profile } from "@/lib/types/database";
import {
  setAttendeeAccess,
  addMeetingViewer,
  removeMeetingViewer,
} from "./actions";

type MeetingTask = {
  id: string;
  name: string;
  status: string;
  due_date: string | null;
  person_name: string | null;
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
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [añadir, setAñadir] = React.useState("");

  const invitados = meeting.meeting_attendees;
  const yaEstan = new Set(invitados.map((a) => a.profile_id).filter(Boolean));
  const disponibles = profiles.filter((p) => !yaEstan.has(p.id));

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
                {sinCuenta && (
                  // Sin cuenta en el CRM no hay a quién dar acceso: la marca
                  // no haría nada y confundiría.
                  <Badge tone="neutral">sin cuenta</Badge>
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
  profiles: Pick<Profile, "id" | "full_name" | "email">[];
  onChanged: () => void;
}) {
  // `null` = todavía sin cargar. El componente se remonta por acta (key en el
  // padre), así que no hace falta reiniciar el estado dentro del efecto.
  const [tasks, setTasks] = React.useState<MeetingTask[] | null>(null);
  const loading = tasks === null;

  const meetingId = meeting?.id;
  React.useEffect(() => {
    if (!open || !meetingId) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("tasks")
        .select(
          "id, name, status, due_date, person_name, task_assignees(team_members(name))",
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
        meeting.file_path && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onDownload(meeting.file_path!)}
          >
            <FileDown className="h-4 w-4" />
            Descargar {meeting.file_name ?? "acta"}
          </Button>
        )
      }
    >
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

        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">
            Acta
          </h3>
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
          ) : tasks!.length === 0 ? (
            <p className="text-sm text-fg-subtle">No se crearon tareas desde esta acta.</p>
          ) : (
            <ul className="space-y-1.5">
              {tasks!.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-border px-3 py-2"
                >
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
              ))}
            </ul>
          )}
        </div>
      </div>
    </Drawer>
  );
}
