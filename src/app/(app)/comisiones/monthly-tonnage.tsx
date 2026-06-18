"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, Scale } from "lucide-react";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatNumber, cn } from "@/lib/utils";
import { MONTHLY_TON_TARGET } from "@/lib/calc/comisiones";
import type { MonthlyTonnage, TeamMember } from "@/lib/types/database";
import { saveMonthlyTonnage, deleteMonthlyTonnage } from "./actions";

const MARKETS = ["Nacional", "Internacional"] as const;
const ROLES = ["Compra+Venta", "Solo Venta", "Solo Compra"] as const;

function monthLabel(period: string) {
  return new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(
    new Date(`${period}-01T12:00:00`),
  );
}

interface FormState {
  id: string | null;
  agent: string;
  market: string;
  role: string;
  tons: string;
  note: string;
}

export function MonthlyTonnage({
  team,
  records,
  canWrite,
}: {
  team: TeamMember[];
  records: MonthlyTonnage[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const nowMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = React.useState(nowMonth);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState<FormState>({
    id: null,
    agent: "",
    market: "Nacional",
    role: "Compra+Venta",
    tons: "",
    note: "",
  });

  const agentName = React.useCallback(
    (id: string) => team.find((t) => t.id === id)?.name ?? "—",
    [team],
  );

  const rows = React.useMemo(
    () =>
      records
        .filter((r) => r.period.slice(0, 7) === month)
        .sort((a, b) => agentName(a.agent).localeCompare(agentName(b.agent))),
    [records, month, agentName],
  );

  const totals = React.useMemo(() => {
    const t = { Nacional: 0, Internacional: 0 };
    for (const r of rows) t[r.market] += Number(r.tons) || 0;
    return t;
  }, [rows]);

  function openNew() {
    setForm({ id: null, agent: "", market: "Nacional", role: "Compra+Venta", tons: "", note: "" });
    setOpen(true);
  }

  function openEdit(r: MonthlyTonnage) {
    setForm({
      id: r.id,
      agent: r.agent,
      market: r.market,
      role: r.role,
      tons: String(r.tons),
      note: r.note ?? "",
    });
    setOpen(true);
  }

  async function onSave() {
    if (!form.agent) {
      toast({ tone: "error", title: "Elige un comercial" });
      return;
    }
    setSaving(true);
    const res = await saveMonthlyTonnage({
      agent: form.agent,
      period: month,
      market: form.market,
      role: form.role,
      tons: form.tons,
      note: form.note || null,
    });
    setSaving(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Tonelaje registrado" });
    setOpen(false);
    router.refresh();
  }

  async function onDelete(r: MonthlyTonnage) {
    if (!confirm(`¿Eliminar el registro de ${agentName(r.agent)} (${r.market})?`)) return;
    const res = await deleteMonthlyTonnage(r.id);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo eliminar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Registro eliminado" });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-accent" />
          Tonelaje mensual por comercial
        </CardTitle>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-40"
          />
          {canWrite && (
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4" />
              Registrar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardBody>
        <p className="mb-3 text-xs text-fg-subtle">
          Meta mensual: <span className="font-medium text-fg-muted">48 T nacional</span> ·{" "}
          <span className="font-medium text-fg-muted">50 T internacional</span> — {monthLabel(month)}.
        </p>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Scale className="h-6 w-6" />}
            title="Sin registros este mes"
            description={canWrite ? "Usa “Registrar” para cargar el tonelaje." : undefined}
          />
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-3 text-left font-medium">Comercial</th>
                  <th className="px-4 py-3 text-left font-medium">Mercado</th>
                  <th className="px-4 py-3 text-left font-medium">Participación</th>
                  <th className="px-4 py-3 text-right font-medium">Toneladas</th>
                  <th className="px-4 py-3 text-left font-medium">Avance vs meta</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const target = MONTHLY_TON_TARGET[r.market];
                  const tons = Number(r.tons) || 0;
                  const pct = target > 0 ? (tons / target) * 100 : 0;
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-fg">{agentName(r.agent)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={r.market === "Internacional" ? "info" : "neutral"}>
                          {r.market}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-fg-muted">{r.role}</td>
                      <td className="px-4 py-3 text-right font-mono tnum font-medium text-fg">
                        {formatNumber(tons, 1)} / {target} T
                      </td>
                      <td className="px-4 py-3">
                        <ProgressBar pct={pct} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canWrite && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(r)}
                              className="rounded p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                              aria-label="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => onDelete(r)}
                              className="rounded p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                              aria-label="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border text-fg-muted">
                  <td className="px-4 py-3 text-xs uppercase tracking-wide" colSpan={3}>
                    Total del mes
                  </td>
                  <td className="px-4 py-3 text-right font-mono tnum text-fg" colSpan={3}>
                    {formatNumber(totals.Nacional, 1)} T nac. · {formatNumber(totals.Internacional, 1)} T intl.
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardBody>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        title={form.id ? "Editar tonelaje" : "Registrar tonelaje"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={onSave} loading={saving}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Mes" className="sm:col-span-2">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <Field label="Comercial" className="sm:col-span-2">
            <Select
              value={form.agent}
              onChange={(e) => setForm((f) => ({ ...f, agent: e.target.value }))}
            >
              <option value="">— Elegir —</option>
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mercado">
            <Select
              value={form.market}
              onChange={(e) => setForm((f) => ({ ...f, market: e.target.value }))}
            >
              {MARKETS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Participación">
            <Select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Toneladas movidas">
            <Input
              type="number"
              step="any"
              min="0"
              value={form.tons}
              onChange={(e) => setForm((f) => ({ ...f, tons: e.target.value }))}
              className="font-mono tnum"
            />
          </Field>
          <Field label="Nota (opcional)">
            <Input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const tone =
    pct >= 100 ? "bg-success" : pct >= 70 ? "bg-warn" : "bg-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-28 overflow-hidden rounded-full bg-bg-subtle">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${clamped}%` }} />
      </div>
      <span className="font-mono text-xs tnum text-fg-subtle">{Math.round(pct)}%</span>
    </div>
  );
}
