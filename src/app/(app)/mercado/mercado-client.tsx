"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Layers3,
  Boxes, Coins, ShieldAlert, TrendingUp, AlertTriangle, Landmark, RefreshCw, ImageUp,
  Newspaper, ExternalLink, Scale as Balanza, Factory, ArrowLeftRight, Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { sincronizarAhora, subirTablero } from "./actions";
import { AnalistaMercado } from "./analista";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useT, useFormatos, useIdioma, useLocale } from "@/lib/i18n/provider";
import type { DatosMercado } from "./riesgo-data";

export function MercadoClient({
  datos: d,
  sync,
  foto,
}: {
  datos: DatosMercado;
  sync: { ran_at: string; status: string; error: string | null } | null;
  /** La pantalla en texto, para que el analista hable de lo que se está viendo. */
  foto: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const f = useFormatos();
  const idioma = useIdioma();
  const locale = useLocale();

  const usd = (n: number | null) => (n === null ? "—" : `US$ ${f.numero(n, 2)}`);

  /** Millones de pesos: en pesos crudos la cifra deja de leerse. */
  const cop = (n: number | null) =>
    n === null
      ? "—"
      : Math.abs(n) >= 1_000_000
        ? `$ ${f.numero(n / 1_000_000, 1)} M`
        : f.cop(n);

  const [sincronizando, setSincronizando] = React.useState(false);
  const [analista, setAnalista] = React.useState(false);
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
    // El analista es una columna, no una capa encima: la conversación no
    // sirve de nada si tapa la cifra de la que se está hablando.
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-6">
        <PageHeader
          title={t.mercado.titulo}
          description={t.mercado.descripcion}
          actions={
            <div className="flex gap-2">
              <Button size="sm" variant={analista ? "secondary" : "ghost"} onClick={() => setAnalista((v) => !v)}>
                <Sparkles className="h-4 w-4" />
                {t.mercado.analistaAbrir}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTableroOpen(true)}>
                <ImageUp className="h-4 w-4" />
                {t.mercado.cargarTablero}
              </Button>
              <Button size="sm" variant="secondary" onClick={alSincronizar} loading={sincronizando}>
                <RefreshCw className="h-4 w-4" />
                {t.mercado.sincronizarAhora}
              </Button>
            </div>
          }
        />

        {/* Traer los datos tarda: Barchart navega con Playwright del otro lado.
            Decirlo evita que alguien crea que se colgó y recargue a la mitad. */}
        {sincronizando && (
          <p className="text-xs text-fg-subtle">
            {t.mercado.sincronizando}
          </p>
        )}

        {d.error && (
          <div role="alert" className="flex items-start gap-3 rounded-[var(--radius-md)] border border-danger/40 bg-danger-soft p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-danger">
                {t.mercado.errorPosicion}
              </p>
              <p className="mt-1 font-mono text-xs text-fg-subtle">{d.error}</p>
            </div>
          </div>
        )}

        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t.mercado.enBodega} value={r.toneladasFisicas} decimals={2} suffix=" t" icon={Boxes}
            hint={`${d.totales.lotes_con_saldo} ${t.mercado.lotes} · ${t.mercado.costo} ${f.cop(d.totales.costo_promedio_cop_kg ?? 0)}/kg`} />
          <StatCard label={t.mercado.descubierto} value={r.toneladasDescubiertas} decimals={2} suffix=" t" icon={ShieldAlert}
            hint={r.coberturaPct === 0 ? t.mercado.sinCobertura : `${r.coberturaPct.toFixed(1)}% ${t.mercado.cubierto}`} />
          <StatCard
            label={t.mercado.cacaoHoy}
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
                ? `${usd(d.mercado.precioUsdT)}/t${
                    d.mercado.fuente === "vivo" ? ` · ${t.mercado.enVivo}` : ""
                  }`
                : t.mercado.sinPrecio
            }
          />
          <StatCard label={t.mercado.valorizacion} value={Math.round((r.pnlFisicoCop ?? 0) / 1_000_000)} prefix="$ " suffix=" M" icon={Coins}
            hint={t.mercado.contraCosto} />
        </motion.div>

        {/* La exposición es el número que importa. Si está descubierta, tiene que
            verse como una advertencia, no como una fila más de una tabla. */}
        {descubierto && (
          <div className="rounded-[var(--radius-md)] border border-warn/50 bg-warn-soft p-4">
            <p className="text-sm font-medium text-warn">
              {r.coberturaPct === 0
                ? `${t.mercado.expuestasPrefijo} ${f.numero(r.toneladasFisicas, 2)} ${t.mercado.expuestasSufijo}`
                : `${f.numero(r.toneladasDescubiertas, 2)} ${t.mercado.sinCoberturaDe} ${f.numero(r.toneladasFisicas, 2)} ${t.mercado.sinCoberturaSufijo}`}
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              {t.mercado.nadaProtege}
              {r.pnlFisicoCop !== null && r.pnlFisicoCop > 0 && (
                <>
                  {" "}
                  {t.mercado.hoyValePrefijo} <strong>{cop(r.pnlFisicoCop)}</strong>{" "}
                  {t.mercado.hoyValeSufijo}
                </>
              )}
            </p>
          </div>
        )}

        {r.faltantes.length > 0 && (
          <div className="rounded-[var(--radius-md)] border border-info/40 bg-info-soft p-4">
            <p className="text-sm text-info">
              {t.mercado.calculoIncompleto} {r.faltantes.join(", ")}.{" "}
              {t.mercado.calculoIncompletoNota}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t.mercado.cobertura}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="h-3 w-full overflow-hidden rounded-full bg-bg-muted">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, r.coberturaPct)}%` }} />
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Dato k={t.mercado.putsComprados} v={`${r.contratos.putsLargos} ${t.mercado.contratos}`} />
                <Dato k={t.mercado.callsVendidos} v={`${r.contratos.callsCortos} ${t.mercado.contratos}`} />
                <Dato k={t.mercado.futurosVendidos} v={`${r.contratos.futurosCortos} ${t.mercado.contratos}`} />
                <Dato k={t.mercado.futurosComprados} v={`${r.contratos.futurosLargos} ${t.mercado.contratos}`} />
              </dl>
              {d.cobertura && (
                <div className="rounded-[var(--radius-md)] border border-border p-3 text-sm">
                  <p className="text-fg">
                    {t.mercado.coberturaEfectiva}{" "}
                    <span className="font-mono tnum font-semibold">
                      {f.numero(d.cobertura.efectivaT, 2)} t
                    </span>{" "}
                    {t.comun.de} {f.numero(r.toneladasCubiertas, 2)} {t.mercado.nominales}
                  </p>
                  {/* Contar contratos sobreestima la protección: un put muy fuera
                      de dinero cubre en el papel y casi nada en la práctica. */}
                  <p className="mt-1 text-xs text-fg-subtle">
                    {t.mercado.ponderadaDelta}
                    {d.cobertura.sinDeltaT > 0 && (
                      <>
                        {" "}
                        {f.numero(d.cobertura.sinDeltaT, 2)} {t.mercado.sinDelta}
                      </>
                    )}
                  </p>
                </div>
              )}

              {r.collar ? (
                <p className="rounded-[var(--radius-md)] border border-border p-3 text-sm text-fg-muted">
                  {t.mercado.collarPrefijo}{" "}
                  <span className="font-mono tnum text-fg">{usd(r.collar.piso)}</span>{" "}
                  {t.mercado.collarY}{" "}
                  <span className="font-mono tnum text-fg">{usd(r.collar.techo)}</span>{" "}
                  {t.mercado.collarSufijo}
                </p>
              ) : (
                <p className="text-xs text-fg-subtle">
                  {t.mercado.sinCollar}
                  {!d.cobertura && r.contratos.putsLargos > 0 && (
                    <> {t.mercado.cargaTablero}</>
                  )}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-fg-subtle" /> {t.mercado.cuentaBroker}
                </span>
              </CardTitle>
            </CardHeader>
            <CardBody>
              {!d.broker ? (
                <EmptyState title={t.mercado.sinEstados} />
              ) : (
                <>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Dato k={t.mercado.cuenta} v={d.broker.cuenta ?? "—"} />
                  <Dato k={t.mercado.equity} v={usd(d.broker.equity)} />
                  <Dato k={t.mercado.cajaDisponible} v={usd(d.broker.disponible)} />
                  <Dato k={`${t.mercado.pnlRealizado} (${d.broker.moneda})`} v={usd(d.broker.pnlYtd)} tono={(d.broker.pnlYtd ?? 0) < 0 ? "danger" : undefined} />
                </dl>

                {/* De dónde sale «disponible» y qué NO es. El extracto de StoneX
                    trae cinco cifras de balance y el margen no está entre ellas,
                    así que esto es lo que el bróker declara libre — no un equity
                    menos margen calculado aquí. Decirlo evita comprometer ese
                    dinero creyendo que ya se descontó la garantía. */}
                <p className="mt-3 border-t border-border pt-2 text-xs text-fg-subtle">
                  {d.broker.margenInicial === null
                    ? t.mercado.notaSinMargen
                    : t.mercado.notaConMargen}
                </p>
                </>
              )}
            </CardBody>
          </Card>
        </div>

        {d.escenarios.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t.mercado.siElPrecio}</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                      <th className="pb-2 pr-3 font-medium">{t.mercado.escenario}</th>
                      <th className="pb-2 pr-3 text-right font-medium">
                        {t.mercado.cacaoCopKg}
                      </th>
                      <th className="pb-2 text-right font-medium">
                        {t.mercado.valorizacionInventario}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.escenarios.map((e) => (
                      <tr key={e.variacion} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3 text-fg">
                          {e.variacion === 0
                            ? t.mercado.precioHoy
                            : `${e.variacion > 0 ? "+" : ""}${(e.variacion * 100).toFixed(0)}%`}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono tnum text-fg-muted">{f.cop(e.precioCopKg)}</td>
                        <td className={"py-2 text-right font-mono tnum " + (e.pnlCop < 0 ? "text-danger" : "text-fg")}>{cop(e.pnlCop)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-fg-subtle">
                {t.mercado.soloFisica}
              </p>
            </CardBody>
          </Card>
        )}

        <CadenaOpciones
          cadena={d.cadena}
          contrato={d.cadena.elegido}
          onContrato={(c) => router.push(`/mercado?contrato=${encodeURIComponent(c)}`)}
        />

        {/* Futuros y arbitraje. Van antes de los ratios porque son la base
            contra la que se miden: sin saber en cuánto está el contrato, un
            ratio de 1,74 no dice nada. */}
        {d.ratios.futuros.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <ArrowLeftRight className="h-4 w-4 text-fg-subtle" />{" "}
                  {t.mercado.futurosArbitraje}
                </span>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {d.ratios.futuros.map((fut) => {
                  const cambio =
                    fut.valor_anterior === null ? null : fut.valor - fut.valor_anterior;
                  const simbolo =
                    fut.moneda === "GBP" ? "£" : fut.moneda === "EUR" ? "€" : "$";
                  return (
                    <div key={fut.contrato} className="rounded-[var(--radius-md)] border border-border p-3">
                      <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">
                        {fut.contrato === "ARBITRAGE"
                          ? t.mercado.arbitrajeNyLondres
                          : fut.contrato}
                      </dt>
                      <dd className="mt-0.5 font-mono tnum text-lg text-fg">
                        {fut.valor < 0 ? "−" : ""}
                        {simbolo}
                        {f.numero(Math.abs(fut.valor))}
                      </dd>
                      {cambio !== null && cambio !== 0 && (
                        <p
                          className={
                            "mt-0.5 font-mono tnum text-xs " +
                            (cambio > 0 ? "text-success" : "text-danger")
                          }
                        >
                          {cambio > 0 ? "+" : "−"}
                          {simbolo}
                          {f.numero(Math.abs(cambio))} {t.mercado.enLaSemana}
                        </p>
                      )}
                    </div>
                  );
                })}
              </dl>
              <p className="mt-3 text-xs text-fg-subtle">
                {t.mercado.reporteDel}{" "}
                {d.ratios.fecha ? f.fecha(d.ratios.fecha) : "—"}. {t.mercado.arbitrajeNota}
              </p>
            </CardBody>
          </Card>
        )}

        {/* ── Ratios de producto ─────────────────────────────────────────── */}
        {d.ratios.filas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Factory className="h-4 w-4 text-fg-subtle" /> {t.mercado.ratiosProducto}
                </span>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <p className="mb-3 text-xs text-fg-subtle">
                {t.mercado.ratiosNota}
              </p>
              <div className="space-y-4">
                {["Liquor", "Butter", "Powder", "Combined"].map((cat) => {
                  const filas = d.ratios.filas.filter((f) => f.categoria === cat);
                  if (filas.length === 0) return null;
                  return (
                    <div key={cat}>
                      <h4 className="mb-1.5 text-[11px] uppercase tracking-wide text-fg-subtle">
                        {cat === "Liquor"
                          ? t.mercado.licor
                          : cat === "Butter"
                            ? t.mercado.manteca
                            : cat === "Powder"
                              ? t.mercado.polvo
                              : t.mercado.combinado}
                      </h4>
                      <ul className="space-y-1">
                        {filas.map((fila) => {
                          const cambio =
                            fila.ratio_anterior === null
                              ? null
                              : Math.round((fila.ratio - fila.ratio_anterior) * 100) / 100;
                          return (
                            <li
                              key={`${fila.producto}-${fila.incoterm ?? ""}`}
                              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-1 text-sm last:border-0"
                            >
                              <span className="min-w-0 text-fg">
                                {fila.producto}
                                {fila.mercado && (
                                  <span className="ml-1.5 text-xs text-fg-subtle">
                                    {fila.mercado}
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 font-mono tnum text-fg-muted">
                                {fila.ratio.toFixed(2)}
                                {cambio !== null && cambio !== 0 && (
                                  <span className={cambio > 0 ? "text-success" : "text-danger"}>
                                    {" "}
                                    {cambio > 0 ? "+" : ""}
                                    {cambio.toFixed(2)}
                                  </span>
                                )}
                                {fila.precio_usd && (
                                  <span className="ml-2 text-fg-subtle">
                                    US$ {f.numero(fila.precio_usd)}
                                  </span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        )}

        {d.diferenciales.filas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Balanza className="h-4 w-4 text-fg-subtle" />{" "}
                  {t.mercado.diferencialesOrigen}
                </span>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                      <th className="pb-2 pr-3 font-medium">{t.mercado.origen}</th>
                      <th className="pb-2 pr-3 text-right font-medium">
                        {t.mercado.sobreIce}
                      </th>
                      <th className="pb-2 font-medium">{t.mercado.fuente}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.diferenciales.filas.map((fila) => {
                      const esEstimacion = fila.fuente !== "stonex";
                      return (
                        <tr
                          key={`${fila.origen}-${fila.grado ?? ""}-${fila.fuente}`}
                          className={
                            "border-b border-border/60 last:border-0 " +
                            (esEstimacion ? "bg-warn-soft/40" : "")
                          }
                        >
                          <td className="py-2 pr-3 text-fg">
                            {fila.origen}
                            {fila.grado && (
                              <span className="text-fg-subtle"> · {fila.grado}</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono tnum text-fg">
                            {fila.valor > 0 ? "+" : ""}
                            {f.numero(fila.valor)} {fila.unidad}
                          </td>
                          <td className="py-2 text-xs">
                            {esEstimacion ? (
                              /* Una fila que pusimos nosotros no puede verse igual
                                 que una cotización: alguien la citaría en una
                                 negociación como si fuera precio de mercado. */
                              <Badge tone="warn">{t.mercado.estimacionAroco}</Badge>
                            ) : (
                              <span className="text-fg-subtle">StoneX</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {d.diferenciales.filas.find((f) => f.metodo) && (
                <p className="mt-3 text-xs text-fg-subtle">
                  {d.diferenciales.filas.find((f) => f.metodo)!.metodo}
                </p>
              )}
              <p className="mt-1 text-xs text-fg-subtle">
                {t.mercado.reporteDel}{" "}
                {d.diferenciales.fecha ? f.fecha(d.diferenciales.fecha) : "—"}.
              </p>
            </CardBody>
          </Card>
        )}

        {d.intel.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Newspaper className="h-4 w-4 text-fg-subtle" />{" "}
                  {t.mercado.queEstaPasando}
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
                        {f.fecha(a.published_at)}
                      </span>
                    </div>
                    {/* El resumen en español es lo que se lee; el original en
                        inglés queda a un clic para quien quiera la fuente. */}
                    <p className="mt-1 text-sm text-fg-muted">
                      {/* En inglés se prefiere el original de StoneX: el resumen
                          traducido al español no le sirve a quien lee en inglés. */}
                      {(idioma === "en"
                        ? (a.abstract ?? a.resumen)
                        : (a.resumen ?? a.abstract)) ?? t.mercado.sinResumen}
                    </p>
                    {a.url && (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        {t.mercado.leerEnStoneX} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t.mercado.lotesEnBodega}</CardTitle>
          </CardHeader>
          <CardBody>
            {d.lotes.length === 0 ? (
              <EmptyState title={t.mercado.sinCacao} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                      <th className="pb-2 pr-3 font-medium">{t.mercado.lote}</th>
                      <th className="pb-2 pr-3 font-medium">{t.mercado.ingreso}</th>
                      <th className="pb-2 pr-3 text-right font-medium">
                        {t.mercado.disponible}
                      </th>
                      <th className="pb-2 pr-3 text-right font-medium">
                        {t.mercado.costoKg}
                      </th>
                      <th className="pb-2 text-right font-medium">{t.mercado.valor}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.lotes.map((l) => (
                      <tr key={l.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3">
                          <span className="text-fg">{l.code}</span>
                          {l.calidad && <Badge tone="neutral" className="ml-2">{l.calidad}</Badge>}
                        </td>
                        <td className="py-2 pr-3 font-mono tnum text-xs text-fg-muted">{l.fecha ? f.fecha(l.fecha) : "—"}</td>
                        <td className="py-2 pr-3 text-right font-mono tnum text-fg">{f.kg(l.kg_disponible)}</td>
                        <td className="py-2 pr-3 text-right font-mono tnum text-fg-muted">{l.precio_compra_cop_kg ? f.cop(l.precio_compra_cop_kg) : "—"}</td>
                        <td className="py-2 text-right font-mono tnum text-fg-muted">{l.valor_cop ? f.cop(l.valor_cop) : "—"}</td>
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
          {t.mercado.inventarioAlDia}{" "}
          {d.mercado.momento
            ? new Date(d.mercado.momento).toLocaleString(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : d.mercado.fecha
              ? f.fecha(d.mercado.fecha)
              : t.mercado.sinDato}{" "}
          (ICE NY) · TRM{" "}
          {d.trm.fecha
            ? `${f.fecha(d.trm.fecha)} $ ${f.numero(d.trm.valor ?? 0, 2)}`
            : t.mercado.sinDato}{" "}
          · broker {d.broker?.fecha ? f.fecha(d.broker.fecha) : t.mercado.sinEstado}
          {/* De dónde salió el precio. Un valor de hace días presentado igual que
              uno en vivo es lo que hace valorar el inventario con un precio que
              ya no existe. */}
          {d.mercado.fuente === "guardado" && (
            <span className="text-warn">{t.mercado.precioGuardado}</span>
          )}
          {d.mercado.fuente === "paridad" && (
            <span className="text-warn">{t.mercado.precioParidad}</span>
          )}
          {sync && (
            <>
              {" · "}
              {t.mercado.ultimaSync} {f.fecha(sync.ran_at)}
              {sync.status !== "ok" && (
                <span className="text-danger"> {t.mercado.fallo}</span>
              )}
            </>
          )}
        </p>
      </div>

      {analista && (
        <aside
          aria-label={t.mercado.analistaTitulo}
          className="order-first w-full lg:sticky lg:top-0 lg:order-none lg:w-[24rem] lg:shrink-0 xl:w-[27rem]"
        >
          <AnalistaMercado foto={foto} onCerrar={() => setAnalista(false)} />
        </aside>
      )}
    </div>
  );
}


/**
 * La cadena del vencimiento elegido, con la posición propia encima.
 *
 * Es lo que faltaba para decidir una cobertura sin salir del CRM: la cadena ya
 * se bajaba y se guardaba desde hace semanas, pero no se enseñaba en ninguna
 * pantalla. Ver los strikes es la mitad; la otra mitad es ver CUÁLES son tuyos,
 * porque de ahí sale si conviene ampliar, rodar o dejar como está.
 *
 * Por defecto se muestran los strikes cercanos al precio. Una cadena completa
 * son ~200 filas y las de los extremos no cotizan: enseñarlas todas de entrada
 * esconde las diez que importan.
 */
function CadenaOpciones({
  cadena,
  contrato,
  onContrato,
}: {
  cadena: DatosMercado["cadena"];
  contrato: string | null;
  onContrato: (c: string) => void;
}) {
  const t = useT();
  const f = useFormatos();
  const [todos, setTodos] = React.useState(false);

  const sub = cadena.subyacente;
  // ±25 % alrededor del subyacente. Fuera de ahí las primas son ruido.
  const cerca =
    sub === null
      ? cadena.filas
      : cadena.filas.filter((r) => r.strike >= sub * 0.75 && r.strike <= sub * 1.25);
  const filas = todos ? cadena.filas : cerca;
  const ocultas = cadena.filas.length - filas.length;

  // El tablero más nuevo que hay de cualquier vencimiento marca «hoy».
  const masReciente = cadena.vencimientos.reduce<string | null>(
    (a, v) => (a === null || v.date > a ? v.date : a),
    null,
  );
  const desactualizada = cadena.fecha !== null && cadena.fecha !== masReciente;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-fg-subtle" /> {t.mercado.cadenaTitulo}
          </span>
        </CardTitle>
        {cadena.vencimientos.length > 0 && (
          <div className="flex items-center gap-2">
            {sub !== null && (
              <span className="font-mono tnum text-xs text-fg-subtle">
                {t.mercado.subyacente} {f.numero(sub)}
              </span>
            )}
            <Select
              value={contrato ?? ""}
              onChange={(e) => onContrato(e.target.value)}
              className="h-8 w-auto py-0 text-xs"
            >
              {cadena.vencimientos.map((v) => (
                <option key={v.id} value={v.contract_month}>
                  {v.contract_month} · {f.fecha(v.date)}
                </option>
              ))}
            </Select>
          </div>
        )}
      </CardHeader>
      <CardBody>
        {filas.length === 0 ? (
          <EmptyState title={t.mercado.cadenaVacia} />
        ) : (
          <>
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                    <th className="pb-2 pr-3 text-right font-medium">
                      {t.mercado.callPrima}
                    </th>
                    <th className="pb-2 pr-3 text-right font-medium">
                      {t.mercado.delta}
                    </th>
                    <th className="pb-2 px-3 text-center font-medium">
                      {t.mercado.strike}
                    </th>
                    <th className="pb-2 pl-3 text-right font-medium">
                      {t.mercado.delta}
                    </th>
                    <th className="pb-2 pl-3 text-right font-medium">
                      {t.mercado.putPrima}
                    </th>
                    <th className="pb-2 pl-3 text-right font-medium">
                      {t.mercado.tuya}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((r) => {
                    const mio = r.propioCall !== 0 || r.propioPut !== 0;
                    // La fila más cercana al subyacente marca dónde está el
                    // dinero hoy; sin ella hay que ir contando strikes.
                    const atm =
                      sub !== null &&
                      Math.abs(r.strike - sub) ===
                        Math.min(...filas.map((x) => Math.abs(x.strike - sub)));
                    return (
                      <tr
                        key={r.strike}
                        className={cn(
                          "border-b border-border/60 last:border-0",
                          mio && "bg-accent-soft/40",
                          atm && !mio && "bg-bg-subtle/60",
                        )}
                      >
                        <td className="py-1.5 pr-3 text-right font-mono tnum text-fg">
                          {r.call_premium === null ? "—" : f.numero(r.call_premium, 2)}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono tnum text-fg-subtle">
                          {r.call_delta === null ? "—" : r.call_delta.toFixed(2)}
                        </td>
                        <td
                          className={cn(
                            "py-1.5 px-3 text-center font-mono tnum",
                            atm ? "font-semibold text-accent-soft-fg" : "text-fg-muted",
                          )}
                        >
                          {f.numero(r.strike)}
                        </td>
                        <td className="py-1.5 pl-3 text-right font-mono tnum text-fg-subtle">
                          {r.put_delta === null ? "—" : r.put_delta.toFixed(2)}
                        </td>
                        <td className="py-1.5 pl-3 text-right font-mono tnum text-fg">
                          {r.put_premium === null ? "—" : f.numero(r.put_premium, 2)}
                        </td>
                        <td className="py-1.5 pl-3 text-right font-mono tnum text-xs">
                          {mio ? (
                            <span className="text-accent-soft-fg">
                              {r.propioCall !== 0 &&
                                `${r.propioCall > 0 ? "+" : ""}${r.propioCall}C`}
                              {r.propioCall !== 0 && r.propioPut !== 0 && " "}
                              {r.propioPut !== 0 &&
                                `${r.propioPut > 0 ? "+" : ""}${r.propioPut}P`}
                            </span>
                          ) : (
                            <span className="text-fg-subtle">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {desactualizada && (
              /* Un vencimiento que falla en el sync no cancela a los otros, así
                 que este tablero puede ser de otro día que el resto de la
                 pantalla. Decirlo: una prima de anteayer sirve para orientarse,
                 pero no para cerrar. */
              <p className="mt-2 text-xs text-warn">
                {t.mercado.cadenaVieja} {f.fecha(cadena.fecha)}.
              </p>
            )}

            <div className="mt-3 flex items-baseline justify-between gap-3">
              <p className="text-xs text-fg-subtle">{t.mercado.cadenaNota}</p>
              {(ocultas > 0 || todos) && (
                <button
                  type="button"
                  onClick={() => setTodos((v) => !v)}
                  className="shrink-0 text-xs text-accent hover:underline"
                >
                  {todos ? t.mercado.verCerca : `${t.mercado.verTodos} (${ocultas})`}
                </button>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
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
  const t = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.mercado.modalTitulo}
      description={t.mercado.modalDescripcion}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t.comun.cancelar}
          </Button>
          <Button type="submit" form="form-tablero" size="sm" loading={leyendo}>
            {t.mercado.leerTablero}
          </Button>
        </>
      }
    >
      <form id="form-tablero" onSubmit={onSubmit} className="space-y-4">
        <Field label={t.mercado.capturaTablero}>
          <Input type="file" name="imagen" accept="image/png,image/jpeg,image/webp" required />
        </Field>
        <Field label={t.mercado.fechaTablero} hint={t.mercado.fechaTableroHint}>
          <Input type="date" name="fecha" defaultValue={new Date().toISOString().slice(0, 10)} />
        </Field>
        <p className="text-xs text-fg-subtle">
          {t.mercado.modalNota}
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
