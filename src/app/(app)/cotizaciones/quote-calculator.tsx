"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cotizar, esViable, type CotizadorInput, type Incoterm } from "@/lib/calc/cotizador";
import { comisionPorDefecto, type Parametros } from "@/lib/cotizador-parametros";
import { fijosDe, type Fijos } from "@/lib/schemas/quote";
import { formatUSD, cn } from "@/lib/utils";
import { useT, useFormatos } from "@/lib/i18n/provider";
import type { Quote } from "@/lib/types/database";
import { createQuote, updateQuote } from "./actions";
import type { ReferenciasMercado } from "./page";

type LeadOption = { id: string; company: string; market: string | null };

type State = Record<string, string>;

const pct = (r: number) => String(Math.round(r * 1e6) / 1e4);

/** A new quote starts from the admin parameters and today's market. */
function nuevoEstado(p: Parametros, ref: ReferenciasMercado): State {
  return {
    incoterm: "FOB",
    lead_id: "",
    client_name: "",
    market: "Internacional",
    port_origin: "Buenaventura",
    port_destination: "",
    volume_tm: "25",
    validity_days: "15",
    trm: ref.trm != null ? String(ref.trm) : "",
    cocoa_usd_t: ref.cocoaUsdT != null ? String(ref.cocoaUsdT) : "",
    differential_pct: "0",
    purchase_price_cop_kg: "",
    commission_pct: pct(comisionPorDefecto(p, "FOB")),
    transporte_bodega: String(p.transporte_bodega),
    seleccion: String(p.seleccion),
    fumigacion: String(p.fumigacion),
    estibas: String(p.estibas),
    costales: String(p.costales),
    coberturas: String(p.coberturas),
    costos_exportacion: String(p.costos_exportacion),
    bonif_calidad_proveedor_pct: pct(p.bonif_calidad_proveedor_pct),
    bonif_cadmio: String(p.bonif_cadmio),
    bonif_trazabilidad: String(p.bonif_trazabilidad),
    bonif_transporte: String(p.bonif_transporte),
  };
}

function quoteToState(q: Quote): State {
  const s: State = {};
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
  set("differential_pct", pct(q.differential));
  set("purchase_price_cop_kg", q.purchase_price_cop_kg);
  set("commission_pct", pct(q.commission_pct));
  set("transporte_bodega", q.transporte_bodega);
  set("seleccion", q.seleccion);
  set("fumigacion", q.fumigacion);
  set("estibas", q.estibas);
  set("costales", q.costales);
  set("coberturas", q.coberturas);
  set("costos_exportacion", q.costos_exportacion);
  set("bonif_calidad_proveedor_pct", pct(q.bonif_calidad_proveedor_pct));
  set("bonif_cadmio", q.bonif_cadmio);
  set("bonif_trazabilidad", q.bonif_trazabilidad);
  set("bonif_transporte", q.bonif_transporte);
  return s;
}

function n(s: State, k: string): number {
  const v = Number(s[k]);
  return Number.isFinite(v) ? v : 0;
}

