"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cotizar, type CotizadorInput, type Incoterm } from "@/lib/calc/cotizador";
import { formatUSD, formatCOP, formatNumber, cn } from "@/lib/utils";
import type { Quote } from "@/lib/types/database";
import { createQuote, updateQuote } from "./actions";

type LeadOption = { id: string; company: string; market: string | null };

type State = Record<string, string>;

const DEFAULTS: State = {
  incoterm: "FOB",
  lead_id: "",
  client_name: "",
  market: "Internacional",
  port_origin: "Buenaventura",
  port_destination: "",
  volume_tm: "25",
  validity_days: "15",
  trm: "4000",
  cocoa_usd_t: "3900",
  differential_pct: "5",
  purchase_price_cop_kg: "12100",
  commission_pct: "8",
  target_utility_pct: "8",
  transporte_bodega: "150",
  seleccion: "83",
  fumigacion: "0",
  estibas: "0",
  costales: "0",
  coberturas: "0",
  costos_exportacion: "720",
  bonif_calidad: "0",
  bonif_cadmio: "0",
  bonif_trazabilidad: "0",
  bonif_transporte: "0",
};

function quoteToState(q: Quote): State {
  const s: State = { ...DEFAULTS };
  const set = (k: string, v: unknown) => (s[k] = v == null ? "" : String(v));
  set("incoterm", q.incoterm);
  set("lead_id", q.lead_id ?? "");
  set("client_name", q.client_name ?? "");
  set("market", q.market ?? "");
  set("port_origin", q.port_origin ?? "");
  set("port_destination", q.port_destination ?? "");
  set("volume_tm", q.volume_tm);
  set("validity_days", q.validity_days ?? 15);
  set("trm", q.trm);
  set("cocoa_usd_t", q.cocoa_usd_t);
  set("differential_pct", q.differential * 100);
  set("purchase_price_cop_kg", q.purchase_price_cop_kg);
  set("commission_pct", q.commission_pct * 100);
  set("target_utility_pct", q.target_utility_pct * 100);
  set("transporte_bodega", q.transporte_bodega);
  set("seleccion", q.seleccion);
  set("fumigacion", q.fumigacion);
  set("estibas", q.estibas);
  set("costales", q.costales);
  set("coberturas", q.coberturas);
  set("costos_exportacion", q.costos_exportacion);
  set("bonif_calidad", q.bonif_calidad);
  set("bonif_cadmio", q.bonif_cadmio);
  set("bonif_trazabilidad", q.bonif_trazabilidad);
  set("bonif_transporte", q.bonif_transporte);
  return s;
}

function n(s: State, k: string): number {
  const v = Number(s[k]);
  return Number.isFinite(v) ? v : 0;
}

function stateToCotizador(s: State): CotizadorInput {
  return {
    incoterm: s.incoterm as Incoterm,
    trm: n(s, "trm"),
    precioCompraKg: n(s, "purchase_price_cop_kg"),
    cocoaUsdT: n(s, "cocoa_usd_t"),
    diferencial: n(s, "differential_pct") / 100,
    volumenTM: n(s, "volume_tm"),
    comisionPct: n(s, "commission_pct") / 100,
    transporteBodega: n(s, "transporte_bodega"),
    seleccion: n(s, "seleccion"),
    fumigacion: n(s, "fumigacion"),
    estibas: n(s, "estibas"),
    costales: n(s, "costales"),
    coberturas: n(s, "coberturas"),
    costosExportacion: n(s, "costos_exportacion"),
    targetUtilityPct: n(s, "target_utility_pct") / 100,
    bonifCalidad: n(s, "bonif_calidad"),
    bonifCadmio: n(s, "bonif_cadmio"),
    bonifTrazabilidad: n(s, "bonif_trazabilidad"),
    bonifTransporte: n(s, "bonif_transporte"),
  };
}

function NumField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <Field label={label}>
      <div className="relative">
        <Input
          type="number"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-12 font-mono tnum"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-fg-subtle">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}

