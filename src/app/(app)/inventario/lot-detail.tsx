"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, ArrowUpFromLine, Scale, Shuffle, LogOut } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { formatKg, formatDate, formatCOP, formatNumber } from "@/lib/utils";
import type { InventoryLot, InventarioAjuste } from "@/lib/types/database";
import { NOMBRE_BODEGA, esBodega } from "@/lib/inventory/bodegas";
import {
  CLASES_CRM,
  NOMBRE_CLASE_CRM,
  colSalida,
  disponibleDeClases,
  type ClaseCrm,
} from "@/lib/inventory/carga";
import { borrarAjuste, borrarIngreso, borrarSalida, registrarAjuste } from "./carga-actions";

type SalidaLote = {
  id: string;
  dispatch_date: string | null;
  destination: string | null;
  remision_salida: string | null;
  qty_kg: number;
  source: string | null;
  clase: ClaseCrm | null;
};

type Evento =
  | { tipo: "salida"; fecha: string | null; s: SalidaLote }
  | { tipo: "ajuste"; fecha: string | null; a: InventarioAjuste };

const hoy = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

export function LotDetail({
  lot,
  open,
  canWrite,
  puedeSalida,
  modoCrm,
  onClose,
  onEditar,
  onSalida,
  onChanged,
}: {
  lot: InventoryLot | null;
  open: boolean;
  /** Puede registrar ingresos y ajustes (Bodega Central, Administrativo, Operaciones). */
  canWrite: boolean;
  /** Puede registrar salidas (Bodega Central, Comercial, Operaciones). */
  puedeSalida: boolean;
  /** La carga ya es desde el CRM (0113). */
  modoCrm: boolean;
  onClose: () => void;
  onEditar: (l: InventoryLot) => void;
  onSalida: (loteId: string) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [eventos, setEventos] = React.useState<Evento[]>([]);
  const [cargando, setCargando] = React.useState(false);
  const [ajuste, setAjuste] = React.useState<"merma" | "reclasificacion" | null>(null);

  const cargar = React.useCallback(async (lotId: string) => {
    setCargando(true);
    const db = createClient();
    const [{ data: salidas }, { data: ajustes }] = await Promise.all([
      db
        .from("dispatches")
        .select(
          "id, dispatch_date, destination, remision_salida, qty_kg, source, qty_premium_kg, qty_estandar_kg, qty_fairtrade_kg, qty_rainforest_kg, qty_corriente_kg, qty_corriente_c_kg, qty_pasilla_kg, qty_organico_kg, qty_baba_kg",
        )
        .eq("lote_origen_id", lotId),
      db.from("inventario_ajustes").select("*").eq("lot_id", lotId),
    ]);
    const ev: Evento[] = [
      ...(salidas ?? []).map((d) => ({
        tipo: "salida" as const,
        fecha: d.dispatch_date,
        s: {
          id: d.id,
          dispatch_date: d.dispatch_date,
          destination: d.destination,
          remision_salida: d.remision_salida,
          qty_kg: Number(d.qty_kg) || 0,
          source: d.source,
          clase:
            CLASES_CRM.find((c) => Number((d as Record<string, unknown>)[colSalida(c)]) > 0) ?? null,
        },
      })),
      ...(ajustes ?? []).map((a) => ({ tipo: "ajuste" as const, fecha: a.fecha, a })),
    ].sort((x, y) => (y.fecha ?? "").localeCompare(x.fecha ?? ""));
    setEventos(ev);
    setCargando(false);
  }, []);

  const [visto, setVisto] = React.useState<string | null>(null);
  const clave = open && lot ? `${lot.id}|${lot.updated_at}` : null;
  if (clave !== visto) {
    setVisto(clave);
    if (clave && lot) {
      setAjuste(null);
      void cargar(lot.id);
    }
  }

  if (!lot) return null;
  const esCrm = lot.source === "crm";
  const editable = modoCrm && esCrm && canWrite;
  const delCrm = esCrm && lot.created_by != null;

  async function refrescar() {
    if (lot) await cargar(lot.id);
    onChanged();
    router.refresh();
  }

  async function quitarAjuste(id: string) {
    const r = await borrarAjuste(id);
    if (!r.ok) return toast({ tone: "error", title: "No se pudo borrar", description: r.error });
    await refrescar();
  }

  async function quitarSalida(id: string) {
    if (!confirm("¿Borrar esta salida? Sus kilos vuelven al lote.")) return;
    const r = await borrarSalida(id);
    if (!r.ok) return toast({ tone: "error", title: "No se pudo borrar", description: r.error });
    await refrescar();
  }

  async function quitarLote() {
    if (!lot) return;
    if (!confirm(`¿Borrar el ingreso ${lot.codigo_nuevo ?? lot.code}?`)) return;
    const r = await borrarIngreso(lot.id);
    if (!r.ok) return toast({ tone: "error", title: "No se pudo borrar", description: r.error });
    toast({ tone: "success", title: "Ingreso borrado" });
    onClose();
    router.refresh();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={<span className="font-mono">{lot.codigo_nuevo ?? lot.code}</span>}
      subtitle={
        <div className="flex flex-wrap items-center gap-2">
          {lot.quality && <Badge tone="accent">{lot.quality}</Badge>}
          {lot.needs_review && <Badge tone="warn">Verificar snapshot</Badge>}
          {lot.entry_date && (
            <span className="text-xs text-fg-muted">{formatDate(lot.entry_date)}</span>
          )}
        </div>
      }
      footer={
        (editable || (modoCrm && esCrm && puedeSalida)) && (
          <>
            {editable && delCrm && (
              <Button variant="ghost" size="sm" onClick={quitarLote}>
                <Trash2 className="h-4 w-4 text-danger" />
                Borrar
              </Button>
            )}
            {editable && delCrm && (
              <Button variant="secondary" size="sm" onClick={() => onEditar(lot)}>
                <Pencil className="h-4 w-4" />
                Corregir
              </Button>
            )}
            {modoCrm && esCrm && puedeSalida && lot.qty_available_kg > 0 && (
              <Button size="sm" onClick={() => onSalida(lot.id)}>
                <LogOut className="h-4 w-4" />
                Registrar salida
              </Button>
            )}
          </>
        )
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-3">
          <Stat label="Ingresada" value={formatKg(lot.qty_in_kg)} />
          <Stat label="Salida" value={formatKg(lot.qty_out_kg)} />
          <Stat label="Merma" value={formatKg(lot.merma_kg)} />
          <Stat label="Disponible" value={formatKg(lot.qty_available_kg)} accent />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Meta
            label="Bodega"
            value={esBodega(lot.bodega) ? NOMBRE_BODEGA[lot.bodega] : "Sin asignar"}
          />
          {lot.proveedor && <Meta label="Proveedor" value={lot.proveedor} />}
          {(lot.departamento || lot.municipio) && (
            <Meta
              label="Origen"
              value={[lot.municipio, lot.departamento].filter(Boolean).join(", ")}
            />
          )}
          {lot.codigo_nuevo && <Meta label="Código" value={lot.codigo_nuevo} />}
          {lot.remision && <Meta label="Remisión" value={lot.remision} />}
          {lot.odc && <Meta label="ODC" value={lot.odc} />}
          {lot.recepcion && <Meta label="Recepción" value={lot.recepcion} />}
          {(lot.origin ?? lot.code) && <Meta label="Procedencia" value={lot.origin ?? lot.code} />}
          {lot.purchase_price_cop_kg != null && (
            <Meta label="Precio compra" value={`${formatCOP(lot.purchase_price_cop_kg)}/kg`} />
          )}
          {lot.qty_requested_kg != null && (
            <Meta label="Solicitada" value={formatKg(lot.qty_requested_kg)} />
          )}
          {lot.bultos_in > 0 && (
            <Meta label="Bultos" value={formatNumber(lot.bultos_in)} />
          )}
          {lot.cadmio && <Meta label="Cadmio" value={lot.cadmio} />}
          {lot.merma_kg > 0 && (
            <Meta
              label="Merma"
              value={`${formatKg(lot.merma_kg)}${lot.merma_pct != null ? ` · ${lot.merma_pct}%` : ""}`}
            />
          )}
          {lot.pasilla_kg > 0 && (
            <Meta
              label="Pasilla"
              value={`${formatKg(lot.pasilla_kg)}${lot.pasilla_pct != null ? ` · ${lot.pasilla_pct}%` : ""}`}
            />
          )}
        </dl>

        <Classification lot={lot} />
        <QualityMeasurement lot={lot} />

        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={ajuste === "merma" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setAjuste(ajuste === "merma" ? null : "merma")}
            >
              <Scale className="h-4 w-4" />
              Registrar merma
            </Button>
            <Button
              variant={ajuste === "reclasificacion" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setAjuste(ajuste === "reclasificacion" ? null : "reclasificacion")}
            >
              <Shuffle className="h-4 w-4" />
              Reclasificar (selección)
            </Button>
          </div>
        )}
        {editable && ajuste && (
          <AjusteForm
            key={ajuste}
            lot={lot}
            tipo={ajuste}
            onListo={async () => {
              setAjuste(null);
              await refrescar();
            }}
          />
        )}

        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-fg-subtle">
            Historial del lote
          </h3>
          {cargando && eventos.length === 0 ? (
            <p className="text-sm text-fg-subtle">Cargando…</p>
          ) : eventos.length === 0 ? (
            <p className="text-sm text-fg-subtle">Sin salidas ni ajustes.</p>
          ) : (
            <ul className="space-y-1.5">
              {eventos.map((e) =>
                e.tipo === "salida" ? (
                  <li
                    key={`s${e.s.id}`}
                    className="group flex items-center gap-3 rounded-[var(--radius-sm)] border border-border px-3 py-2"
                  >
                    <ArrowUpFromLine className="h-4 w-4 shrink-0 text-warn" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg">
                        Salida · <span className="font-mono tnum">{formatKg(e.s.qty_kg)}</span>
                        {e.s.clase && (
                          <span className="font-normal text-fg-muted"> · {NOMBRE_CLASE_CRM[e.s.clase]}</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-fg-subtle">
                        {formatDate(e.s.dispatch_date)}
                        {e.s.destination ? ` · ${e.s.destination}` : ""}
                        {e.s.remision_salida ? ` · Rem. ${e.s.remision_salida}` : ""}
                        {e.s.source === "crm" ? "" : " · del archivo"}
                      </p>
                    </div>
                    {modoCrm && puedeSalida && e.s.source === "crm" && (
                      <button
                        onClick={() => quitarSalida(e.s.id)}
                        className="rounded p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus:opacity-100 group-hover:opacity-100"
                        aria-label="Borrar salida"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ) : (
                  <li
                    key={`a${e.a.id}`}
                    className="group flex items-center gap-3 rounded-[var(--radius-sm)] border border-border px-3 py-2"
                  >
                    {e.a.tipo === "reclasificacion" ? (
                      <Shuffle className="h-4 w-4 shrink-0 text-fg-muted" />
                    ) : (
                      <Scale className="h-4 w-4 shrink-0 text-fg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg">
                        {e.a.tipo === "merma"
                          ? "Merma"
                          : e.a.tipo === "reclasificacion"
                            ? "Reclasificación"
                            : "Saldo de apertura"}{" "}
                        · <span className="font-mono tnum">{formatNumber(e.a.kg, 2)} kg</span>
                        <span className="font-normal text-fg-muted">
                          {" "}
                          · {NOMBRE_CLASE_CRM[e.a.clase_origen as ClaseCrm] ?? e.a.clase_origen}
                          {e.a.clase_destino
                            ? ` → ${NOMBRE_CLASE_CRM[e.a.clase_destino as ClaseCrm] ?? e.a.clase_destino}`
                            : ""}
                        </span>
                      </p>
                      <p className="truncate text-xs text-fg-subtle">
                        {formatDate(e.a.fecha)}
                        {e.a.nota ? ` · ${e.a.nota}` : ""}
                      </p>
                    </div>
                    {editable && e.a.tipo !== "apertura" && (
                      <button
                        onClick={() => quitarAjuste(e.a.id)}
                        className="rounded p-1 text-fg-subtle opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus:opacity-100 group-hover:opacity-100"
                        aria-label="Borrar ajuste"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      </div>
    </Drawer>
  );
}

/**
 * Merma (kilos que se pierden de una clase) o reclasificación (kilos que
 * pasan de una clase a otra, como la pasilla que sale de la selección).
 */
function AjusteForm({
  lot,
  tipo,
  onListo,
}: {
  lot: InventoryLot;
  tipo: "merma" | "reclasificacion";
  onListo: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const disp = disponibleDeClases(lot);
  const conSaldo = CLASES_CRM.filter((c) => disp[c] > 0.0005);
  const [origen, setOrigen] = React.useState<ClaseCrm | "">(conSaldo[0] ?? "");
  const [destino, setDestino] = React.useState<ClaseCrm | "">(tipo === "reclasificacion" ? "pasilla" : "");
  const [kg, setKg] = React.useState("");
  const [fecha, setFecha] = React.useState(hoy);
  const [nota, setNota] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const k = Number(kg);
    if (origen && k > disp[origen] + 0.001) {
      setError(`Quedan ${formatNumber(disp[origen], 2)} kg de ${NOMBRE_CLASE_CRM[origen]}.`);
      return;
    }
    setGuardando(true);
    const r = await registrarAjuste({
      lot_id: lot.id,
      fecha,
      tipo,
      clase_origen: origen,
      clase_destino: tipo === "reclasificacion" ? destino || null : null,
      kg: k,
      nota: nota.trim() || null,
    });
    setGuardando(false);
    if (!r.ok) {
      setError(r.error ?? "No se pudo registrar.");
      return;
    }
    toast({ tone: "success", title: tipo === "merma" ? "Merma registrada" : "Reclasificación registrada" });
    await onListo();
  }

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label={tipo === "merma" ? "Clase" : "De"} className="w-40">
          <Select value={origen} onChange={(e) => setOrigen(e.target.value as ClaseCrm)} required>
            {conSaldo.length === 0 && <option value="">Sin saldo</option>}
            {conSaldo.map((c) => (
              <option key={c} value={c}>
                {NOMBRE_CLASE_CRM[c]} · {formatNumber(disp[c], 1)}
              </option>
            ))}
          </Select>
        </Field>
        {tipo === "reclasificacion" && (
          <Field label="A" className="w-36">
            <Select value={destino} onChange={(e) => setDestino(e.target.value as ClaseCrm)} required>
              {CLASES_CRM.filter((c) => c !== origen).map((c) => (
                <option key={c} value={c}>
                  {NOMBRE_CLASE_CRM[c]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Kilos" className="w-28">
          <Input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            className="font-mono tnum"
            required
          />
        </Field>
        <Field label="Fecha" className="w-40">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Nota" className="min-w-48 flex-1">
          <Input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder={tipo === "merma" ? "Movimiento, almacenamiento…" : "Selección del 6-nov…"}
          />
        </Field>
        <Button type="submit" size="sm" loading={guardando} disabled={!origen || !kg}>
          Guardar
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}

/** Desglose por clasificación: qué entró y qué queda de cada tipo de cacao. */
function Classification({ lot }: { lot: InventoryLot }) {
  const rows = [
    { label: "Premium", in: lot.qty_in_premium_kg, avail: lot.qty_avail_premium_kg },
    { label: "Estándar", in: lot.qty_in_estandar_kg, avail: lot.qty_avail_estandar_kg },
    { label: "Fairtrade", in: lot.qty_in_fairtrade_kg, avail: lot.qty_avail_fairtrade_kg },
    { label: "Rainforest", in: lot.qty_in_rainforest_kg, avail: lot.qty_avail_rainforest_kg },
    { label: "Corriente", in: lot.qty_in_corriente_kg, avail: lot.qty_avail_corriente_kg },
    { label: "Corriente C", in: lot.qty_in_corriente_c_kg, avail: lot.qty_avail_corriente_c_kg },
    { label: "Pasilla", in: lot.qty_in_pasilla_kg, avail: lot.qty_avail_pasilla_kg },
    { label: "Orgánico", in: lot.qty_in_organico_kg, avail: lot.qty_avail_organico_kg },
    { label: "Baba", in: lot.qty_in_baba_kg, avail: lot.qty_avail_baba_kg },
  ].filter((r) => r.in > 0 || r.avail > 0);

  if (rows.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-fg-subtle">
        Clasificación
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-fg-subtle">
            <th className="pb-1.5 text-left font-medium">Tipo</th>
            <th className="pb-1.5 text-right font-medium">Ingresada</th>
            <th className="pb-1.5 text-right font-medium">En bodega</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border">
              <td className="py-1.5 text-fg-muted">{r.label}</td>
              <td className="py-1.5 text-right font-mono tnum text-fg-muted">
                {formatNumber(r.in)}
              </td>
              <td className="py-1.5 text-right font-mono tnum font-semibold text-fg">
                {formatNumber(r.avail)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ítems de evaluación del laboratorio; solo se muestran si hay mediciones. */
function QualityMeasurement({ lot }: { lot: InventoryLot }) {
  const items = [
    { label: "Bien fermentados", value: lot.pct_bien_fermentado },
    { label: "Parcialmente ferm.", value: lot.pct_parcialmente_fermentado },
    { label: "Pizarrosos", value: lot.pct_pizarroso },
    { label: "Púrpuras", value: lot.pct_purpura },
    { label: "Sobre fermentado", value: lot.pct_sobre_fermentado },
    { label: "Grano con hongos", value: lot.pct_hongos },
    { label: "Humedad", value: lot.pct_humedad },
    { label: "Fermentación total", value: lot.pct_fermentacion_total },
  ].filter((i) => i.value != null);

  if (items.length === 0 && lot.indice_grano_100g == null) return null;

  return (
    <div>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-fg-subtle">
        Medición de calidad
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {items.map((i) => (
          <Meta key={i.label} label={i.label} value={`${i.value}%`} />
        ))}
        {lot.indice_grano_100g != null && (
          <Meta label="Índice de grano" value={`${lot.indice_grano_100g} / 100 g`} />
        )}
      </dl>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`min-w-0 rounded-[var(--radius-md)] border border-border p-2.5 ${accent ? "bg-accent-soft/50" : "bg-bg-subtle/40"}`}>
      <p className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-semibold tnum ${accent ? "text-accent-soft-fg" : "text-fg"}`}>
        {value}
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm text-fg">{value}</dd>
    </div>
  );
}
