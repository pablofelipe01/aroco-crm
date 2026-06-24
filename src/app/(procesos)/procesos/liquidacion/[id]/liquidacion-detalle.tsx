"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, CheckCircle2, ExternalLink, Lock } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  calcularLiquidacion,
  PARAMS_DEFAULT,
  type LiquidacionParams,
} from "@/lib/calc/liquidacion";
import type { Liquidacion } from "@/lib/types/database";
import { guardarLiquidacion, aprobarLiquidacion } from "../actions";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const PARAM_FIELDS: { key: keyof LiquidacionParams; label: string; sufijo?: string }[] = [
  { key: "humedadMaxPct", label: "Humedad máxima", sufijo: "%" },
  { key: "tasaDescuentoHumedad", label: "Descuento por punto de humedad", sufijo: "% base" },
  { key: "impurezasMaxPct", label: "Impurezas máximas", sufijo: "%" },
  { key: "tasaDescuentoImpurezas", label: "Descuento por punto de impurezas", sufijo: "% base" },
  { key: "fermentacionMinPct", label: "Fermentación mínima", sufijo: "%" },
  { key: "tasaBonifFermentacion", label: "Bonificación por punto de fermentación", sufijo: "% base" },
  { key: "ajusteManualDescuento", label: "Ajuste manual de sanción", sufijo: "COP" },
  { key: "ajusteManualBonificacion", label: "Ajuste manual de bonificación", sufijo: "COP" },
];