export function QuoteCalculator({
  open,
  onClose,
  leads,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  leads: LeadOption[];
  initial: Quote | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [s, setS] = React.useState<State>(DEFAULTS);
  const [prevKey, setPrevKey] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const key = `${open}:${initial?.id ?? "new"}`;
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) setS(initial ? quoteToState(initial) : { ...DEFAULTS });
  }

  const set = (k: string, v: string) => setS((p) => ({ ...p, [k]: v }));

  const isNacional = s.incoterm === "NACIONAL";

  const result = React.useMemo(() => {
    try {
      return cotizar(stateToCotizador(s));
    } catch {
      return null;
    }
  }, [s]);

  function onPickLead(id: string) {
    const lead = leads.find((l) => l.id === id);
    setS((p) => ({
      ...p,
      lead_id: id,
      client_name: lead?.company ?? p.client_name,
      market: lead?.market ?? p.market,
    }));
  }

  async function onSave() {
    setSaving(true);
    const payload = { ...s, lead_id: s.lead_id || null };
    const res = initial
      ? await updateQuote(initial.id, payload)
      : await createQuote(payload);
    setSaving(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: initial ? "Cotización actualizada" : "Cotización creada" });
    onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={initial ? `Editar ${initial.quote_number ?? "cotización"}` : "Nueva cotización"}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onSave} loading={saving} disabled={!result}>
            {initial ? "Guardar cambios" : "Crear cotización"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Inputs */}
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Incoterm">
              <Select value={s.incoterm} onChange={(e) => set("incoterm", e.target.value)}>
                <option value="NACIONAL">NACIONAL</option>
                <option value="FOB">FOB</option>
                <option value="CIF">CIF</option>
              </Select>
            </Field>
            <Field label="Lead / cliente" className="col-span-2">
              <Select value={s.lead_id} onChange={(e) => onPickLead(e.target.value)}>
                <option value="">— Sin lead —</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.company}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre cliente" className="col-span-2">
              <Input value={s.client_name} onChange={(e) => set("client_name", e.target.value)} />
            </Field>
            <Field label="Mercado">
              <Select value={s.market} onChange={(e) => set("market", e.target.value)}>
                <option value="">—</option>
                <option value="Nacional">Nacional</option>
                <option value="Internacional">Internacional</option>
              </Select>
            </Field>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              Precio y volumen
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <NumField label="TRM" value={s.trm} onChange={(v) => set("trm", v)} suffix="COP/USD" />
              <NumField label="Compra" value={s.purchase_price_cop_kg} onChange={(v) => set("purchase_price_cop_kg", v)} suffix="COP/kg" />
              <NumField label="Volumen" value={s.volume_tm} onChange={(v) => set("volume_tm", v)} suffix="TM" />
              {!isNacional && (
                <>
                  <NumField label="Cocoa ref." value={s.cocoa_usd_t} onChange={(v) => set("cocoa_usd_t", v)} suffix="USD/T" />
                  <NumField label="Diferencial" value={s.differential_pct} onChange={(v) => set("differential_pct", v)} suffix="%" />
                </>
              )}
              <NumField label="Comisión" value={s.commission_pct} onChange={(v) => set("commission_pct", v)} suffix="%" />
              {isNacional && (
                <NumField label="Utilidad obj." value={s.target_utility_pct} onChange={(v) => set("target_utility_pct", v)} suffix="%" />
              )}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              Modificadores <span className="font-normal normal-case">(COP/kg)</span>
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <NumField label="Transp. bodega" value={s.transporte_bodega} onChange={(v) => set("transporte_bodega", v)} />
              <NumField label="Selección" value={s.seleccion} onChange={(v) => set("seleccion", v)} />
              <NumField label="Fumigación" value={s.fumigacion} onChange={(v) => set("fumigacion", v)} />
              <NumField label="Estibas" value={s.estibas} onChange={(v) => set("estibas", v)} />
              <NumField label="Costales" value={s.costales} onChange={(v) => set("costales", v)} />
              <NumField label="Coberturas" value={s.coberturas} onChange={(v) => set("coberturas", v)} />
              {!isNacional && (
                <NumField label="Costos export." value={s.costos_exportacion} onChange={(v) => set("costos_exportacion", v)} />
              )}
            </div>
          </section>

          {isNacional && (
            <section>
              <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                Bonificaciones
                <Badge tone="warn">Bonif. Calidad: confirmar fórmula</Badge>
              </h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <NumField label="Calidad" value={s.bonif_calidad} onChange={(v) => set("bonif_calidad", v)} suffix="USD/TM" />
                <NumField label="Cadmio" value={s.bonif_cadmio} onChange={(v) => set("bonif_cadmio", v)} suffix="COP/kg" />
                <NumField label="Trazabilidad" value={s.bonif_trazabilidad} onChange={(v) => set("bonif_trazabilidad", v)} suffix="COP/kg" />
                <NumField label="Transporte" value={s.bonif_transporte} onChange={(v) => set("bonif_transporte", v)} suffix="COP/kg" />
              </div>
            </section>
          )}
        </div>

        {/* Live results */}
        <div className="lg:sticky lg:top-0 lg:h-fit">
          <div className="rounded-[var(--radius-lg)] border border-border bg-gradient-to-b from-accent-soft/40 to-surface p-4">
            {result ? (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                  Precio final
                </p>
                <p className="mt-1 font-mono text-3xl font-bold tracking-tight text-fg tnum">
                  {formatUSD(result.precioFinalUsdTm)}
                  <span className="text-base font-normal text-fg-subtle"> /TM</span>
                </p>
                <p className="font-mono text-sm text-fg-muted tnum">
                  {formatCOP(result.precioFinalCopTm)} /TM
                </p>

                <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
                  {result.netCostK != null && (
                    <Row label="Costo neto (K)" value={formatUSD(result.netCostK)} />
                  )}
                  <Row label="Costo base" value={formatUSD(result.base.usdPerTm)} />
                  <Row label="Comisión" value={formatUSD(result.comisionUsdTm)} />
                  <Row label="Costo total" value={formatUSD(result.costoTotalUsdTm)} />
                  <Row
                    label="Utilidad"
                    value={`${(result.utilidadPct * 100).toFixed(2)}%`}
                    tone={result.utilidadPct >= 0 ? "good" : "bad"}
                  />
                </div>

                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs text-fg-subtle">
                    Total operación ({formatNumber(n(s, "volume_tm"))} TM)
                  </p>
                  <p className="mt-0.5 font-mono text-lg font-semibold text-accent tnum">
                    {formatUSD(result.totalOperacionUsd)}
                  </p>
                  <p className="font-mono text-xs text-fg-muted tnum">
                    {formatCOP(result.totalOperacionCop)}
                  </p>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-danger">
                Revisa los valores (TRM debe ser &gt; 0).
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-muted">{label}</span>
      <span
        className={cn(
          "font-mono font-medium tnum",
          tone === "good" && "text-success",
          tone === "bad" && "text-danger",
          !tone && "text-fg",
        )}
      >
        {value}
      </span>
    </div>
  );
}
