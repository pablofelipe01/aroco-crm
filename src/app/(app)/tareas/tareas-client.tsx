"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { motion } from "framer-motion";
import {
  LayoutGrid,
  List,
  Plus,
  Search,
  X,
  Calendar,
  Trash2,
  Pencil,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, initials } from "@/lib/utils";
import { staggerContainer, fadeUp } from "@/lib/motion";
import {
  TASK_STATUSES,
  TASK_STATUS_META,
  type TaskStatus,
} from "@/lib/status";
import type { TeamMember } from "@/lib/types/database";
import type { TaskWithPerson } from "./page";
import { TaskForm } from "./task-form";
import { updateTaskStatus, deleteTask } from "./actions";

const TODAY = new Date().toISOString().slice(0, 10);
const isOverdue = (t: TaskWithPerson) =>
  !!t.due_date && t.due_date < TODAY && t.status !== "done";

function TaskCard({
  task,
  onEdit,
  onDelete,
  dragging,
}: {
  task: TaskWithPerson;
  onEdit?: () => void;
  onDelete?: () => void;
  dragging?: boolean;
}) {
  const overdue = isOverdue(task);
  return (
    <div
      className={cn(
        "group rounded-[var(--radius-md)] border border-border bg-surface p-3 shadow-[var(--shadow-soft-sm)] transition-all hover:border-border-strong hover:shadow-[var(--shadow-soft-md)]",
        dragging && "rotate-2 shadow-[var(--shadow-soft-lg)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium text-fg">{task.name}</p>
        {task.person && (
          <span
            title={task.person.name}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] text-white"
            style={{ backgroundColor: task.person.color ?? "var(--accent)" }}
          >
            {initials(task.person.name)}
          </span>
        )}
      </div>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-fg-subtle">
          {task.description}
        </p>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        {task.due_date ? (
          <span
            className={cn(
              "flex items-center gap-1 text-[11px]",
              overdue ? "font-medium text-danger" : "text-fg-subtle",
            )}
          >
            <Calendar className="h-3 w-3" />
            {formatDate(task.due_date)}
          </span>
        ) : (
          <span />
        )}
        {(onEdit || onDelete) && (
          <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {onEdit && (
              <button
                onClick={onEdit}
                className="rounded p-1 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                aria-label="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="rounded p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                aria-label="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

function DraggableTask({
  task,
  onEdit,
  onDelete,
}: {
  task: TaskWithPerson;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });
  return (
    <motion.div
      variants={fadeUp}
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1, touchAction: "none" }}
    >
      <div {...listeners} {...attributes}>
        <TaskCard task={task} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </motion.div>
  );
}

function Column({
  status,
  tasks,
  onEdit,
  onDelete,
}: {
  status: TaskStatus;
  tasks: TaskWithPerson[];
  onEdit: (t: TaskWithPerson) => void;
  onDelete: (t: TaskWithPerson) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = TASK_STATUS_META[status];
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <Badge tone={meta.tone} dot>
          {meta.label}
        </Badge>
        <span className="font-mono text-xs text-fg-subtle tnum">
          {tasks.length}
        </span>
      </div>
      <motion.div
        ref={setNodeRef}
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className={cn(
          "flex-1 space-y-2 rounded-[var(--radius-lg)] border border-dashed p-2 transition-colors",
          isOver ? "border-accent bg-accent-soft/40" : "border-border bg-bg-subtle/30",
        )}
      >
        {tasks.map((t) => (
          <DraggableTask
            key={t.id}
            task={t}
            onEdit={() => onEdit(t)}
            onDelete={() => onDelete(t)}
          />
        ))}
        {tasks.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-fg-subtle">
            Sin tareas
          </p>
        )}
      </motion.div>
    </div>
  );
}

export function TareasClient({
  initialTasks,
  team,
}: {
  initialTasks: TaskWithPerson[];
  team: TeamMember[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [tasks, setTasks] = React.useState(initialTasks);
  const [prevInit, setPrevInit] = React.useState(initialTasks);
  if (initialTasks !== prevInit) {
    setPrevInit(initialTasks);
    setTasks(initialTasks);
  }

  const [view, setView] = React.useState<"kanban" | "list">("kanban");
  const [query, setQuery] = React.useState("");
  const [fPerson, setFPerson] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TaskWithPerson | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  // Deep link from the command palette (?new=1).
  const searchParams = useSearchParams();
  React.useEffect(() => {
    if (!searchParams.get("new")) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open from deep link
    setEditing(null);
    setFormOpen(true);
    router.replace("/tareas");
  }, [searchParams, router]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (fPerson && t.person_id !== fPerson) return false;
      if (q) {
        const hay = `${t.name} ${t.description ?? ""} ${t.source ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, query, fPerson]);

  const byStatus = React.useMemo(() => {
    const map = new Map<TaskStatus, TaskWithPerson[]>();
    TASK_STATUSES.forEach((s) => map.set(s, []));
    filtered.forEach((t) => map.get(t.status as TaskStatus)?.push(t));
    return map;
  }, [filtered]);

  async function onStatusChange(id: string, status: TaskStatus) {
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
    const res = await updateTaskStatus(id, status);
    if (!res.ok) {
      setTasks(prev);
      toast({ tone: "error", title: "No se pudo mover", description: res.error });
    } else router.refresh();
  }

  async function onDelete(t: TaskWithPerson) {
    if (!confirm(`¿Eliminar la tarea "${t.name}"?`)) return;
    const res = await deleteTask(t.id);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo eliminar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Tarea eliminada" });
    router.refresh();
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const over = e.over?.id as TaskStatus | undefined;
    if (!over) return;
    const task = tasks.find((t) => t.id === id);
    if (task && task.status !== over) onStatusChange(id, over);
  }

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;
  const hasFilters = query || fPerson;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tareas"
        description={`${tasks.length} tareas${
          hasFilters ? ` · ${filtered.length} filtradas` : ""
        }`}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nueva tarea
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar tarea…"
              className="pl-9"
            />
          </div>
          <Select
            value={fPerson}
            onChange={(e) => setFPerson(e.target.value)}
            className="w-auto"
          >
            <option value="">Toda persona</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setFPerson("");
              }}
            >
              <X className="h-3.5 w-3.5" />
              Limpiar
            </Button>
          )}
        </div>

        <div className="inline-flex shrink-0 rounded-[var(--radius-md)] border border-border bg-surface p-0.5">
          {(
            [
              { v: "kanban", icon: LayoutGrid, label: "Kanban" },
              { v: "list", icon: List, label: "Lista" },
            ] as const
          ).map(({ v, icon: Icon, label }) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors",
                view === v ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {view === "kanban" ? (
        <DndContext
          sensors={sensors}
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {TASK_STATUSES.map((status) => (
              <Column
                key={status}
                status={status}
                tasks={byStatus.get(status) ?? []}
                onEdit={(t) => {
                  setEditing(t);
                  setFormOpen(true);
                }}
                onDelete={onDelete}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? (
              <div className="w-72">
                <TaskCard task={activeTask} dragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<List className="h-6 w-6" />}
          title="Sin tareas"
          description="No hay tareas que coincidan con los filtros."
        />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          <ul className="divide-y divide-border">
            {filtered.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-subtle/60"
              >
                <Badge tone={TASK_STATUS_META[t.status as TaskStatus].tone} dot>
                  {TASK_STATUS_META[t.status as TaskStatus].label}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{t.name}</p>
                  {t.person?.name && (
                    <p className="truncate text-xs text-fg-muted">
                      {t.person.name}
                    </p>
                  )}
                </div>
                {t.due_date && (
                  <span
                    className={cn(
                      "shrink-0 font-mono text-xs",
                      isOverdue(t) ? "font-medium text-danger" : "text-fg-subtle",
                    )}
                  >
                    {formatDate(t.due_date)}
                  </span>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => {
                      setEditing(t);
                      setFormOpen(true);
                    }}
                    className="rounded p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onDelete(t)}
                    className="rounded p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <TaskForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        team={team}
        initial={editing}
        onSaved={() => {
          setFormOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
