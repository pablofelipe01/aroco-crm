"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Link2, Link2Off, MapPin, Package, Users, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatCOP, formatDate, formatNumber, cn } from "@/lib/utils";
import { enlazarAcopio, ubicarVereda } from "./actions";
import type { AcopioVista, LoteOpcion, LugarPunto, VeredaEnAcopio } from "./page";

/**
 * El mapa se carga solo en el navegador. Leaflet toca `window` al importarse,
 * así que renderizarlo en el servidor revienta el build entero.
 */
const MapaTrazabilidad = dynamic(
  () => import("./mapa").then((m) => m.MapaTrazabilidad),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[22rem] items-center justify-center rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 text-sm text-fg-subtle">
        Cargando mapa…
      </div>
    ),
  },
);

const kg = (v: number) => `${formatNumber(v, 1)} kg`;

export function TrazabilidadClient({
  acopios,
  bodega,
  veredas,
  lotes,
}: {
  acopios: AcopioVista[];
  bodega: LugarPunto | null;
  veredas: LugarPunto[];
  lotes: LoteOpcion[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [abierto, setAbierto] = React.useState<string | null>(
    acopios[0]?.id ?? null,
  );
  const [enlazando, setEnlazando] = React.useState<AcopioVista | null>(null);
  const [ubicando, setUbicando] = React.useState<VeredaEnAcopio | null>(null);

  const acopio = acopios.find((a) => a.id === abierto) ?? acopios[0] ?? null;

  const ubicadas = veredas.filter((v) => v.lat !== null).length;
  const totalKg = acopios.reduce((s, a) => s + a.kgTotal, 0);
  const enlazados = acopios.filter((a) => a.loteId).length;

  if (acopios.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Trazabilidad"
          description="Prueba piloto · de la bodega a la finca"
        />
        <EmptyState
          icon={<MapPin className="h-6 w-6" />}
          title="Todavía no hay acopios"
          description="La hoja de ruta se lee cada día a las 12:30 UTC. Si acabas de crearla, espera a la próxima corrida."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trazabilidad"
        description="Prueba piloto · de la bodega de AROCO a la vereda productora"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Acopios" value={acopios.length} icon={Package} />
        <StatCard
          label="Kilos trazados"
          value={Number(totalKg.toFixed(0))}
          suffix=" kg"
          icon={Package}
        />
        <StatCard
          label="Enlazados a un lote"
          value={enlazados}
          hint={`de ${acopios.length}`}
          icon={Link2}
        />
        <StatCard
          label="Veredas ubicadas"
          value={ubicadas}
          hint={`de ${veredas.length} · el mapa solo pinta las ubicadas`}
          icon={MapPin}
        />
      </div>

      {/* Que falten coordenadas no es un detalle: es lo que separa «viene del
          Cauca» de «viene de esta vereda», que es lo que se quiere demostrar. */}
      {ubicadas < veredas.length && (
        <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-warn/40 bg-warn-soft/40 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-warn">
              {veredas.length - ubicadas} de {veredas.length} veredas sin ubicar
            </p>
            <p className="mt-1 text-fg-muted">
              El mapa muestra la bodega y los municipios de la ruta, que sí
              tienen coordenada publicada. Las veredas aparecen cuando alguien
              les ponga la suya — se hace desde la lista de abajo, pegando el
              punto de Google Maps. No se colocan aproximadas: un punto
              inventado en trazabilidad termina citándose como cierto.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
        {/* ── Acopios ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Acopios</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {acopios.map((a) => (
              <button
                key={a.id}
                onClick={() => setAbierto(a.id)}
                className={cn(
                  "w-full rounded-[var(--radius-md)] border p-3 text-left transition-colors",
                  a.id === acopio?.id
                    ? "border-accent bg-accent-soft/40"
                    : "border-border bg-surface hover:border-border-strong",
                )}
              >
                <p className="flex items-center justify-between gap-2 text-sm font-medium text-fg">
                  <span>Ruta {a.ruta}</span>
                  <span className="font-mono text-xs text-fg-subtle">
                    {formatDate(a.fecha)}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-xs text-fg-muted">
                  {a.rutaEtiqueta}
                </p>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono tnum text-fg-muted">{kg(a.kgTotal)}</span>
                  <span className="text-fg-subtle">·</span>
                  <span className="text-fg-muted">{a.productores} productores</span>
                  {a.loteId ? (
                    <Badge tone="success">enlazado</Badge>
                  ) : (
                    <Badge tone="warn">sin lote</Badge>
                  )}
                </p>
              </button>
            ))}
          </CardBody>
        </Card>

        {/* ── Cadena ───────────────────────────────────────────────────── */}
        {acopio && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  Ruta {acopio.ruta} · {acopio.rutaEtiqueta}
                </CardTitle>
                <span className="font-mono text-xs text-fg-subtle">
                  {formatDate(acopio.fecha)}
                </span>
              </CardHeader>
              <CardBody className="space-y-4">
                {/* El eslabón que faltaba: qué lote de bodega es este acopio. */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-3">
                  <div className="min-w-0 text-sm">
                    {acopio.loteId ? (
                      <>
                        <p className="font-medium text-fg">{acopio.loteCodigo}</p>
                        <p className="mt-0.5 text-xs text-fg-muted">
                          Lote de bodega · {kg(acopio.loteKg ?? 0)} de entrada
                          {acopio.loteFecha ? ` · ${formatDate(acopio.loteFecha)}` : ""}
                          {acopio.enlazadoEn
                            ? ` · enlazado el ${formatDate(acopio.enlazadoEn)}`
                            : ""}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-warn">Sin lote enlazado</p>
                        <p className="mt-0.5 text-xs text-fg-muted">
                          Este acopio todavía no dice a qué cacao de la bodega
                          corresponde.
                        </p>
                      </>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={acopio.loteId ? "secondary" : "primary"}
                    onClick={() => setEnlazando(acopio)}
                  >
                    {acopio.loteId ? (
                      <>
                        <Link2Off className="h-3.5 w-3.5" />
                        Cambiar
                      </>
                    ) : (
                      <>
                        <Link2 className="h-3.5 w-3.5" />
                        Enlazar lote
                      </>
                    )}
                  </Button>
                </div>

                <MapaTrazabilidad
                  bodega={bodega}
                  municipios={acopio.municipios}
                  veredas={acopio.veredas}
                  className="overflow-hidden rounded-[var(--radius-md)] border border-border"
                />

                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">
                      Primera
                    </dt>
                    <dd className="font-mono tnum text-fg">{kg(acopio.kgPrimera)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">
                      Segunda
                    </dt>
                    <dd className="font-mono tnum text-fg">{kg(acopio.kgSegunda)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">
                      Productores
                    </dt>
                    <dd className="font-mono tnum text-fg">{acopio.productores}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">
                      Pagado
                    </dt>
                    <dd className="font-mono tnum text-fg">
                      {formatCOP(acopio.totalVenta)}
                    </dd>
                  </div>
                </dl>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <span className="inline-flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-fg-subtle" /> Veredas (
                    {acopio.veredas.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardBody>
                <ul className="divide-y divide-border">
                  {acopio.veredas.map((v) => (
                    <li
                      key={v.id ?? v.nombre}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-fg">{v.nombre}</span>
                        {v.lat === null && (
                          <Badge tone="warn">sin ubicar</Badge>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-3 text-xs">
                        <span className="text-fg-muted">
                          {v.productores} prod.
                        </span>
                        <span className="font-mono tnum text-fg">{kg(v.kg)}</span>
                        {v.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setUbicando(v)}
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            {v.lat === null ? "Ubicar" : "Mover"}
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <span className="inline-flex items-center gap-2">
                    <Users className="h-4 w-4 text-fg-subtle" /> Productores (
                    {acopio.entregas.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardBody>
                <div className="max-h-[26rem] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface">
                      <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                        <th className="pb-2 pr-3 font-medium">Productor</th>
                        <th className="pb-2 pr-3 font-medium">Vereda</th>
                        <th className="pb-2 pr-3 text-right font-medium">Kg</th>
                        <th className="pb-2 text-right font-medium">Pagado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acopio.entregas.map((e) => (
                        <tr
                          key={e.id}
                          className="border-b border-border/60 last:border-0"
                        >
                          <td className="py-1.5 pr-3 text-fg">
                            {e.productor}
                            {e.tipoProductor && (
                              <span className="ml-1.5 text-[11px] text-fg-subtle">
                                {e.tipoProductor}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-xs text-fg-muted">
                            {e.vereda ?? "—"}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono tnum text-fg">
                            {formatNumber(e.kg, 1)}
                          </td>
                          <td className="py-1.5 text-right font-mono tnum text-fg-muted">
                            {e.totalVenta === null ? "—" : formatCOP(e.totalVenta)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </div>

      {enlazando && (
        <ModalEnlace
          acopio={enlazando}
          lotes={lotes}
          onClose={() => setEnlazando(null)}
          onHecho={() => {
            setEnlazando(null);
            router.refresh();
          }}
          toast={toast}
        />
      )}

      {ubicando && (
        <ModalUbicar
          vereda={ubicando}
          onClose={() => setUbicando(null)}
          onHecho={() => {
            setUbicando(null);
            router.refresh();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

type Toast = ReturnType<typeof useToast>["toast"];

/**
 * Elegir a qué lote corresponde el acopio.
 *
 * Se sugieren primero los lotes cuyo código trae el mismo número de ruta, y se
 * avisa cuando los kilos no cuadran — pero no se bloquea: un lote de bodega
 * puede juntar dos acopios, y el peso seco no es el de recibo. La advertencia
 * informa, la decisión es de quien mira.
 */
function ModalEnlace({
  acopio,
  lotes,
  onClose,
  onHecho,
  toast,
}: {
  acopio: AcopioVista;
  lotes: LoteOpcion[];
  onClose: () => void;
  onHecho: () => void;
  toast: Toast;
}) {
  const [elegido, setElegido] = React.useState(acopio.loteId ?? "");
  const [guardando, setGuardando] = React.useState(false);

  const mismaRuta = lotes.filter((l) => l.ruta === acopio.ruta);
  const otros = lotes.filter((l) => l.ruta !== acopio.ruta);
  const lote = lotes.find((l) => l.id === elegido) ?? null;

  const desfase =
    lote && acopio.kgTotal > 0
      ? ((lote.qty_in_kg - acopio.kgTotal) / acopio.kgTotal) * 100
      : null;

  async function guardar(valor: string | null) {
    setGuardando(true);
    const res = await enlazarAcopio(acopio.id, valor);
    setGuardando(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo enlazar", description: res.error });
      return;
    }
    toast({
      tone: "success",
      title: valor ? "Acopio enlazado" : "Enlace deshecho",
    });
    onHecho();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Enlazar el acopio de la ruta ${acopio.ruta}`}
      footer={
        <>
          {acopio.loteId && (
            <Button
              variant="ghost"
              size="sm"
              loading={guardando}
              onClick={() => guardar(null)}
            >
              <Link2Off className="h-4 w-4" />
              Quitar enlace
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            size="sm"
            loading={guardando}
            disabled={!elegido}
            onClick={() => guardar(elegido)}
          >
            Enlazar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">
          El acopio del {formatDate(acopio.fecha)} recogió{" "}
          <b className="font-mono tnum">{kg(acopio.kgTotal)}</b> de{" "}
          {acopio.productores} productores. Elige el lote de bodega al que
          corresponde.
        </p>

        <Field
          label="Lote"
          hint={
            mismaRuta.length > 0
              ? `Los de la ruta ${acopio.ruta} van primero.`
              : `No hay ningún lote de la ruta ${acopio.ruta} en el inventario.`
          }
        >
          <Select value={elegido} onChange={(e) => setElegido(e.target.value)}>
            <option value="">Sin enlazar</option>
            {mismaRuta.length > 0 && (
              <optgroup label={`Ruta ${acopio.ruta}`}>
                {mismaRuta.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} · {formatNumber(l.qty_in_kg, 0)} kg ·{" "}
                    {l.entry_date ? formatDate(l.entry_date) : "sin fecha"}
                  </option>
                ))}
              </optgroup>
            )}
            {otros.length > 0 && (
              <optgroup label="Otras rutas">
                {otros.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} · {formatNumber(l.qty_in_kg, 0)} kg ·{" "}
                    {l.entry_date ? formatDate(l.entry_date) : "sin fecha"}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>

        {lote && desfase !== null && Math.abs(desfase) > 10 && (
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-warn/40 bg-warn-soft/40 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <p className="text-xs text-fg-muted">
              El lote tiene{" "}
              <b className="font-mono tnum">{formatNumber(lote.qty_in_kg, 0)} kg</b>{" "}
              y el acopio{" "}
              <b className="font-mono tnum">{formatNumber(acopio.kgTotal, 0)} kg</b>:{" "}
              {desfase > 0 ? "+" : ""}
              {formatNumber(desfase, 0)} %. Puede ser correcto —un lote puede
              juntar dos acopios, y el peso seco no es el de recibo— pero
              compruébalo antes de enlazar.
            </p>
          </div>
        )}

        {lote && lote.ruta !== acopio.ruta && (
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-danger/40 bg-danger-soft/40 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-xs text-fg-muted">
              Ese lote es de la ruta {lote.ruta ?? "—"} y este acopio es de la{" "}
              {acopio.ruta}. Si lo enlazas, el lote va a decir que viene de unas
              veredas que no son las suyas.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Poner la coordenada de una vereda, pegando el punto de Google Maps. */
function ModalUbicar({
  vereda,
  onClose,
  onHecho,
  toast,
}: {
  vereda: VeredaEnAcopio;
  onClose: () => void;
  onHecho: () => void;
  toast: Toast;
}) {
  const [texto, setTexto] = React.useState(
    vereda.lat !== null && vereda.lng !== null ? `${vereda.lat}, ${vereda.lng}` : "",
  );
  const [fuente, setFuente] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);

  async function guardar() {
    if (!vereda.id) return;
    setGuardando(true);
    const res = await ubicarVereda(vereda.id, texto, fuente);
    setGuardando(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo ubicar", description: res.error });
      return;
    }
    toast({ tone: "success", title: `${vereda.nombre} ubicada` });
    onHecho();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ubicar ${vereda.nombre}`}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" loading={guardando} onClick={guardar}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Coordenada"
          hint="Pega el punto de Google Maps: clic derecho sobre el sitio y copia el par de números. Déjalo vacío para quitar la ubicación."
        >
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="3.2367, -76.4128"
            autoFocus
          />
        </Field>
        <Field
          label="De dónde salió"
          hint="Una coordenada sin procedencia no sirve para respaldar un origen. Si lo dejas vacío queda tu nombre."
        >
          <Input
            value={fuente}
            onChange={(e) => setFuente(e.target.value)}
            placeholder="p. ej. GPS del agente de campo, 7-sep-2026"
          />
        </Field>
      </div>
    </Modal>
  );
}
