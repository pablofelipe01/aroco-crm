"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Calculator } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatCOP, formatPct, cn } from "@/lib/utils";
import {
  simulateCommission,
  pctForRole,
  splitCommission,
  type CommissionRule as CalcRule,
  type Market,
  type CommissionLevel,
  type CommissionRole,
} from "@/lib/calc/comisiones";
import type { CommissionRule, TeamMember } from "@/lib/types/database";
import { updateCommissionRule, saveCommissionCalc } from "./actions";

const MARKETS: Market[] = ["Nacional", "Internacional"];
const LEVELS: CommissionLevel[] = ["Senior", "Junior"];
const ROLES: CommissionRole[] = ["Compra+Venta", "Solo Venta", "Solo Compra"];

export function ComisionesClient({
  rules,
  team,
  canWrite,
  canEditRules,
}: {
  rules: CommissionRule[];
  team: TeamMember[];
  canWrite: boolean;
  canEditRules: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const calcRules: CalcRule[] = rules.map((r) => ({
    market: r.market as Market,
    level: r.level as CommissionLevel,
    pct_full: r.pct_full,
  }));

  // Simulator state
  const [venta, setVenta] = React.useState("65000");
  const [costo, setCosto] = React.useState("36000");
  const [market, setMarket] = React.useState<Market>("Internacional");
  const [level, setLevel] = React.useState<CommissionLevel>("Senior");
  const [role, setRole] = React.useState<CommissionRole>("Compra+Venta");
  const [agent, setAgent] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const result = React.useMemo(() => {
    try {
      return simulateCommission({
        ventaTotal: Number(venta) || 0,
        costoTotal: Number(costo) || 0,
        market,
        level,
        role,
        rules: calcRules,
      });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venta, costo, market, level, role, rules]);

  const split =
    result && role === "Compra+Venta" ? splitCommission(result.comision) : null;

  async function onSave() {
    setSaving(true);
    const res = await saveCommissionCalc({
      sale_total_cop: Number(venta) || 0,
      cost_total_cop: Number(costo) || 0,
      market,
      level,
      role,
      agent: agent || null,
    });
    setSaving(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Cálculo guardado" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comisiones"
        description="Simula la comisión de una operación y administra las reglas por mercado y nivel."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Simulator */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-accent" />
              Simulador
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Venta total (COP)">
                <Input
                  type="number"
                  value={venta}
                  onChange={(e) => setVenta(e.target.value)}
                  className="font-mono tnum"
                />
              </Field>
              <Field label="Costo total (COP)">
                <Input
                  type="number"
                  value={costo}
                  onChange={(e) => setCosto(e.target.value)}
                  className="font-mono tnum"
                />
              </Field>
              <Field label="Mercado">
                <Select value={market} onChange={(e) => setMarket(e.target.value as Market)}>
                  {MARKETS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Nivel">
                <Select value={level} onChange={(e) => setLevel(e.target.value as CommissionLevel)}>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Rol">
                <Select value={role} onChange={(e) => setRole(e.target.value as CommissionRole)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Agente (opcional)">
                <Select value={agent} onChange={(e) => setAgent(e.target.value)}>
                  <option value="">— Sin asignar —</option>
                  {team.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {canWrite && (
              <div className="flex justify-end">
                <Button size="sm" onClick={onSave} loading={saving} disabled={!result}>
                  <Save className="h-4 w-4" />
                  Guardar cálculo
                </Button>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Result */}
        <div className="lg:sticky lg:top-0 lg:h-fit">
          <div className="rounded-[var(--radius-lg)] border border-border bg-gradient-to-b from-accent-soft/40 to-surface p-5">
            {result ? (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                  Comisión
                </p>
                <p className="mt-1 font-mono text-3xl font-bold text-fg tnum">
                  {formatCOP(result.comision)}
                </p>
                <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
                  <Row label="Utilidad bruta" value={formatCOP(result.utilidadBruta)} />
                  <Row label="Margen" value={formatPct(result.margen)} />
                  <Row label="% nivel (full)" value={formatPct(result.pctFull, 1)} />
                  <Row label="% aplicable" value={formatPct(result.pctAplicable, 1)} />
                </div>
                {split && (
                  <div className="mt-4 border-t border-border pt-3 text-sm">
                    <p className="mb-1.5 text-xs text-fg-subtle">
                      Reparto entre dos agentes
                    </p>
                    <Row label="Venta (60%)" value={formatCOP(split.venta)} />
                    <Row label="Compra (40%)" value={formatCOP(split.compra)} />
                  </div>
                )}
              </>
            ) : (
              <p className="py-6 text-center text-sm text-danger">
                Sin regla para {market} / {level}.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Rules table */}
      <Card>
        <CardHeader>
          <CardTitle>Reglas de comisión</CardTitle>
          {canEditRules ? (
            <Badge tone="accent">Editable</Badge>
          ) : (
            <Badge tone="neutral">Solo lectura</Badge>
          )}
        </CardHeader>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 text-left font-medium">Mercado</th>
                <th className="px-4 py-3 text-left font-medium">Nivel</th>
                <th className="px-4 py-3 text-right font-medium">% Full (C+V)</th>
                <th className="px-4 py-3 text-right font-medium">Solo Venta (60%)</th>
                <th className="px-4 py-3 text-right font-medium">Solo Compra (40%)</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <RuleRow
                  key={r.id}
                  rule={r}
                  editable={canEditRules}
                  onSaved={() => router.refresh()}
                />
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

function RuleRow({
  rule,
  editable,
  onSaved,
}: {
  rule: CommissionRule;
  editable: boolean;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [pct, setPct] = React.useState(String((rule.pct_full * 100).toFixed(2)));
  const [saving, setSaving] = React.useState(false);
  const ratio = (Number(pct) || 0) / 100;

  async function save() {
    setSaving(true);
    const res = await updateCommissionRule(rule.id, ratio);
    setSaving(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Regla actualizada" });
    onSaved();
  }

  const dirty = Math.abs(ratio - rule.pct_full) > 1e-9;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3 text-fg">{rule.market}</td>
      <td className="px-4 py-3 text-fg-muted">{rule.level}</td>
      <td className="px-4 py-2 text-right">
        {editable ? (
          <div className="flex items-center justify-end gap-2">
            <div className="relative w-24">
              <Input
                type="number"
                step="any"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                className="h-8 pr-6 text-right font-mono tnum"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">
                %
              </span>
            </div>
            {dirty && (
              <Button size="sm" variant="secondary" onClick={save} loading={saving}>
                Guardar
              </Button>
            )}
          </div>
        ) : (
          <span className="font-mono tnum">{formatPct(rule.pct_full, 1)}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono tnum text-fg-muted">
        {formatPct(pctForRole(ratio, "Solo Venta"), 1)}
      </td>
      <td className="px-4 py-3 text-right font-mono tnum text-fg-muted">
        {formatPct(pctForRole(ratio, "Solo Compra"), 1)}
      </td>
    </tr>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("flex items-center justify-between")}>
      <span className="text-fg-muted">{label}</span>
      <span className="font-mono font-medium text-fg tnum">{value}</span>
    </div>
  );
}
