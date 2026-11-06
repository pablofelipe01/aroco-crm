"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Truck, Trash2, Search, X } from "lucide-react";
import { ScrollFijo } from "@/components/ui/scroll-fijo";
import { BarraFija } from "@/components/ui/scroll-efectos";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatKg, formatDate, formatCOP } from "@/lib/utils";
import type { DispatchWithLinks } from "./page";
import { DispatchTrace } from "./dispatch-trace";
import { deleteDispatch } from "./actions";
import { SalidaForm, type LoteConSaldo } from "../inventario/salida-form";
import { BODEGAS, NOMBRE_BODEGA, esBodega, type Bodega } from "@/lib/inventory/bodegas";

/** Bodega de un despacho: la del lote del que salió. */
function bodegaDe(d: DispatchWithLinks): Bodega | null {
  return esBodega(d.origen?.bodega) ? d.origen.bodega : null;
}

export function DespachosClient({
  initialDispatches,
  lotesConSaldo,
  canWrite,
  modoCrm,
}: {
  initialDispatches: DispatchWithLinks[];
  /** Lotes del libro del CRM con saldo, para la «Nueva salida». */
  lotesConSaldo: LoteConSaldo[];
  canWrite: boolean;
  /** Las salidas se registran aquí solo cuando la carga ya es desde el CRM. */
  modoCrm: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [trace, setTrace] = React.useState<DispatchWithLinks | null>(null);
  const [query, setQuery] = React.useState("");
  const [destino, setDestino] = React.useState("");
  const [desde, setDesde] = React.useState("");
  const [hasta, setHasta] = React.useState("");
  const [bodega, setBodega] = React.useState("");
  // Distinct destinations for the dropdown.
  const destinations = React.useMemo(
    () =>
      [...new Set(initialDispatches.map((d) => d.destination).filter(Boolean))].sort() as string[],
    [initialDispatches],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialDispatches.filter((d) => {
      if (
        q &&
        !`${d.destination ?? ""} ${d.origin ?? ""} ${d.remision_salida ?? ""} ${d.lot?.code ?? ""}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      if (destino && d.destination !== destino) return false;
      if (bodega === "sin" ? bodegaDe(d) !== null : bodega && bodegaDe(d) !== bodega) return false;
      if (desde && (d.dispatch_date ?? "") < desde) return false;
      if (hasta && (d.dispatch_date ?? "") > hasta) return false;
      return true;
    });
  }, [initialDispatches, query, destino, desde, hasta, bodega]);

  const hasFilters = Boolean(query || destino || desde || hasta || bodega);
  function clearFilters() {
    setQuery("");
    setDestino("");
    setDesde("");
    setHasta("");
    setBodega("");
  }

  async function onDelete(d: DispatchWithLinks) {
    if (!confirm(`¿Eliminar el despacho ${d.remision_salida ?? ""}?`)) return;
    const res = await deleteDispatch(d.id);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo eliminar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Despacho eliminado" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Despachos"
        description={`${initialDispatches.length} salidas registradas`}
        actions={
          canWrite && modoCrm && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Nueva salida
            </Button>
          )
        }
      />

      {/* Filtros fijos arriba al bajar (revisión del 2026-10-30): el título se
          va, los filtros y los encabezados de la tabla quedan.
          ScrollFijo la encuentra por data-fijo-encima y se para bajo ella. En
          celular no se fija. */}
      <BarraFija className="flex flex-wrap items-end gap-3">
        <Field label="Buscar" className="w-full sm:w-56">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Remisión, destino, procedencia…"
              className="pl-9"
            />
          </div>
        </Field>
        <Field label="Destino" className="w-full sm:w-48">
          <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Todos</option>
            {destinations.map((dest) => (
              <option key={dest} value={dest}>
                {dest}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Bodega" className="w-full sm:w-36">
          <Select value={bodega} onChange={(e) => setBodega(e.target.value)}>
            <option value="">Todas</option>
            {BODEGAS.map((b) => (
              <option key={b} value={b}>
                {NOMBRE_BODEGA[b]}
              </option>
            ))}
            <option value="sin">Sin asignar</option>
          </Select>
        </Field>
        <Field label="Desde" className="w-36">
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </Field>
        <Field label="Hasta" className="w-36">
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Field>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4" />
            Limpiar
          </Button>
        )}
        <span className="ml-auto self-center text-xs text-fg-subtle">
          {filtered.length} de {initialDispatches.length}
        </span>
      </BarraFija>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Truck className="h-6 w-6" />}
          title={hasFilters ? "Sin resultados con esos filtros" : "Sin despachos"}
        />
      ) : (
        <>
        {/* Mobile: card list */}
        <ul className="space-y-2 sm:hidden">
          {filtered.map((d) => (
            <li
              key={d.id}
              onClick={() => setTrace(d)}
              className="cursor-pointer rounded-[var(--radius-md)] border border-border bg-surface p-3 shadow-[var(--shadow-soft-sm)] transition-colors hover:border-accent/40"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 font-medium text-fg">
                  {d.destination ?? "—"}
                </span>
                <span className="font-mono text-sm font-semibold tnum text-fg">
                  {formatKg(d.qty_kg)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
                <span className="font-mono">{formatDate(d.dispatch_date)}</span>
                {bodegaDe(d) && <span>{NOMBRE_BODEGA[bodegaDe(d)!]}</span>}
                {d.remision_salida && <span className="font-mono">Rem. {d.remision_salida}</span>}
                {d.purchase_price_cop_kg != null && (
                  <span className="font-mono">{formatCOP(d.purchase_price_cop_kg)}/kg</span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-fg-muted">
                  {d.origin ?? "—"}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {d.lot && (
                    <Badge tone="accent" className="font-mono">
                      {d.lot.code}
                    </Badge>
                  )}
                  {canWrite && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(d);
                      }}
                      className="rounded p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Desktop: table. Scroll propio para que la fila de encabezados quede
            fija al bajar (con overflow-x, un sticky no se pega al scroll de la
            página). */}
        <ScrollFijo className="hidden rounded-[var(--radius-lg)] border border-border bg-surface sm:block">
          <table className="w-full min-w-[840px] text-sm">
            <thead>
              {/* Cada th fijo con fondo; el borde va como sombra porque el de la
                  fila no viaja con un th fijo. */}
              <tr className="text-xs uppercase tracking-wide text-fg-subtle [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface [&>th]:shadow-[inset_0_-1px_0_var(--color-border)]">
                <th className="px-4 py-3 text-left font-medium">Fecha</th>
                <th className="px-4 py-3 text-left font-medium">Remisión</th>
                <th className="px-4 py-3 text-left font-medium">Destino</th>
                <th className="px-4 py-3 text-left font-medium">Procedencia / Lote</th>
                <th className="px-4 py-3 text-left font-medium">Bodega</th>
                <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                <th className="px-4 py-3 text-right font-medium">Precio compra</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setTrace(d)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-3 font-mono text-xs text-fg-subtle">
                    {formatDate(d.dispatch_date)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg">
                    {d.remision_salida ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-fg">{d.destination ?? "—"}</td>
                  <td className="px-4 py-3 text-fg-muted">
                    {d.origin ?? "—"}
                    {d.lot && (
                      <Badge tone="accent" className="ml-2 align-middle font-mono">
                        {d.lot.code}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-fg-muted">
                    {bodegaDe(d) ? NOMBRE_BODEGA[bodegaDe(d)!] : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tnum font-medium text-fg">
                    {formatKg(d.qty_kg)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tnum text-fg-muted">
                    {d.purchase_price_cop_kg != null ? (
                      <>
                        {formatCOP(d.purchase_price_cop_kg)}
                        {/* Lo que costó ESTE despacho. El precio por kilo dice
                            a cómo se compró; el total dice cuánta plata salió
                            por esa puerta, que es la cifra con la que se
                            compara contra la venta. */}
                        <span className="block text-[11px] text-fg-subtle">
                          {formatCOP(
                            Number(d.purchase_price_cop_kg) * Number(d.qty_kg),
                          )}{" "}
                          en total
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(d);
                        }}
                        className="rounded p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollFijo>
        </>
      )}

      <DispatchTrace
        dispatch={trace}
        open={trace !== null}
        onClose={() => setTrace(null)}
      />

      <SalidaForm
        open={open}
        onClose={() => setOpen(false)}
        lotes={lotesConSaldo}
        destinos={destinations}
        onGuardado={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
