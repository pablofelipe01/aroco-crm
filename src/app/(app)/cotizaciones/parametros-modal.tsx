"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/provider";
import type { ClaveParametro } from "@/lib/cotizador-parametros";
import type { CotizadorParametro } from "@/lib/types/database";
import { guardarParametros } from "./actions";

// Percentages are shown as whole numbers (3 = 3 %); the factor stays a factor.
const esPct = (f: CotizadorParametro) => f.unidad === "ratio" && f.clave !== "factor_nacional";
const mostrar = (f: CotizadorParametro) =>
  String(esPct(f) ? Math.round(Number(f.valor) * 1e6) / 1e4 : Number(f.valor));

export function ParametrosModal({
  open,
  onClose,
  filas,
}: {
  open: boolean;
  onClose: () => void;
  filas: CotizadorParametro[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [valores, setValores] = React.useState<Record<string, string>>({});
  const [prevOpen, setPrevOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setValores(Object.fromEntries(filas.map((f) => [f.clave, mostrar(f)])));
  }

  async function onSave() {
    const cambios: Partial<Record<ClaveParametro, number>> = {};
    for (const f of filas) {
      const v = valores[f.clave];
      if (v === mostrar(f)) continue;
      const num = Number(v);
      if (v.trim() === "" || !Number.isFinite(num)) {
        toast({ tone: "error", title: t.cotizador.noSeGuardo, description: f.descripcion });
        return;
      }
      cambios[f.clave as ClaveParametro] = esPct(f) ? num / 100 : num;
    }
    setSaving(true);
    const res = await guardarParametros(cambios);
    setSaving(false);
    if (!res.ok) {
      toast({ tone: "error", title: t.cotizador.noSeGuardo, description: res.error });
      return;
    }
    toast({ tone: "success", title: t.cotizador.parametrosGuardados });
    onClose();
    router.refresh();
  }

  const grupo = (titulo: string, items: CotizadorParametro[]) => (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        {titulo}
      </h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((f) => (
          <Field key={f.clave} label={f.descripcion}>
            <div className="relative">
              <Input
                type="number"
                step="any"
                min={0}
                value={valores[f.clave] ?? ""}
                onChange={(e) => setValores((p) => ({ ...p, [f.clave]: e.target.value }))}
                className="pr-14 font-mono tnum"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-fg-subtle">
                {esPct(f) ? "%" : f.unidad === "cop_kg" ? "COP/kg" : "×"}
              </span>
            </div>
          </Field>
        ))}
      </div>
    </section>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t.cotizador.parametrosTitulo}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t.comun.cancelar}
          </Button>
          <Button size="sm" onClick={onSave} loading={saving}>
            {t.cotizador.guardar}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-fg-muted">{t.cotizador.parametrosNota}</p>
        {grupo(
          t.cotizador.porcentajes,
          filas.filter((f) => f.unidad === "ratio"),
        )}
        {grupo(
          t.cotizador.porDefecto,
          filas.filter((f) => f.unidad === "cop_kg"),
        )}
      </div>
    </Modal>
  );
}
