"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, Boxes, Warehouse, LogOut, FileSpreadsheet, ArrowRightLeft } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ScrollFijo } from "@/components/ui/scroll-fijo";
import { BarraFija } from "@/components/ui/scroll-efectos";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import {
  BODEGAS,
  NOMBRE_BODEGA,
  NOMBRE_TIPO,
  TIPOS,
  disponiblePorTipo,
  esBodega,
  resumenPorBodega,
  type Bodega,
  type FilaResumen,
} from "@/lib/inventory/bodegas";
import type { InventoryLot } from "@/lib/types/database";
import { LotDetail } from "./lot-detail";
import { asignarBodega } from "./actions";
import { pasarCargaAlCrm } from "./carga-actions";
import { IngresoForm, type ProveedorOpcion } from "./ingreso-form";
import { SalidaForm, type LoteConSaldo } from "./salida-form";
import { disponibleDeClases } from "@/lib/inventory/carga";

/** Qué bodega se está mirando: todas (consolidado), una, o los sin asignar. */
type Vista = "todas" | Bodega | "sin";

export function InventarioClient({
  initialLots,
  canWrite,
  puedeSalida,
  esAdmin,
  modoCrm,
  proveedores,
  destinos,
}: {
  initialLots: InventoryLot[];
  /** Ingresos, ajustes y bodega (Bodega Central, Administrativo, Operaciones). */
  canWrite: boolean;
  /** Salidas (Bodega Central, Comercial, Operaciones). */
  puedeSalida: boolean;
  esAdmin: boolean;
  /** La carga ya es desde el CRM; si no, manda el Excel. */
  modoCrm: boolean;
  proveedores: ProveedorOpcion[];
  destinos: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  // La referencia diaria de bodega es lo que queda en saldo: los lotes agotados
  // se ocultan por defecto y se pueden traer de vuelta con el interruptor.
  const [onlyAvailable, setOnlyAvailable] = React.useState(true);
  const [selected, setSelected] = React.useState<InventoryLot | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<InventoryLot | null>(null);
  const [salida, setSalida] = React.useState<{ abierta: boolean; lote: string | null }>({
    abierta: false,
    lote: null,
  });
  const [corte, setCorte] = React.useState(false);
  const [cortando, setCortando] = React.useState(false);
  const [vista, setVista] = React.useState<Vista>("todas");
  const { toast } = useToast();
  // Bodega elegida en esta pantalla mientras el servidor confirma. Va atada a
  // la lista que la originó: cuando llegan datos frescos, mandan los datos.
  const [cambios, setCambios] = React.useState<{
    base: InventoryLot[];
    m: Record<string, Bodega | null>;
  }>({ base: initialLots, m: {} });
  const pendiente = React.useMemo(
    () => (cambios.base === initialLots ? cambios.m : {}),
    [cambios, initialLots],
  );
  const bodegaDe = React.useCallback(
    (l: InventoryLot): Bodega | null =>
      l.id in pendiente ? pendiente[l.id] : esBodega(l.bodega) ? l.bodega : null,
    [pendiente],
  );
  const setPendiente = (f: (m: Record<string, Bodega | null>) => Record<string, Bodega | null>) =>
    setCambios((c) => ({ base: initialLots, m: f(c.base === initialLots ? c.m : {}) }));

  // Deep link from the command palette (?lot=<id>).
  const searchParams = useSearchParams();
  React.useEffect(() => {
    const lotId = searchParams.get("lot");
    if (!lotId) return;
    const l = initialLots.find((x) => x.id === lotId);
    if (l) setSelected(l);
    router.replace("/inventario");
  }, [searchParams, initialLots, router]);

  // Keep the selected lot in sync with refreshed data.
  const selectedId = selected?.id;
  const liveSelected = selectedId
    ? initialLots.find((l) => l.id === selectedId) ?? null
    : null;

  const lotes = React.useMemo(
    () => initialLots.map((l) => ({ ...l, bodega: bodegaDe(l) })),
    [initialLots, bodegaDe],
  );
  const resumen = React.useMemo(() => resumenPorBodega(lotes), [lotes]);
  const sinAsignar = resumen.filas.find((f) => f.bodega === null)?.lotes ?? 0;

  const enVista = React.useMemo(
    () =>
      lotes.filter((l) =>
        vista === "todas" ? true : vista === "sin" ? l.bodega === null : l.bodega === vista,
      ),
    [lotes, vista],
  );
  const totals = React.useMemo(() => {
    const withStock = enVista.filter((l) => l.qty_available_kg > 0).length;
    return { withStock, count: enVista.length };
  }, [enVista]);

  const lotesConSaldo = React.useMemo<LoteConSaldo[]>(
    () =>
      lotes
        .filter((l) => l.source === "crm" && l.qty_available_kg > 0.0005)
        .map((l) => ({
          id: l.id,
          nombre: `${l.codigo_nuevo ?? l.code} · ${formatNumber(l.qty_available_kg, 1)} kg`,
          bodega: l.bodega,
          disponible: disponibleDeClases(l),
        })),
    [lotes],
  );

  async function confirmarCorte() {
    setCortando(true);
    const r = await pasarCargaAlCrm();
    setCortando(false);
    if (!r.ok) {
      toast({ tone: "error", title: "No se pudo pasar al CRM", description: r.error });
      return;
    }
    setCorte(false);
    toast({ tone: "success", title: "La carga ya es desde el CRM", description: r.detalle });
    router.refresh();
  }

  async function cambiarBodega(l: InventoryLot, valor: string) {
    const bodega = esBodega(valor) ? valor : null;
    setPendiente((p) => ({ ...p, [l.id]: bodega }));
    const res = await asignarBodega([l.id], bodega);
    if (!res.ok) {
      setPendiente((p) => {
        const { [l.id]: _, ...resto } = p;
        void _;
        return resto;
      });
      toast({ tone: "error", title: "No se pudo cambiar la bodega", description: res.error });
      return;
    }
    router.refresh();
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return enVista.filter((l) => {
      if (onlyAvailable && l.qty_available_kg <= 0) return false;
      if (!q) return true;
      return `${l.code} ${l.codigo_nuevo ?? ""} ${l.proveedor ?? ""} ${l.origin ?? ""} ${l.quality ?? ""} ${l.remision ?? ""} ${l.recepcion ?? ""} ${l.odc ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [enVista, query, onlyAvailable]);

  const hiddenByFilter = onlyAvailable ? totals.count - totals.withStock : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventario"
        description="Disponible por bodega (Cauca, Bogotá, Nilo) y por tipo de cacao, lote por lote."
        actions={
          modoCrm && (canWrite || puedeSalida) ? (
            <div className="flex flex-wrap gap-2">
              {puedeSalida && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSalida({ abierta: true, lote: null })}
                >
                  <LogOut className="h-4 w-4" />
                  Nueva salida
                </Button>
              )}
              {canWrite && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Nuevo ingreso
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {!modoCrm && (
        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-bg-subtle/50 px-4 py-3 sm:flex-row sm:items-center">
          <FileSpreadsheet className="hidden h-5 w-5 shrink-0 text-fg-subtle sm:block" />
          <p className="flex-1 text-sm text-fg-muted">
            El inventario todavía se carga en el Excel de bodega y llega aquí cada mañana. Cuando la
            bodega deje de usarlo, un administrador pasa la carga al CRM: desde ahí los ingresos,
            salidas y mermas se registran aquí.
          </p>
          {esAdmin && (
            <Button size="sm" variant="secondary" onClick={() => setCorte(true)}>
              <ArrowRightLeft className="h-4 w-4" />
              Pasar la carga al CRM
            </Button>
          )}
        </div>
      )}

      <ResumenBodegas
        filas={resumen.filas}
        total={resumen.total}
        vista={vista}
        onVista={setVista}
      />

      {/* Filtros fijos arriba al bajar (revisión del 2026-10-30): el título y
          los totales se van, los filtros y los encabezados de la tabla quedan.
          Fondo opaco. ScrollFijo la encuentra por data-fijo-encima y se para
          bajo ella. En celular no se fija. */}
      <BarraFija className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Bodega">
          {(["todas", ...BODEGAS, "sin"] as Vista[]).map((v) => {
            if (v === "sin" && sinAsignar === 0) return null;
            return (
              <button
                key={v}
                role="tab"
                aria-selected={vista === v}
                onClick={() => setVista(v)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  vista === v
                    ? "bg-accent text-accent-fg"
                    : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
                )}
              >
                {nombreVista(v)}
                {v === "sin" && <span className="ml-1 font-mono tnum opacity-70">{sinAsignar}</span>}
              </button>
            );
          })}
        </div>
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar código, proveedor, remisión…"
            className="pl-9"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Solo con saldo en bodega
          {hiddenByFilter > 0 && (
            <span className="text-xs text-fg-subtle">
              ({hiddenByFilter} en cero {hiddenByFilter === 1 ? "oculto" : "ocultos"})
            </span>
          )}
        </label>
      </BarraFija>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-6 w-6" />}
          title={
            onlyAvailable
              ? `Sin lotes con saldo${vista === "todas" ? "" : ` en ${nombreVista(vista)}`}`
              : "Sin lotes"
          }
          description={
            onlyAvailable
              ? "Ningún lote coincide y tiene saldo en bodega."
              : undefined
          }
          action={
            onlyAvailable ? (
              <Button variant="secondary" size="sm" onClick={() => setOnlyAvailable(false)}>
                Ver todos los lotes
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
        {/* Mobile: cards */}
        <ul className="space-y-2 sm:hidden">
          {filtered.map((l) => (
            <li key={l.id}>
              <button
                onClick={() => setSelected(l)}
                className="flex w-full flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface p-3 text-left shadow-[var(--shadow-soft-sm)] active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 break-all font-mono text-xs text-fg">
                    {l.codigo_nuevo ?? l.code}
                  </span>
                  <Badge tone={l.bodega ? "neutral" : "warn"}>
                    {l.bodega ? NOMBRE_BODEGA[l.bodega] : "sin bodega"}
                  </Badge>
                  {l.needs_review && <Badge tone="warn">verificar</Badge>}
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="text-xs text-fg-subtle">
                    {l.entry_date ? formatDate(l.entry_date) : "—"}
                    {l.quality ? ` · ${l.quality}` : ""}
                    {l.proveedor ? ` · ${l.proveedor}` : ""}
                    <div className="mt-0.5 font-mono">
                      In {formatNumber(l.qty_in_kg)} · Out {formatNumber(l.qty_out_kg)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-semibold tnum text-fg">
                      {formatNumber(l.qty_available_kg)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-fg-subtle">
                      disponible kg
                    </div>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>

        {/* Desktop: table. Scroll propio para que la fila de encabezados quede
            fija al bajar (con overflow-x, un sticky no se pega al scroll de la
            página). */}
        <ScrollFijo className="hidden rounded-[var(--radius-lg)] border border-border bg-surface sm:block">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              {/* Cada th fijo con fondo; el borde va como sombra porque el de la
                  fila no viaja con un th fijo. */}
              <tr className="text-xs uppercase tracking-wide text-fg-subtle [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface [&>th]:shadow-[inset_0_-1px_0_var(--color-border)]">
                <th className="px-4 py-3 text-left font-medium">Código</th>
                <th className="px-4 py-3 text-left font-medium">Ingreso</th>
                <th className="px-4 py-3 text-left font-medium">Proveedor</th>
                <th className="px-4 py-3 text-left font-medium">Remisión</th>
                <th className="px-4 py-3 text-right font-medium">Ingresada</th>
                <th className="px-4 py-3 text-right font-medium">Salida</th>
                <th className="px-4 py-3 text-right font-medium">Disponible</th>
                <th className="px-4 py-3 text-left font-medium">Clasificación</th>
                <th className="px-4 py-3 text-left font-medium">Bodega</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setSelected(l)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-fg" title={l.code}>
                      {l.codigo_nuevo ?? l.code}
                    </span>
                    {l.needs_review && (
                      <Badge tone="warn" className="ml-2 align-middle">
                        verificar
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-subtle">
                    {l.entry_date ? formatDate(l.entry_date) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-fg-muted">{l.proveedor ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-subtle">
                    {l.remision ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tnum text-fg-muted">
                    {formatNumber(l.qty_in_kg)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tnum text-fg-muted">
                    {formatNumber(l.qty_out_kg)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tnum font-semibold text-fg">
                    {formatNumber(l.qty_available_kg)}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    <span className="inline-flex items-center gap-2">
                      {l.quality ?? "—"}
                      {tipoDeLote(l) && (
                        <span className="text-xs text-fg-subtle">· {tipoDeLote(l)}</span>
                      )}
                      {l.cadmio && (
                        <Badge tone={/alto/i.test(l.cadmio) ? "danger" : "neutral"}>
                          Cd {l.cadmio.toLowerCase()}
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                    {canWrite ? (
                      <Select
                        aria-label={`Bodega de ${l.codigo_nuevo ?? l.code}`}
                        value={l.bodega ?? ""}
                        onChange={(e) => void cambiarBodega(l, e.target.value)}
                        className={cn("h-8 w-32 text-xs", !l.bodega && "text-warn")}
                      >
                        <option value="">Sin asignar</option>
                        {BODEGAS.map((b) => (
                          <option key={b} value={b}>
                            {NOMBRE_BODEGA[b]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className={cn("text-xs", l.bodega ? "text-fg-muted" : "text-warn")}>
                        {l.bodega ? NOMBRE_BODEGA[l.bodega] : "Sin asignar"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollFijo>
        </>
      )}

      <LotDetail
        lot={liveSelected}
        open={selected !== null}
        canWrite={canWrite}
        puedeSalida={puedeSalida}
        modoCrm={modoCrm}
        onClose={() => setSelected(null)}
        onEditar={(l) => {
          setSelected(null);
          setEditing(l);
          setFormOpen(true);
        }}
        onSalida={(id) => {
          setSelected(null);
          setSalida({ abierta: true, lote: id });
        }}
        onChanged={() => router.refresh()}
      />

      <IngresoForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        lote={editing}
        proveedores={proveedores}
        onGuardado={() => {
          setFormOpen(false);
          router.refresh();
        }}
      />

      <SalidaForm
        open={salida.abierta}
        onClose={() => setSalida({ abierta: false, lote: null })}
        lotes={lotesConSaldo}
        destinos={destinos}
        loteInicial={salida.lote}
        onGuardado={() => {
          setSalida({ abierta: false, lote: null });
          router.refresh();
        }}
      />

      <Modal
        open={corte}
        onClose={() => setCorte(false)}
        title="Pasar la carga del inventario al CRM"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCorte(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarCorte} loading={cortando}>
              Pasar al CRM
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-fg-muted">
          <p>
            Desde ese momento el Excel de bodega deja de llegar al CRM: los ingresos, salidas,
            mermas y selecciones se registran aquí. <strong className="text-fg">No se puede
            deshacer desde la aplicación.</strong>
          </p>
          <p>
            Cada lote conserva el saldo que tiene hoy por clase. Lo que el archivo no detallaba
            (merma, selección) queda como un «saldo de apertura» en su historial.
          </p>
          <p>Hazlo cuando la bodega ya no vaya a anotar en el Excel, para no contar nada dos veces.</p>
        </div>
      </Modal>
    </div>
  );
}

function nombreVista(v: Vista): string {
  return v === "todas" ? "Consolidado" : v === "sin" ? "Sin asignar" : NOMBRE_BODEGA[v];
}

/** «Primera», «Segunda»… del disponible del lote (o de lo ingresado si ya salió). */
function tipoDeLote(l: InventoryLot): string | null {
  const t = disponiblePorTipo(l);
  const mayor = TIPOS.reduce((a, b) => (t[b] > t[a] ? b : a));
  if (t[mayor] > 0) return NOMBRE_TIPO[mayor];
  const entra = disponiblePorTipo({
    qty_avail_premium_kg: l.qty_in_premium_kg,
    qty_avail_estandar_kg: l.qty_in_estandar_kg,
    qty_avail_corriente_kg: l.qty_in_corriente_kg,
    qty_avail_corriente_c_kg: l.qty_in_corriente_c_kg,
    qty_avail_fairtrade_kg: l.qty_in_fairtrade_kg,
    qty_avail_rainforest_kg: l.qty_in_rainforest_kg,
    qty_avail_organico_kg: l.qty_in_organico_kg,
    qty_avail_pasilla_kg: l.qty_in_pasilla_kg,
    qty_avail_baba_kg: l.qty_in_baba_kg,
  });
  const m2 = TIPOS.reduce((a, b) => (entra[b] > entra[a] ? b : a));
  return entra[m2] > 0 ? NOMBRE_TIPO[m2] : null;
}

/**
 * Disponible por bodega × tipo. Es la vista consolidada y, a la vez, el
 * selector: tocar una fila filtra los lotes de esa bodega.
 */
function ResumenBodegas({
  filas,
  total,
  vista,
  onVista,
}: {
  filas: FilaResumen[];
  total: FilaResumen;
  vista: Vista;
  onVista: (v: Vista) => void;
}) {
  const hayBaba = total.tipos.baba > 0;
  const kg = (v: number) => (Math.abs(v) < 0.5 ? "—" : formatNumber(v));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Warehouse className="h-4 w-4 text-fg-subtle" />
          Disponible por bodega
        </CardTitle>
        <span className="font-mono text-xs text-fg-subtle tnum">kg</span>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-subtle">
              <th className="px-5 py-2.5 text-left font-medium">Bodega</th>
              {TIPOS.map((t) => (
                <th key={t} className="px-4 py-2.5 text-right font-medium">
                  {NOMBRE_TIPO[t]}
                </th>
              ))}
              <th className="px-5 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const v: Vista = f.bodega ?? "sin";
              const activa = vista === v;
              return (
                <tr
                  key={v}
                  onClick={() => onVista(activa ? "todas" : v)}
                  aria-selected={activa}
                  className={cn(
                    "cursor-pointer border-b border-border transition-colors hover:bg-bg-subtle/50",
                    activa && "bg-accent-soft/40",
                  )}
                >
                  <td className="px-5 py-2.5">
                    <span className={cn("font-medium", f.bodega ? "text-fg" : "text-warn")}>
                      {nombreVista(v)}
                    </span>
                    <span className="ml-2 font-mono text-xs text-fg-subtle tnum">
                      {f.lotes} {f.lotes === 1 ? "lote" : "lotes"}
                    </span>
                  </td>
                  {TIPOS.map((t) => (
                    <td key={t} className="px-4 py-2.5 text-right font-mono tnum text-fg-muted">
                      {kg(f.tipos[t])}
                    </td>
                  ))}
                  <td className="px-5 py-2.5 text-right font-mono font-semibold tnum text-fg">
                    {kg(f.total)}
                  </td>
                </tr>
              );
            })}
            <tr
              onClick={() => onVista("todas")}
              className={cn(
                "cursor-pointer bg-bg-subtle/40 transition-colors hover:bg-bg-subtle/70",
                vista === "todas" && "bg-accent-soft/40",
              )}
            >
              <td className="px-5 py-3 font-semibold text-fg">Consolidado</td>
              {TIPOS.map((t) => (
                <td key={t} className="px-4 py-3 text-right font-mono font-semibold tnum text-fg">
                  {kg(total.tipos[t])}
                </td>
              ))}
              <td className="px-5 py-3 text-right font-mono text-base font-semibold tnum text-fg">
                {kg(total.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-5 py-2.5 text-xs text-fg-subtle">
        Primera = Premium, Estándar, Fairtrade y Rainforest · Segunda = Corriente, Corriente C y
        Pasilla
        {!hayBaba && " · Baba (cacao fresco) entra con los ingresos registrados en el CRM"}
        {filas.some((f) => f.bodega === null) &&
          " · Asigna la bodega de cada lote en la columna «Bodega»"}
      </p>
    </Card>
  );
}
