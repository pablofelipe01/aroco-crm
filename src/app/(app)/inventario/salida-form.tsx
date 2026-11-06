"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { NOMBRE_BODEGA, esBodega } from "@/lib/inventory/bodegas";
import {
  CLASES_CRM,
  NOMBRE_CLASE_CRM,
  revisarSalida,
  salidaSchema,
  type ClaseCrm,
} from "@/lib/inventory/carga";
import { formatNumber } from "@/lib/utils";
import { registrarSalida } from "./carga-actions";

/** Un lote con saldo, tal como lo ofrece el formulario. */
export type LoteConSaldo = {
  id: string;
  nombre: string;
  bodega: string | null;
  disponible: Record<ClaseCrm, number>;
};

type Linea = { lote_id: string; clase: ClaseCrm | ""; kg: string };

const hoy = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const nueva = (lote_id = ""): Linea => ({ lote_id, clase: "", kg: "" });

/**
 * Registrar una salida: una remisión que puede sacar cacao de varios lotes y
 * clases. Cada línea descuenta de su lote; si alguna no alcanza, no entra
 * ninguna.
 */
export function SalidaForm({
  open,
  onClose,
  lotes,
  destinos,
  loteInicial,
  onGuardado,
}: {
  open: boolean;
  onClose: () => void;
  lotes: LoteConSaldo[];
  destinos: string[];
  /** Para abrirla desde un lote ya elegido. */
  loteInicial?: string | null;
  onGuardado: () => void;
}) {
  const { toast } = useToast();
  const [fecha, setFecha] = React.useState(hoy);
  const [destino, setDestino] = React.useState("");
  const [remision, setRemision] = React.useState("");
  const [oc, setOc] = React.useState("");
  const [bultos, setBultos] = React.useState("");
  const [lineas, setLineas] = React.useState<Linea[]>([nueva()]);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  const [abierto, setAbierto] = React.useState(false);
  if (open !== abierto) {
    setAbierto(open);
    if (open) {
      setFecha(hoy());
      setDestino("");
      setRemision("");
      setOc("");
      setBultos("");
      setLineas([nueva(loteInicial ?? "")]);
      setError(null);
    }
  }

  const porId = React.useMemo(() => new Map(lotes.map((l) => [l.id, l])), [lotes]);
  const total = lineas.reduce((t, l) => t + (Number(l.kg) || 0), 0);
  const cambiar = (i: number, p: Partial<Linea>) =>
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const datos = {
      dispatch_date: fecha,
      destination: destino,
      remision_salida: remision,
      oc,
      bultos: bultos ? Number(bultos) : null,
      lineas: lineas.map((l) => ({ lote_id: l.lote_id, clase: l.clase, kg: Number(l.kg) })),
    };
    const p = salidaSchema.safeParse(datos);
    if (!p.success) {
      setError(p.error.issues[0]?.message ?? "Revisa los datos.");
      return;
    }
    const falta = revisarSalida(
      p.data.lineas,
      new Map(lotes.map((l) => [l.id, l.disponible])),
      (id) => porId.get(id)?.nombre ?? "El lote",
    );
    if (falta) {
      setError(falta);
      return;
    }
    setGuardando(true);
    const r = await registrarSalida(datos);
    setGuardando(false);
    if (!r.ok) {
      setError(r.error ?? "No se pudo registrar.");
      return;
    }
    toast({ tone: "success", title: "Salida registrada", description: r.detalle });
    onGuardado();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Nueva salida"
      description="Cada línea descuenta los kilos de su lote y clase."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="form-salida" loading={guardando}>
            Registrar salida
          </Button>
        </>
      }
    >
      <form id="form-salida" onSubmit={guardar} className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <Field label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </Field>
          <Field label="Cliente / destino" className="sm:col-span-2">
            <Input
              list="destinos-salida"
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              placeholder="CASA LUKER, MUESTRAS…"
              required
            />
            <datalist id="destinos-salida">
              {destinos.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
          <Field label="Remisión de salida">
            <Input value={remision} onChange={(e) => setRemision(e.target.value)} className="font-mono" />
          </Field>
          <Field label="OC del cliente">
            <Input value={oc} onChange={(e) => setOc(e.target.value)} className="font-mono" />
          </Field>
        </div>

        <fieldset className="space-y-2 rounded-[var(--radius-md)] border border-border p-3">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">
            Qué sale
          </legend>
          {lotes.length === 0 && (
            <p className="text-sm text-fg-subtle">No hay lotes con saldo en el libro del CRM.</p>
          )}
          {lineas.map((l, i) => {
            const lote = porId.get(l.lote_id);
            const clases = lote ? CLASES_CRM.filter((c) => lote.disponible[c] > 0.0005) : [];
            const hay = lote && l.clase ? lote.disponible[l.clase] : null;
            return (
              <div key={i} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_11rem_8rem_2.5rem]">
                <Field label={i === 0 ? "Lote" : undefined}>
                  <Select
                    value={l.lote_id}
                    onChange={(e) => cambiar(i, { lote_id: e.target.value, clase: "" })}
                    aria-label={`Lote de la línea ${i + 1}`}
                  >
                    <option value="">Elige el lote…</option>
                    {lotes.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nombre}
                        {esBodega(x.bodega) ? ` · ${NOMBRE_BODEGA[x.bodega]}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={i === 0 ? "Clase" : undefined}>
                  <Select
                    value={l.clase}
                    onChange={(e) => cambiar(i, { clase: e.target.value as ClaseCrm })}
                    disabled={!lote}
                    aria-label={`Clase de la línea ${i + 1}`}
                  >
                    <option value="">Clase…</option>
                    {clases.map((c) => (
                      <option key={c} value={c}>
                        {NOMBRE_CLASE_CRM[c]} · {formatNumber(lote!.disponible[c], 1)} kg
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={i === 0 ? "Kilos" : undefined}>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={l.kg}
                    onChange={(e) => cambiar(i, { kg: e.target.value })}
                    className="font-mono tnum"
                    placeholder={hay != null ? formatNumber(hay, 1) : undefined}
                    aria-label={`Kilos de la línea ${i + 1}`}
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [nueva()]))}
                  className="flex h-10 items-center justify-center rounded-[var(--radius-md)] text-fg-subtle hover:bg-danger-soft hover:text-danger"
                  aria-label={`Quitar línea ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setLineas((ls) => [...ls, nueva()])}>
              <Plus className="h-4 w-4" />
              Otra línea
            </Button>
            <span className="text-sm text-fg-muted">
              Total: <span className="font-mono font-semibold tnum text-fg">{formatNumber(total, 2)} kg</span>
            </span>
          </div>
        </fieldset>

        <Field label="Bultos" className="w-32">
          <Input
            type="number"
            min="0"
            step="1"
            value={bultos}
            onChange={(e) => setBultos(e.target.value)}
            className="font-mono tnum"
          />
        </Field>

        {error && (
          <p role="alert" className="rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
