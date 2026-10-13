"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { LEAD_STAGES } from "@/lib/status";
import { MARKETS, NEGOCIOS, TIPOS_POR_NEGOCIO, CADMIO, type Negocio } from "@/lib/schemas/lead";
import { DEPARTAMENTOS } from "@/lib/colombia";
import { useT, useFormatos } from "@/lib/i18n/provider";
import {
  leadValueForMarket,
  pickReferencePrice,
  type Market,
  type ReferencePrices,
} from "@/lib/calc/lead-value";
import type { TeamMember } from "@/lib/types/database";
import type { LeadWithOwner } from "./page";
import { createLead, updateLead } from "./actions";

interface FormValues {
  negocio: Negocio;
  company: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  country: string;
  city: string;
  market: string;
  type: string;
  status: string;
  commercial_owner: string;
  product_interest: string;
  volume: string;
  toneladas: string;
  potential_value_cop: string;
  next_action: string;
  next_action_date: string;
  notes: string;
  region: string;
  cadmio: string;
}

function toValues(lead: LeadWithOwner | null, negocio: Negocio): FormValues {
  return {
    negocio: lead?.negocio ?? negocio,
    company: lead?.company ?? "",
    contact_name: lead?.contact_name ?? "",
    contact_email: lead?.contact_email ?? "",
    contact_phone: lead?.contact_phone ?? "",
    country: lead?.country ?? "",
    city: lead?.city ?? "",
    market: lead?.market ?? "",
    type: lead?.type ?? "",
    status: lead?.status ?? "Nuevo",
    commercial_owner: lead?.commercial_owner ?? "",
    product_interest: lead?.product_interest ?? "",
    volume: lead?.volume ?? "",
    toneladas: lead?.toneladas != null ? String(lead.toneladas) : "",
    potential_value_cop:
      lead?.potential_value_cop != null ? String(lead.potential_value_cop) : "",
    next_action: lead?.next_action ?? "",
    next_action_date: lead?.next_action_date ?? "",
    notes: lead?.notes ?? "",
    region: lead?.region ?? "",
    cadmio: lead?.cadmio ?? "",
  };
}