export function LiquidacionDetalle({
  liquidacion,
  ordenId,
  consecutivo,
  proveedorNombre,
  canWrite,
}: {
  liquidacion: Liquidacion;
  ordenId: string | null;
  consecutivo: string | null;
  proveedorNombre: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const l = liquidacion;
  const aprobada = l.estado === "Aprobada";
  const editable = canWrite && !aprobada;

  const initialParams: LiquidacionParams = {
    ...PARAMS_DEFAULT,
    ...((l.params ?? {}) as Partial<LiquidacionParams>),
  };
  const [params, setParams] = React.useState<LiquidacionParams>(initialParams);
  const [obs, setObs] = React.useState(l.observaciones ?? "");
  const [saving, setSaving] = React.useState(false);
  const [approving, setApproving] = React.useState(false);

  const calc = React.useMemo(
    () =>
      calcularLiquidacion({
        pesoRecibidoKg: l.peso_recibido_kg ?? 0,
        precioKg: l.precio_kg ?? 0,
        humedadPct: l.humedad_pct,
        fermentacionPct: l.fermentacion_pct,
        impurezasPct: l.impurezas_pct,
        params,
      }),
    [params, l.peso_recibido_kg, l.precio_kg, l.humedad_pct, l.fermentacion_pct, l.impurezas_pct],
  );

  function setParam(k: keyof LiquidacionParams, v: string) {
    setParams((p) => ({ ...p, [k]: v === "" ? 0 : Number(v) }));
  }

  async function guardar() {
    setSaving(true);
    const res = await guardarLiquidacion(l.id, params, obs);
    setSaving(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Liquidación recalculada" });
    router.refresh();
  }

  async function aprobar() {
    if (!confirm("Al aprobar, la liquidación queda inmodificable. ¿Continuar?")) return;
    setApproving(true);
    const res = await aprobarLiquidacion(l.id);
    setApproving(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo aprobar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Liquidación aprobada" });
    router.refresh();
  }

  const snapshot: [string, string][] = [
    ["Peso recibido", l.peso_recibido_kg != null ? `${l.peso_recibido_kg.toLocaleString("es-CO")} kg` : "—"],
    ["Precio/kg", l.precio_kg != null ? COP.format(l.precio_kg) : "—"],
    ["Humedad", l.humedad_pct != null ? `${l.humedad_pct}%` : "—"],
    ["Fermentación", l.fermentacion_pct != null ? `${l.fermentacion_pct}%` : "—"],
    ["Impurezas", l.impurezas_pct != null ? `${l.impurezas_pct}%` : "—"],
  ];

  const lineas: [string, number, "neg" | "pos" | null][] = [
    ["Valor base", calc.valorBase, null],
    ["Descuento humedad", -calc.descuentoHumedad, "neg"],
    ["Descuento impurezas", -calc.descuentoImpurezas, "neg"],
    ["Ajuste manual (sanción)", -calc.ajusteManualDescuento, "neg"],
    ["Bonificación fermentación", calc.bonifFermentacion, "pos"],
    ["Ajuste manual (bonificación)", calc.ajusteManualBonificacion, "pos"],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/procesos/liquidacion"
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" /> Liquidación / Pago
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-fg">
            Liquidación · <span className="font-mono">{consecutivo ?? "OC"}</span>
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-fg-muted">
            {proveedorNombre}
            <Badge tone={aprobada ? "success" : "warn"}>{l.estado}</Badge>
          </p>
        </div>
        {ordenId && (
          <Link
            href={`/procesos/ordenes/${ordenId}`}
            className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
          >
            Ver OC <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {aprobada && (
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-success/40 bg-success/5 p-3 text-sm text-success">
          <Lock className="h-4 w-4" /> Liquidado aprobado — inmodificable. Listo para facturación.
        </div>
      )}

      {/* Snapshot calidad */}
      <Card>
        <CardHeader>
          <CardTitle>Datos de la recepción</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-5">
            {snapshot.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">{k}</dt>
                <dd className="text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      {/* Parámetros (provisional) */}
      <Card>
        <CardHeader>
          <CardTitle>Parámetros de sanción / bonificación</CardTitle>
          <span className="text-[11px] text-fg-subtle">provisional</span>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="rounded-[var(--radius-md)] bg-amber-50/50 p-2.5 text-xs text-amber-700 dark:bg-amber-500/5">
            Fórmula provisional, pendiente de confirmar con el cliente. Ajusta las tasas y umbrales;
            el valor se recalcula en vivo.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PARAM_FIELDS.map((f) => (
              <Field key={f.key} label={`${f.label}${f.sufijo ? ` (${f.sufijo})` : ""}`}>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={String(params[f.key])}
                  onChange={(e) => setParam(f.key, e.target.value)}
                  disabled={!editable}
                />
              </Field>
            ))}
          </div>
          {editable && (
            <Field label="Observaciones">
              <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
            </Field>
          )}
        </CardBody>
      </Card>

      {/* Desglose */}
      <Card>
        <CardHeader>
          <CardTitle>Liquidación</CardTitle>
        </CardHeader>
        <CardBody>
          <table className="w-full text-sm">
            <tbody>
              {lineas.map(([k, v, tone]) => (
                <tr key={k} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 text-fg-muted">{k}</td>
                  <td
                    className={
                      "py-1.5 text-right tnum " +
                      (tone === "neg" ? "text-danger" : tone === "pos" ? "text-success" : "text-fg")
                    }
                  >
                    {v < 0 ? `− ${COP.format(Math.abs(v))}` : COP.format(v)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="pt-3 font-semibold text-fg">Valor a pagar</td>
                <td className="pt-3 text-right text-base font-bold tnum text-fg">
                  {COP.format(calc.valorTotal)}
                </td>
              </tr>
            </tbody>
          </table>

          {editable && (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={guardar} loading={saving}>
                <Save className="h-4 w-4" /> Guardar / recalcular
              </Button>
              <Button size="sm" onClick={aprobar} loading={approving}>
                <CheckCircle2 className="h-4 w-4" /> Aprobar liquidación
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {aprobada && l.aprobada_en && (
        <p className="text-center text-xs text-fg-subtle">
          Aprobada el {new Date(l.aprobada_en).toLocaleString("es-CO")}.
        </p>
      )}
    </div>
  );
}