function stateToCotizador(s: State, fijos: Fijos): CotizadorInput {
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
    fncPct: fijos.fnc_pct,
    mermaPct: fijos.merma_pct,
    factorNacional: fijos.factor_nacional,
    bonifCalidadPct: fijos.bonif_calidad_pct,
    bonifCalidadProveedorPct: n(s, "bonif_calidad_proveedor_pct") / 100,
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
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
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
  parametros,
  referencias,
}: {
  open: boolean;
  onClose: () => void;
  leads: LeadOption[];
  initial: Quote | null;
  onSaved: () => void;
  parametros: Parametros;
  referencias: ReferenciasMercado;
}) {
  const { toast } = useToast();
  const t = useT();
  const f = useFormatos();
  const [s, setS] = React.useState<State>(() => nuevoEstado(parametros, referencias));
  const [prevKey, setPrevKey] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const key = `${open}:${initial?.id ?? "new"}`;
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) setS(initial ? quoteToState(initial) : nuevoEstado(parametros, referencias));
  }

  const set = (k: string, v: string) => setS((p) => ({ ...p, [k]: v }));

  function onIncoterm(incoterm: Incoterm) {
    setS((p) => ({
      ...p,
      incoterm,
      commission_pct: pct(comisionPorDefecto(parametros, incoterm)),
    }));
  }

  const isNacional = s.incoterm === "NACIONAL";
  // An existing quote keeps the parameters it was created with.
  const fijos: Fijos = React.useMemo(() => fijosDe(initial ?? parametros), [initial, parametros]);
  const umbral = parametros.umbral_viable;

  const result = React.useMemo(() => {
    if (n(s, "purchase_price_cop_kg") <= 0) return null;
    try {
      return cotizar(stateToCotizador(s, fijos));
    } catch {
      return null;
    }
  }, [s, fijos]);

  const hintCocoa =
    referencias.cocoaUsdT == null
      ? t.cotizador.sinPrecioMercado
      : `ICE NY · ${referencias.cocoaEnVivo ? t.cotizador.enVivo : t.cotizador.cierre} ${
          referencias.cocoaFecha ? f.fecha(referencias.cocoaFecha) : ""
        } · ${f.numero(referencias.cocoaUsdT, 0)}`;
  const hintTrm =
    referencias.trm == null
      ? undefined
      : `${t.cotizador.trmOficial} ${referencias.trmFecha ? f.fecha(referencias.trmFecha) : ""} · ${f.numero(referencias.trm, 2)}`;

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
      toast({
        tone: "error",
        title: t.cotizador.noSeGuardo,
        description: res.error,
      });
      return;
    }
    toast({
      tone: "success",
      title: initial ? t.cotizador.actualizada : t.cotizador.creada,
    });
    onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        initial
          ? `${t.cotizador.editar} ${initial.quote_number ?? t.cotizador.cotizacion}`
          : t.cotizaciones.nueva
      }
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t.comun.cancelar}
          </Button>
          <Button size="sm" onClick={onSave} loading={saving} disabled={!result}>
            {initial ? t.cotizador.guardarCambios : t.cotizador.crear}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Inputs */}
        <div className="space-y-5">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label={t.cotizaciones.incoterm}>
              <Select value={s.incoterm} onChange={(e) => onIncoterm(e.target.value as Incoterm)}>
                <option value="NACIONAL">NACIONAL</option>
                <option value="FOB">FOB</option>
                <option value="CIF">CIF</option>
              </Select>
            </Field>
            <Field label={t.cotizador.leadCliente} className="col-span-2">
              <Select value={s.lead_id} onChange={(e) => onPickLead(e.target.value)}>
                <option value="">{t.cotizador.sinLead}</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.company}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.cotizador.nombreCliente} className="col-span-2">
              <Input value={s.client_name} onChange={(e) => set("client_name", e.target.value)} />
            </Field>
            <Field label={t.cotizador.mercado}>
              <Select value={s.market} onChange={(e) => set("market", e.target.value)}>
                <option value="">—</option>
                <option value="Nacional">{t.mercados.Nacional}</option>
                <option value="Internacional">{t.mercados.Internacional}</option>
              </Select>
            </Field>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {t.cotizador.precioVolumen}
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <NumField label="TRM" value={s.trm} onChange={(v) => set("trm", v)} suffix="COP/USD" hint={hintTrm} />
              <NumField label={t.cotizador.compra} value={s.purchase_price_cop_kg} onChange={(v) => set("purchase_price_cop_kg", v)} suffix="COP/kg" />
              <NumField label={t.cotizador.volumen} value={s.volume_tm} onChange={(v) => set("volume_tm", v)} suffix="TM" />
              {!isNacional && (
                <>
                  <NumField label={t.cotizador.cocoaRef} value={s.cocoa_usd_t} onChange={(v) => set("cocoa_usd_t", v)} suffix="USD/T" hint={hintCocoa} />
                  <NumField label={t.cotizador.diferencial} value={s.differential_pct} onChange={(v) => set("differential_pct", v)} suffix="%" />
                </>
              )}
              <NumField label={t.cotizador.comision} value={s.commission_pct} onChange={(v) => set("commission_pct", v)} suffix="%" />
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {t.cotizador.modificadores}{" "}
              <span className="font-normal normal-case">(COP/kg)</span>
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <NumField label={t.cotizador.transpBodega} value={s.transporte_bodega} onChange={(v) => set("transporte_bodega", v)} />
              <NumField label={t.cotizador.seleccion} value={s.seleccion} onChange={(v) => set("seleccion", v)} />
              <NumField label={t.cotizador.fumigacion} value={s.fumigacion} onChange={(v) => set("fumigacion", v)} />
              <NumField label={t.cotizador.estibas} value={s.estibas} onChange={(v) => set("estibas", v)} />
              <NumField label={t.cotizador.costales} value={s.costales} onChange={(v) => set("costales", v)} />
              <NumField label={t.cotizador.coberturas} value={s.coberturas} onChange={(v) => set("coberturas", v)} />
              {!isNacional && (
                <NumField label={t.cotizador.costosExport} value={s.costos_exportacion} onChange={(v) => set("costos_exportacion", v)} />
              )}
            </div>
            <p className="mt-2 text-xs text-fg-subtle">
              {t.cotizador.fijosNota}{" "}
              <span className="font-mono tnum">
                FNC {pct(fijos.fnc_pct)} % · {t.cotizador.merma} {pct(fijos.merma_pct)} %
                {isNacional &&
                  ` · ${t.cotizador.factorNacional} ${fijos.factor_nacional} · ${t.cotizador.calidad} ${pct(fijos.bonif_calidad_pct)} %`}
              </span>
            </p>
          </section>

          {isNacional && (
            <section>
              <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {t.cotizador.bonificaciones}
              </h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <NumField
                  label={t.cotizador.calidadProveedor}
                  value={s.bonif_calidad_proveedor_pct}
                  onChange={(v) => set("bonif_calidad_proveedor_pct", v)}
                  suffix="%"
                  hint={
                    result
                      ? `${t.cotizador.calidadAroco}: ${formatUSD(result.bonifCalidadUsdTm)} /TM`
                      : undefined
                  }
                />
                <NumField label={t.cotizador.cadmio} value={s.bonif_cadmio} onChange={(v) => set("bonif_cadmio", v)} suffix="COP/kg" />
                <NumField label={t.cotizador.trazabilidad} value={s.bonif_trazabilidad} onChange={(v) => set("bonif_trazabilidad", v)} suffix="COP/kg" />
                <NumField label={t.cotizador.transporte} value={s.bonif_transporte} onChange={(v) => set("bonif_transporte", v)} suffix="COP/kg" />
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
                  {t.cotizador.precioFinal}
                </p>
                <p className="mt-1 font-mono text-3xl font-bold tracking-tight text-fg tnum">
                  {formatUSD(result.precioFinalUsdTm)}
                  <span className="text-base font-normal text-fg-subtle"> /TM</span>
                </p>
                <p className="font-mono text-sm text-fg-muted tnum">
                  {f.cop(result.precioFinalCopTm)} /TM
                </p>

                <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
                  {result.netCostK != null && (
                    <Row label={t.cotizador.costoNetoK} value={formatUSD(result.netCostK)} />
                  )}
                  <Row
                    label={t.cotizador.costoBase}
                    value={formatUSD(result.base.usdPerTm)}
                  />
                  <Row
                    label={t.cotizador.comision}
                    value={formatUSD(result.comisionUsdTm)}
                  />
                  <Row
                    label={t.cotizador.costoTotal}
                    value={formatUSD(result.costoTotalUsdTm)}
                  />
                  <Row
                    label={t.cotizador.utilidad}
                    value={`${(result.utilidadPct * 100).toFixed(2)}%`}
                    tone={esViable(result.utilidadPct, umbral) ? "good" : "bad"}
                  />
                </div>
                <div className="mt-3">
                  {esViable(result.utilidadPct, umbral) ? (
                    <Badge tone="success">{t.cotizador.viable}</Badge>
                  ) : (
                    <Badge tone="danger">
                      {t.cotizador.noViable} (&lt; {pct(umbral)} %)
                    </Badge>
                  )}
                </div>

                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs text-fg-subtle">
                    {t.cotizador.totalOperacion} ({f.numero(n(s, "volume_tm"), 1)}{" "}
                    {t.unidades.tm})
                  </p>
                  <p className="mt-0.5 font-mono text-lg font-semibold text-accent tnum">
                    {formatUSD(result.totalOperacionUsd)}
                  </p>
                  <p className="font-mono text-xs text-fg-muted tnum">
                    {f.cop(result.totalOperacionCop)}
                  </p>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-danger">
                {t.cotizador.revisaValores}
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
