"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  ClipboardList,
  Trash2,
  FileDown,
  Loader2,
  Sparkles,
  Calendar,
  Lock,
  LockOpen,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import type { TeamMember } from "@/lib/types/database";
import type { MeetingWithCount } from "./page";
import { MeetingDetail } from "./meeting-detail";
import {
  createActaTasks,
  deleteMeeting,
  getActaFileUrl,
  setMeetingRestricted,
} from "./actions";

interface EditableTask {
  include: boolean;
  name: string;
  /** Responsables: el acta puede repartir un mismo compromiso entre varios. */
  assignee_ids: string[];
  /** Nombre sugerido cuando el acta menciona a alguien fuera del equipo. */
  person_name: string | null;
  due_date: string;
  description: string | null;
}

interface Review {
  meetingId: string;
  meetingTitle: string;
  tasks: EditableTask[];
}

export function ActasClient({
  meetings,
  team,
  canRestrict,
}: {
  meetings: MeetingWithCount[];
  team: TeamMember[];
  /** Solo Dirección puede abrir o cerrar un acta. */
  canRestrict: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<"upload" | "review">("upload");
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [review, setReview] = React.useState<Review | null>(null);
  const [reading, setReading] = React.useState<MeetingWithCount | null>(null);

  function reset() {
    setPhase("upload");
    setTitle("");
    setDate("");
    setFile(null);
    setReview(null);
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title);
      if (date) fd.append("meeting_date", date);
      const res = await fetch("/api/actas/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast({ tone: "error", title: "No se pudo procesar", description: data.error });
        return;
      }
      const tasks: EditableTask[] = (data.tasks ?? []).map(
        (t: {
          name: string;
          assignee_ids: string[] | null;
          person_name: string | null;
          due_date: string | null;
          description: string | null;
        }) => ({
          include: true,
          name: t.name,
          assignee_ids: t.assignee_ids ?? [],
          person_name: t.person_name,
          due_date: t.due_date ?? "",
          description: t.description,
        }),
      );
      setReview({ meetingId: data.meeting.id, meetingTitle: data.meeting.title, tasks });
      setPhase("review");
      router.refresh();
    } catch {
      toast({ tone: "error", title: "Error de conexión" });
    } finally {
      setBusy(false);
    }
  }

  function patch(i: number, patch: Partial<EditableTask>) {
    setReview((r) =>
      r ? { ...r, tasks: r.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) } : r,
    );
  }

  async function onCreate() {
    if (!review) return;
    const chosen = review.tasks.filter((t) => t.include && t.name.trim());
    if (chosen.length === 0) {
      setOpen(false);
      reset();
      return;
    }
    setBusy(true);
    const res = await createActaTasks({
      meeting_id: review.meetingId,
      tasks: chosen.map((t) => ({
        name: t.name.trim(),
        assignee_ids: t.assignee_ids,
        person_name: t.assignee_ids.length === 0 ? t.person_name : null,
        due_date: t.due_date || null,
        description: t.description,
      })),
    });
    setBusy(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudieron crear", description: res.error });
      return;
    }
    toast({ tone: "success", title: `${res.count} tareas creadas`, description: review.meetingTitle });
    setOpen(false);
    reset();
    router.refresh();
  }

  async function onDownload(filePath: string) {
    const url = await getActaFileUrl(filePath);
    if (url) window.open(url, "_blank");
    else toast({ tone: "error", title: "No se pudo abrir el archivo" });
  }

  async function onToggleRestricted(m: MeetingWithCount) {
    if (!m.restricted && m.meeting_attendees.length === 0) {
      const ok = confirm(
        `"${m.title}" no tiene invitados registrados. Si la restringes, solo la verán Dirección y quien la subió. ¿Continuar?`,
      );
      if (!ok) return;
    }
    const res = await setMeetingRestricted(m.id, !m.restricted);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo cambiar", description: res.error });
      return;
    }
    toast({
      tone: "success",
      title: m.restricted ? "Acta abierta al equipo" : "Acta restringida",
      description: m.restricted
        ? undefined
        : `La verán ${m.meeting_attendees.length} invitados, Dirección y quien la subió.`,
    });
    router.refresh();
  }

  async function onDelete(m: MeetingWithCount) {
    if (!confirm(`¿Eliminar el acta "${m.title}"? Las tareas creadas se conservan.`)) return;
    const res = await deleteMeeting(m.id);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo eliminar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Acta eliminada" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Actas"
        description="Sube un acta de reunión y deja que la IA extraiga y asigne las tareas."
        actions={
          <Button
            size="sm"
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nueva acta
          </Button>
        }
      />

      {meetings.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="Sin actas"
          description="Sube la primera acta (PDF o Word) y la IA propondrá las tareas por persona."
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Nueva acta
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {meetings.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3 shadow-[var(--shadow-soft-sm)]"
            >
              <button
                onClick={() => setReading(m)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                title="Abrir el acta"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent-soft-fg">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{m.title}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {m.meeting_date ? formatDate(m.meeting_date) : formatDate(m.created_at)}
                    {m.file_name ? ` · ${m.file_name}` : ""}
                    {m.meeting_attendees.length > 0
                      ? ` · ${m.meeting_attendees.length} invitados`
                      : ""}
                  </p>
                </div>
              </button>
              {m.restricted && (
                <Badge
                  tone="warn"
                  title={
                    m.meeting_attendees.length > 0
                      ? `Solo la ven: ${m.meeting_attendees
                          .map((a) => a.name ?? a.email)
                          .filter(Boolean)
                          .join(", ")}`
                      : "Solo la ven Dirección y quien la subió — no hay invitados registrados"
                  }
                >
                  <Lock className="h-3 w-3" />
                  Restringida
                </Badge>
              )}
              <Badge
                tone="neutral"
                title={
                  m.taskLoad.length > 0
                    ? m.taskLoad.map((r) => `${r.name}: ${r.count}`).join("\n")
                    : "Esta acta no generó tareas"
                }
                className={m.taskLoad.length > 0 ? "cursor-help" : undefined}
              >
                {m.tasks?.[0]?.count ?? 0} tareas
              </Badge>
              {canRestrict && (
                <button
                  onClick={() => onToggleRestricted(m)}
                  className="rounded p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                  title={
                    m.restricted
                      ? "Abrir a todo el equipo"
                      : "Restringir a los invitados de la reunión"
                  }
                >
                  {m.restricted ? (
                    <LockOpen className="h-4 w-4" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                </button>
              )}
              {m.file_path && (
                <button
                  onClick={() => onDownload(m.file_path!)}
                  className="rounded p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                  title="Descargar acta"
                >
                  <FileDown className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => onDelete(m)}
                className="rounded p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                title="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <MeetingDetail
        // Remonta por acta: así el estado de carga se reinicia solo.
        key={reading?.id ?? "ninguna"}
        meeting={reading}
        open={reading !== null}
        onClose={() => setReading(null)}
        onDownload={onDownload}
      />

      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        size={phase === "review" ? "xl" : "md"}
        title={phase === "upload" ? "Nueva acta" : `Tareas propuestas · ${review?.meetingTitle ?? ""}`}
        footer={
          phase === "upload" ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button size="sm" onClick={onUpload} loading={busy} disabled={!file}>
                <Sparkles className="h-4 w-4" />
                Procesar con IA
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => { setOpen(false); reset(); }}>
                Cerrar
              </Button>
              <Button size="sm" onClick={onCreate} loading={busy}>
                Crear {review?.tasks.filter((t) => t.include).length ?? 0} tareas
              </Button>
            </>
          )
        }
      >
        {phase === "upload" ? (
          <form onSubmit={onUpload} className="space-y-4">
            <Field label="Título del acta">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej. Comité comercial — junio"
              />
            </Field>
            <Field label="Fecha de la reunión">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Archivo (PDF, Word o texto)" hint="Máximo 12 MB.">
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-fg-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent-fg hover:file:bg-accent-hover"
              />
            </Field>
            {busy && (
              <p className="flex items-center gap-2 text-sm text-fg-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Leyendo el acta y extrayendo tareas…
              </p>
            )}
          </form>
        ) : review && review.tasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-subtle">
            La IA no encontró tareas accionables en el acta. El acta quedó guardada.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-fg-subtle">
              Revisa, ajusta el responsable o la fecha, y desmarca las que no quieras crear.
            </p>
            {review?.tasks.map((t, i) => (
              <div
                key={i}
                className="rounded-[var(--radius-md)] border border-border p-3"
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={t.include}
                    onChange={(e) => patch(i, { include: e.target.checked })}
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      value={t.name}
                      onChange={(e) => patch(i, { name: e.target.value })}
                      className="font-medium"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <MultiSelect
                        label="Sin asignar"
                        options={team.map((m) => ({ value: m.id, label: m.name }))}
                        selected={t.assignee_ids}
                        onChange={(next) => patch(i, { assignee_ids: next })}
                        className="w-auto"
                      />
                      <div className="relative">
                        <Calendar className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
                        <Input
                          type="date"
                          value={t.due_date}
                          onChange={(e) => patch(i, { due_date: e.target.value })}
                          className="h-9 w-auto pl-7 text-sm"
                        />
                      </div>
                      {t.assignee_ids.length === 0 && t.person_name && (
                        <Badge tone="warn">Sugerido: {t.person_name}</Badge>
                      )}
                      {t.assignee_ids.length > 1 && (
                        <Badge tone="info">{t.assignee_ids.length} responsables</Badge>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-xs text-fg-subtle">{t.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
