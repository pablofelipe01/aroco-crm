"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Boxes, Coins, ShieldAlert, TrendingUp, AlertTriangle, Landmark, RefreshCw, ImageUp,
  Newspaper, ExternalLink,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { sincronizarAhora, subirTablero } from "./actions";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { staggerContainer } from "@/lib/motion";
import { formatNumber, formatCOP, formatDate } from "@/lib/utils";
import type { DatosMercado } from "./riesgo-data";

const usd = (n: number | null) =>
  n === null ? "—" : `US$ ${n.toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;

/** Millones de pesos: en pesos crudos la cifra deja de leerse. */
const cop = (n: number | null) =>
  n === null ? "—" : Math.abs(n) >= 1_000_000 ? `$ ${formatNumber(n / 1_000_000, 1)} M` : formatCOP(n);

export function MercadoClient({
  datos: d,
  sync,
}: {
  datos: DatosMercado;
  sync: { ran_at: string; status: string; error: string | null } | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [sincronizando, setSincronizando] = React.useState(false);
  const [tableroOpen, setTableroOpen] = React.useState(false);
  const [leyendo, setLeyendo] = React.useState(false);
  const r = d.riesgo;

  async function alSincronizar() {
    setSincronizando(true);
    const res = await sincronizarAhora();
    setSincronizando(false);
    toast({
      tone: res.ok ? (res.detalle ? "warn" : "success") : "error",
      title: res.mensaje,
      description: res.detalle,
    });
    if (res.ok) router.refresh();
  }

  const descubierto = r.toneladasFisicas > 0 && r.coberturaPct < 100;

  async function alSubirTablero(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLeyendo(true);
    const res = await subirTablero(fd);
    setLeyendo(false);
    toast({
      tone: res.ok ? (res.detalle ? "warn" : "success") : "error",
      title: res.mensaje,
      description: res.detalle,
    });
    if (res.ok) {
      setTableroOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mercado"
        description="Posición física, cobertura y exposición al precio"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setTableroOpen(true)}>
              <ImageUp className="h-4 w-4" />
              Cargar tablero
            </Button>
            <Button size="sm" variant="secondary" onClick={alSincronizar} loading={sincronizando}>
              <RefreshCw className="h-4 w-4" />
              Sincronizar ahora
            </Button>
          </div>
        }
      />

      {/* Traer los datos tarda: Barchart navega con Playwright del otro lado.
          Decirlo evita que alguien crea que se colgó y recargue a la mitad. */}
      {sincronizando && (
        <p className="text-xs text-fg-subtle">
          Consultando StoneX, Barchart y la TRM. Puede tomar un par de minutos.
        </p>
      )}

      {d.error && (
        <div role="alert" className="flex items-start gap-3 rounded-[var(--radius-md)] border border-danger/40 bg-danger-soft p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-danger">No se pudo cargar la posición</p>
            <p className="mt-1 font-mono text-xs text-fg-subtle">{d.error}</p>
          </div>
        </div>
      )}

      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="En bodega" value={r.toneladasFisicas} decimals={2} suffix=" t" icon={Boxes}
          hint={`${d.totales.lotes_con_saldo} lotes · costo ${formatCOP(d.totales.costo_promedio_cop_kg ?? 0)}/kg`} />
        <StatCard label="Descubierto" value={r.toneladasDescubiertas} decimals={2} suffix=" t" icon={ShieldAlert}
          hint={r.coberturaPct === 0 ? "Sin ninguna cobertura" : `${r.coberturaPct.toFixed(1)}% cubierto`} />
        <StatCard
          label="Cacao hoy"
          value={r.precioMercadoCopKg ?? 0}
          prefix="$ "
          suffix="/kg"
          icon={TrendingUp}
          // La variación del día es lo que dice si hay que mirar la pantalla
          // ahora o mañana.
          delta={
            d.mercado.precioUsdT && d.mercado.cierrePrevio
              ? ((d.mercado.precioUsdT - d.mercado.cierrePrevio) / d.mercado.cierrePrevio) * 100
              : undefined
          }
          hint={
            d.mercado.precioUsdT
              ? `${usd(d.mercado.precioUsdT)}/t${d.mercado.fuente === "vivo" ? " · en vivo" : ""}`
              : "Sin precio"
          }
        />
        <StatCard label="Valorización" value={Math.round((r.pnlFisicoCop ?? 0) / 1_000_000)} prefix="$ " suffix=" M" icon={Coins}
          hint="Contra el costo de compra" />
      </motion.div>

      {/* La exposición es el número que importa. Si está descubierta, tiene que
          verse como una advertencia, no como una fila más de una tabla. */}
      {descubierto && (
        <div className="rounded-[var(--radius-md)] border border-warn/50 bg-warn-soft p-4">
          <p className="text-sm font-medium text-warn">
            {r.coberturaPct === 0
              ? `Las ${formatNumber(r.toneladasFisicas, 2)} toneladas en bodega están expuestas al precio`
              : `${formatNumber(r.toneladasDescubiertas, 2)} de ${formatNumber(r.toneladasFisicas, 2)} toneladas sin cobertura`}
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            No hay puts comprados ni futuros vendidos que protejan de una caída.
            {r.pnlFisicoCop !== null && r.pnlFisicoCop > 0 && (
              <> Hoy el inventario vale <strong>{cop(r.pnlFisicoCop)}</strong> más de lo que costó; esa diferencia es lo que está en juego.</>
            )}
          </p>
        </div>
      )}

      {r.faltantes.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-info/40 bg-info-soft p-4">
          <p className="text-sm text-info">
            El cálculo está incompleto: falta {r.faltantes.join(", ")}. Las cifras que
            dependen de eso salen en blanco en vez de en cero.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Cobertura</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            <div className="h-3 w-full overflow-hidden rounded-full bg-bg-muted">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, r.coberturaPct)}%` }} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Dato k="Puts comprados" v={`${r.contratos.putsLargos} contratos`} />
              <Dato k="Calls vendidos" v={`${r.contratos.callsCortos} contratos`} />
              <Dato k="Futuros vendidos" v={`${r.contratos.futurosCortos} contratos`} />
              <Dato k="Futuros comprados" v={`${r.contratos.futurosLargos} contratos`} />
            </dl>
            {d.cobertura && (
              <div className="rounded-[var(--radius-md)] border border-border p-3 text-sm">
                <p className="text-fg">
                  Cobertura efectiva:{" "}
                  <span className="font-mono tnum font-semibold">
                    {formatNumber(d.cobertura.efectivaT, 2)} t
                  </span>{" "}
                  de {formatNumber(r.toneladasCubiertas, 2)} t nominales
                </p>
                {/* Contar contratos sobreestima la protección: un put muy fuera
                    de dinero cubre en el papel y casi nada en la práctica. */}
                <p className="mt-1 text-xs text-fg-subtle">
                  Ponderada por delta. Los contratos nominales suponen protección
                  total; el delta dice cuánto se mueve la opción de verdad cuando
                  cae el precio.
                  {d.cobertura.sinDeltaT > 0 && (
                    <> {formatNumber(d.cobertura.sinDeltaT, 2)} t sin delta en el tablero cargado.</>
                  )}
                </p>
              </div>
            )}

            {r.collar ? (
              <p className="rounded-[var(--radius-md)] border border-border p-3 text-sm text-fg-muted">
                Collar armado entre <span className="font-mono tnum text-fg">{usd(r.collar.piso)}</span> y{" "}
                <span className="font-mono tnum text-fg">{usd(r.collar.techo)}</span> por tonelada.
              </p>
            ) : (
              <p className="text-xs text-fg-subtle">
                No hay collar: haría falta un put comprado y un call vendido a la vez.
                {!d.cobertura && r.contratos.putsLargos > 0 && (
                  <> Carga el tablero para ver cuánto cubren de verdad esos puts.</>
                )}
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Landmark className="h-4 w-4 text-fg-subtle" /> Cuenta del broker
              </span>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {!d.broker ? (
              <EmptyState title="Sin estados de cuenta cargados" />
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Dato k="Cuenta" v={d.broker.cuenta ?? "—"} />
                <Dato k="Equity" v={usd(d.broker.equity)} />
                <Dato k="Margen inicial" v={usd(d.broker.margenInicial)} />
                <Dato k={`P&L realizado (${d.broker.moneda})`} v={usd(d.broker.pnlYtd)} tono={(d.broker.pnlYtd ?? 0) < 0 ? "danger" : undefined} />
              </dl>
            )}
          </CardBody>
        </Card>
      </div>

      {d.escenarios.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Si el precio se mueve</CardTitle></CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                    <th className="pb-2 pr-3 font-medium">Escenario</th>
                    <th className="pb-2 pr-3 text-right font-medium">Cacao COP/kg</th>
                    <th className="pb-2 text-right font-medium">Valorización del inventario</th>
                  </tr>
                </thead>
                <tbody>
                  {d.escenarios.map((e) => (
                    <tr key={e.variacion} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 text-fg">
                        {e.variacion === 0 ? "Precio de hoy" : `${e.variacion > 0 ? "+" : ""}${(e.variacion * 100).toFixed(0)}%`}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tnum text-fg-muted">{formatCOP(e.precioCopKg)}</td>
                      <td className={"py-2 text-right font-mono tnum " + (e.pnlCop < 0 ? "text-danger" : "text-fg")}>{cop(e.pnlCop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-fg-subtle">
              Solo la pata física. El efecto de la cobertura depende de strikes y
              primas, y Barchart no entrega las griegas: calcularlo sin ellas daría
              una cifra que parece precisa y no lo es.
            </p>
          </CardBody>
        </Card>
      )}

      {d.intel.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Newspaper className="h-4 w-4 text-fg-subtle" /> Qué está pasando en el mercado
              </span>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="space-y-4">
              {d.intel.map((a) => (
                <li key={a.article_id} className="border-b border-border/60 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 text-sm font-medium text-fg">{a.title}</p>
                    <span className="shrink-0 font-mono tnum text-xs text-fg-subtle">
                      {formatDate(a.published_at)}
                    </span>
                  </div>
                  {/* El resumen en español es lo que se lee; el original en
                      inglés queda a un clic para quien quiera la fuente. */}
                  <p className="mt-1 text-sm text-fg-muted">
                    {a.resumen ?? a.abstract ?? "Sin resumen disponible."}
                  </p>
                  {a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      Leer en StoneX <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Lotes en bodega</CardTitle></CardHeader>
        <CardBody>
          {d.lotes.length === 0 ? (
            <EmptyState title="No hay cacao en bodega" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                    <th className="pb-2 pr-3 font-medium">Lote</th>
                    <th className="pb-2 pr-3 font-medium">Ingreso</th>
                    <th className="pb-2 pr-3 text-right font-medium">Disponible</th>
                    <th className="pb-2 pr-3 text-right font-medium">Costo/kg</th>
                    <th className="pb-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lotes.map((l) => (
                    <tr key={l.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">
                        <span className="text-fg">{l.code}</span>
                        {l.calidad && <Badge tone="neutral" className="ml-2">{l.calidad}</Badge>}
                      </td>
                      <td className="py-2 pr-3 font-mono tnum text-xs text-fg-muted">{l.fecha ? formatDate(l.fecha) : "—"}</td>
                      <td className="py-2 pr-3 text-right font-mono tnum text-fg">{formatNumber(l.kg_disponible)} kg</td>
                      <td className="py-2 pr-3 text-right font-mono tnum text-fg-muted">{l.precio_compra_cop_kg ? formatCOP(l.precio_compra_cop_kg) : "—"}</td>
                      <td className="py-2 text-right font-mono tnum text-fg-muted">{l.valor_cop ? formatCOP(l.valor_cop) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <ModalTablero
        open={tableroOpen}
        onClose={() => setTableroOpen(false)}
        onSubmit={alSubirTablero}
        leyendo={leyendo}
      />

      {/* De cuándo es cada cifra. Sin esto, un dato de hace tres días se ve
          idéntico a uno de hoy. */}
      <p className="text-xs text-fg-subtle">
        Inventario al día · cacao{" "}
        {d.mercado.momento
          ? new Date(d.mercado.momento).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })
          : d.mercado.fecha
            ? formatDate(d.mercado.fecha)
            : "sin dato"}{" "}
        (ICE NY) ·
        TRM {d.trm.fecha ? `${formatDate(d.trm.fecha)} $ ${formatNumber(d.trm.valor ?? 0, 2)}` : "sin dato"} ·
        broker {d.broker?.fecha ? formatDate(d.broker.fecha) : "sin estado"}
        {/* De dónde salió el precio. Un valor de hace días presentado igual que
            uno en vivo es lo que hace valorar el inventario con un precio que
            ya no existe. */}
        {d.mercado.fuente === "guardado" && (
          <span className="text-warn"> · precio del último cierre guardado, no en vivo</span>
        )}
        {d.mercado.fuente === "paridad" && (
          <span className="text-warn"> · precio deducido del tablero, no cotizado</span>
        )}
        {sync && (
          <>
            {" · "}última sincronización {formatDate(sync.ran_at)}
            {sync.status !== "ok" && <span className="text-danger"> (falló)</span>}
          </>
        )}
      </p>
    </div>
  );
}

function ModalTablero({
  open,
  onClose,
  onSubmit,
  leyendo,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  leyendo: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cargar tablero de opciones"
      description="Una captura del tablero del bróker. Se lee y se descarta: la imagen no se guarda."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="form-tablero" size="sm" loading={leyendo}>
            Leer tablero
          </Button>
        </>
      }
    >
      <form id="form-tablero" onSubmit={onSubmit} className="space-y-4">
        <Field label="Captura del tablero *">
          <Input type="file" name="imagen" accept="image/png,image/jpeg,image/webp" required />
        </Field>
        <Field label="Fecha del tablero" hint="Si se deja vacía, hoy.">
          <Input type="date" name="fecha" defaultValue={new Date().toISOString().slice(0, 10)} />
        </Field>
        <p className="text-xs text-fg-subtle">
          De aquí salen delta y volatilidad, que Barchart no entrega. Sin delta no
          se puede decir cuánto protege de verdad una cobertura: un put muy fuera
          de dinero cubre en el papel y casi nada en la práctica.
        </p>
      </form>
    </Modal>
  );
}

function Dato({ k, v, tono }: { k: string; v: string; tono?: "danger" }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">{k}</dt>
      <dd className={"mt-0.5 font-mono tnum " + (tono === "danger" ? "text-danger" : "text-fg")}>{v}</dd>
    </div>
  );
}