export function LeadForm({
  open,
  onClose,
  team,
  initial,
  prices,
  onSaved,
  negocioInicial,
}: {
  open: boolean;
  onClose: () => void;
  team: TeamMember[];
  initial: LeadWithOwner | null;
  prices: ReferencePrices;
  onSaved: () => void;
  /** Un lead nuevo nace del lado de la pestaña abierta. */
  negocioInicial: Negocio;
}) {
  const { toast } = useToast();
  const t = useT();
  const f = useFormatos();
  const { register, handleSubmit, reset, control, setValue, getValues, formState } =
    useForm<FormValues>({
      defaultValues: toValues(initial, negocioInicial),
    });
  const negocio = useWatch({ control, name: "negocio" });
  const esCompra = negocio === "Compra";

  // Cambiar de lado deja el tipo coherente (la base no acepta un proveedor en
  // ventas ni un comprador en compras). Una compra casi siempre es nacional.
  function elegirNegocio(n: Negocio) {
    setValue("negocio", n);
    const tipo = getValues("type");
    if (tipo && !(TIPOS_POR_NEGOCIO[n] as readonly string[]).includes(tipo)) {
      setValue("type", n === "Compra" ? "Proveedor potencial" : "");
    }
    if (n === "Compra" && !getValues("market")) setValue("market", "Nacional");
  }

  // Live preview: valor = toneladas × 1000 × precio(mercado).
  const tonWatch = useWatch({ control, name: "toneladas" });
  const marketWatch = useWatch({ control, name: "market" });
  const ton = Number(String(tonWatch ?? "").replace(/[^0-9.-]/g, ""));
  const market = (marketWatch || null) as Market | null;
  const refPrice = pickReferencePrice(market, prices);
  const valorPreview = leadValueForMarket(
    Number.isFinite(ton) ? ton : null,
    market,
    prices,
  );
  const [prevKey, setPrevKey] = React.useState<string>("");

  // Reset the form whenever the modal opens or the edited lead changes.
  const key = `${open}:${initial?.id ?? "new"}`;
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) reset(toValues(initial, negocioInicial));
  }

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      ...values,
      market: values.market || null,
      type: values.type || null,
      commercial_owner: values.commercial_owner || null,
      region: esCompra ? values.region : "",
      cadmio: esCompra ? values.cadmio : "",
    };
    const res = initial
      ? await updateLead(initial.id, payload)
      : await createLead(payload);
    if (!res.ok) {
      toast({
        tone: "error",
        title: t.comercial.noSeGuardo,
        description: res.error,
      });
      return;
    }
    toast({
      tone: "success",
      title: initial ? t.comercial.leadActualizado : t.comercial.leadCreado,
    });
    onSaved();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={initial ? t.comercial.editarLead : t.comercial.nuevoLead}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t.comun.cancelar}
          </Button>
          <Button
            size="sm"
            onClick={onSubmit}
            loading={formState.isSubmitting}
          >
            {initial ? t.comercial.guardarCambios : t.comercial.crearLead}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={`${t.comercial.negocio} *`} className="sm:col-span-2">
          <div
            role="radiogroup"
            aria-label={t.comercial.negocio}
            className="inline-flex rounded-[var(--radius-md)] border border-border bg-surface p-0.5"
          >
            {NEGOCIOS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={negocio === n}
                onClick={() => elegirNegocio(n)}
                className={cn(
                  "rounded-[var(--radius-sm)] px-4 py-1.5 text-sm font-medium transition-colors",
                  negocio === n ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                {t.negocios[n]}
              </button>
            ))}
          </div>
        </Field>
        <Field label={`${t.comercial.empresa} *`} className="sm:col-span-2">
          <Input
            {...register("company", { required: true })}
            placeholder={t.comercial.nombreEmpresa}
          />
        </Field>
        <Field label={t.comercial.contacto}>
          <Input {...register("contact_name")} placeholder={t.comercial.nombrePersona} />
        </Field>
        <Field
          label={t.comercial.correo}
          error={formState.errors.contact_email?.message}
        >
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t.comercial.placeholderCorreo}
            {...register("contact_email", {
              // Se valida en el navegador para no perder el viaje al servidor;
              // el esquema de Zod vuelve a validarlo del otro lado.
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: t.comercial.correoInvalido,
              },
            })}
          />
        </Field>
        <Field
          label={t.comercial.telefono}
          error={formState.errors.contact_phone?.message}
        >
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="3001234567"
            className="font-mono tnum"
            {...register("contact_phone", {
              validate: (v) =>
                !v ||
                v.replace(/\D/g, "").length >= 7 ||
                t.comercial.telefonoCorto,
            })}
          />
        </Field>
        <Field label={t.comercial.responsable}>
          <Select {...register("commercial_owner")} defaultValue="">
            <option value="">{t.comercial.sinAsignar}</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.comercial.pais}>
          <Input {...register("country")} />
        </Field>
        <Field label={t.comercial.ciudadRegion}>
          <Input {...register("city")} />
        </Field>
        <Field label={t.comercial.mercado}>
          <Select {...register("market")} defaultValue="">
            <option value="">—</option>
            {MARKETS.map((m) => (
              <option key={m} value={m}>
                {t.mercados[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.comercial.tipo}>
          <Select {...register("type")} defaultValue="">
            <option value="">—</option>
            {TIPOS_POR_NEGOCIO[negocio].map((tipo) => (
              <option key={tipo} value={tipo}>
                {t.tiposLead[tipo]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.comercial.estado}>
          <Select {...register("status")}>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {t.etapas[s]}
              </option>
            ))}
          </Select>
        </Field>
        {esCompra && (
          <>
            <Field label={t.comercial.region}>
              <Select {...register("region")} defaultValue="">
                <option value="">—</option>
                {DEPARTAMENTOS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.comercial.cadmio}>
              <Select {...register("cadmio")} defaultValue="">
                <option value="">—</option>
                {CADMIO.map((c) => (
                  <option key={c} value={c}>
                    {c === "Alto" ? t.comercial.cadmioAlto : t.comercial.cadmioBajo}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <Field label={t.comercial.volumenDescriptivo}>
          <Input {...register("volume")} placeholder={t.comercial.ejemploVolumen} />
        </Field>
        <Field label={t.comercial.toneladasTm}>
          <Input
            type="number"
            step="any"
            min="0"
            {...register("toneladas")}
            placeholder={t.comercial.ejemplo25}
            className="font-mono tnum"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t.comercial.valorTotalCop}>
            <Input
              type="number"
              step="any"
              min="0"
              {...register("potential_value_cop")}
              placeholder={t.comercial.ejemploValor}
              className="font-mono tnum"
              disabled={valorPreview != null}
            />
          </Field>
          {valorPreview != null ? (
            <p className="mt-1 text-xs text-fg-muted">
              ≈ <span className="font-mono tnum text-fg">{f.cop(valorPreview)}</span>{" "}
              · {f.numero(ton, 1)} {t.unidades.tm} × {f.cop(refPrice ?? 0)}/kg (
              {market === "Nacional" ? "Luker" : "ICE"})
            </p>
          ) : (
            <p className="mt-1 text-xs text-fg-subtle">
              {t.comercial.calcularAuto}
            </p>
          )}
        </div>
        <Field label={t.comercial.interesProducto} className="sm:col-span-2">
          <Input {...register("product_interest")} />
        </Field>
        <Field label={t.comercial.proximaAccion}>
          <Input {...register("next_action")} />
        </Field>
        <Field label={t.comercial.fechaProximaAccion}>
          <Input type="date" {...register("next_action_date")} />
        </Field>
        <Field label={t.comercial.notas} className="sm:col-span-2">
          <Textarea {...register("notes")} rows={3} />
        </Field>
      </form>
    </Modal>
  );
}
