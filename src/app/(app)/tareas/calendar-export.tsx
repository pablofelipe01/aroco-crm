"use client";

import * as React from "react";
import { Sparkles, Loader2, Download, CalendarPlus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { buildICS, icsStamp } from "@/lib/calendar/ics";
import type { TaskWithPerson } from "./page";

const cd = (d: string) => d.replace(/-/g, "");
const ct = (t: string) => `${t.replace(":", "")}00`;
function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function slug(s: string): string {
  return s.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "tarea";
}

export function CalendarExport({
  task,
  open,
  onClose,
}: {
  task: TaskWithPerson | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [loading, setLoading] = React.useState(false);
  const [rationale, setRationale] = React.useState<string | null>(null);
  const [allDay, setAllDay] = React.useState(false);
  const [date, setDate] = React.useState(today);
  const [start, setStart] = React.useState("09:00");
  const [end, setEnd] = React.useState("10:00");

  const suggest = React.useCallback(async (t: TaskWithPerson) => {
    setLoading(true);
    setRationale(null);
    try {
      const res = await fetch("/api/tareas/suggest-slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: t.name,
          description: t.description,
          due_date: t.due_date,
          person_id: t.person_id,
          person_name: t.person?.name ?? t.person_name,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setDate(data.date);
        setStart(data.start);
        setEnd(data.end);
        setAllDay(false);
        setRationale(data.rationale || null);
      }
    } catch {
      /* keep the manual fallback values */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync modal to the opened task */
    if (open && task) {
      // Sensible fallback before the AI responds: the due date (all-day).
      setDate(task.due_date ?? today);
      setStart("09:00");
      setEnd("10:00");
      setAllDay(false);
      void suggest(task);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, task, today, suggest]);

  if (!task) return null;

  function download() {
    if (!task) return;
    const ics = buildICS(
      {
        uid: `${task.id}@aroco`,
        title: task.name,
        description: task.description,
        date,
        start: allDay ? undefined : start,
        end: allDay ? undefined : end,
        allDay,
      },
      icsStamp(new Date()),
    );
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(task.name)}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ tone: "success", title: "Evento descargado", description: "Ábrelo para agregarlo a tu calendario." });
  }

  const googleUrl = (() => {
    const u = new URL("https://calendar.google.com/calendar/render");
    u.searchParams.set("action", "TEMPLATE");
    u.searchParams.set("text", task.name);
    u.searchParams.set(
      "dates",
      allDay
        ? `${cd(date)}/${cd(nextDay(date))}`
        : `${cd(date)}T${ct(start)}/${cd(date)}T${ct(end > start ? end : start)}`,
    );
    if (task.description) u.searchParams.set("details", task.description);
    return u.toString();
  })();

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Agregar al calendario"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cerrar
          </Button>
          <a href={googleUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm">
              <CalendarPlus className="h-4 w-4" />
              Google Calendar
            </Button>
          </a>
          <Button size="sm" onClick={download}>
            <Download className="h-4 w-4" />
            Descargar .ics
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-fg">{task.name}</p>
          {task.person?.name && (
            <p className="text-xs text-fg-muted">{task.person.name}</p>
          )}
        </div>

        <div className="rounded-[var(--radius-md)] border border-accent/40 bg-accent-soft/20 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-soft-fg">
            <Sparkles className="h-3.5 w-3.5" />
            Sugerencia de la IA
          </p>
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-fg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analizando carga de trabajo…
            </p>
          ) : rationale ? (
            <p className="text-sm leading-relaxed text-fg">{rationale}</p>
          ) : (
            <p className="text-sm text-fg-subtle">
              Ajusta la fecha y la hora abajo, o descarga el evento.
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Todo el día
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {!allDay && (
            <>
              <Field label="Inicio">
                <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="Fin">
                <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
