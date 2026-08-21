"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Plus, Search, ShoppingCart, Clock, CheckCircle2, X, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { staggerContainer } from "@/lib/motion";
import { formatDate } from "@/lib/utils";
import { DEPARTMENTS } from "@/lib/departments";
import { COMPRA_ESTADOS, COMPRA_CATEGORIAS } from "@/lib/schemas/compra";
import type { SolicitudConCotizaciones } from "./page";
import { SolicitudDetail, ESTADO_TONE, formatMonto } from "./solicitud-detail";
import { crearSolicitud } from "./actions";

interface FormValues {
  titulo: string;
  descripcion: string;
  categoria: string;
  area: string;
  justificacion: string;
}

/**
 * Lo que se muestra como monto de la solicitud: si ya se aprobó, el de la
 * cotización elegida; si no, el de la más económica, que es la referencia
 * mientras se decide.
 */
function montoReferencia(s: SolicitudConCotizaciones) {
  const elegida = s.compra_cotizaciones.find((c) => c.id === s.cotizacion_elegida_id);
  return elegida ?? s.compra_cotizaciones[0] ?? null;
}

export function ComprasClient({
  solicitudes,
  error,
  puedeAprobar,
  userId,
}: {
  solicitudes: SolicitudConCotizaciones[];
  /** Falla de la consulta. Sin esto, una lista rota se ve como una lista vacía. */
  error?: string | null;
  /** Álvaro, Nicolás y Luis Ernesto. */
  puedeAprobar: boolean;
  userId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = React.useState("");
  const [fEstado, setFEstado] = React.useState<string[]>([]);
  const [fCategoria, setFCategoria] = React.useState<string[]>([]);
  const [fArea, setFArea] = React.useState<string[]>([]);
  const [abierta, setAbierta] = React.useState<SolicitudConCotizaciones | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);

  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: {
      titulo: "",
      descripcion: "",
      categoria: "Otro",
      area: "",
      justificacion: "",
    },
  });

  // Mantiene abierto el panel con los datos frescos tras cada acción.
  const viva = abierta ? (solicitudes.find((s) => s.id === abierta.id) ?? null) : null;

  const filtradas = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return solicitudes.filter((s) => {
      if (fEstado.length && !fEstado.includes(s.estado)) return false;
      if (fCategoria.length && !fCategoria.includes(s.categoria)) return false;
      if (fArea.length && (!s.area || !fArea.includes(s.area))) return false;
      if (!q) return true;
      const hay = `${s.consecutivo} ${s.titulo} ${s.descripcion ?? ""} ${s.autor ?? ""} ${s.compra_cotizaciones
        .map((c) => c.proveedor)
        .join(" ")}`;
      return hay.toLowerCase().includes(q);
    });
  }, [solicitudes, query, fEstado, fCategoria, fArea]);

  const pendientes = solicitudes.filter((s) => s.estado === "Pendiente").length;
  const aprobadas = solicitudes.filter((s) => s.estado === "Aprobada").length;
  const sinRecibir = solicitudes.filter(
    (s) => s.estado === "Aprobada" && !s.recibida_en,
  ).length;
  const hayFiltros =
    !!query || fEstado.length > 0 || fCategoria.length > 0 || fArea.length > 0;

  const onSubmit = handleSubmit(async (values) => {
    const res = await crearSolicitud(values);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo crear", description: res.error });
      return;
    }
    toast({
      tone: "success",
      title: "Solicitud creada",
      description: "Añádele las cotizaciones y mándala a aprobación.",
    });
    setFormOpen(false);
    reset();
    router.refresh();
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compras"
        description={`Cotizaciones de insumos y su aprobación · ${solicitudes.length} solicitudes${
          hayFiltros ? ` · ${filtradas.length} filtradas` : ""
        }`}
        actions={
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            Nueva solicitud
          </Button>
        }
      />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-[var(--radius-md)] border border-danger/40 bg-danger-soft p-4"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-danger">
              No se pudieron cargar las solicitudes
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              La lista de abajo está incompleta o vacía por una falla al consultar, no
              porque no haya solicitudes. Lo que hayas guardado sigue ahí.
            </p>
            <p className="mt-1 font-mono text-xs text-fg-subtle">{error}</p>
          </div>
        </div>
      )}

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <StatCard label="Esperando aprobación" value={pendientes} icon={Clock} />
        <StatCard label="Aprobadas" value={aprobadas} icon={CheckCircle2} />
        <StatCard label="Aprobadas sin recibir" value={sinRecibir} icon={ShoppingCart} />
      </motion.div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título, proveedor…"
            className="pl-9"
          />
        </div>
        <MultiSelect
          label="Estado"
          options={COMPRA_ESTADOS.map((e) => ({ value: e, label: e }))}
          selected={fEstado}
          onChange={setFEstado}
          className="w-auto"
        />
        <MultiSelect
          label="Categoría"
          options={COMPRA_CATEGORIAS.map((c) => ({ value: c, label: c }))}
          selected={fCategoria}
          onChange={setFCategoria}
          className="w-auto"
        />
        <MultiSelect
          label="Área"
          options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
          selected={fArea}
          onChange={setFArea}
          className="w-auto"
        />
        {hayFiltros && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setFEstado([]);
              setFCategoria([]);
              setFArea([]);
            }}
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </Button>
        )}
      </div>

      {filtradas.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-6 w-6" />}
          title={hayFiltros ? "Sin resultados" : "Sin solicitudes"}
          description={
            hayFiltros
              ? undefined
              : "Crea una solicitud, súbele las cotizaciones que consigas y mándala a aprobación."
          }
          action={
            !hayFiltros && (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" />
                Nueva solicitud
              </Button>
            )
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtradas.map((s) => {
            const ref = montoReferencia(s);
            return (
              <li key={s.id}>
                <button
                  onClick={() => setAbierta(s)}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3 text-left shadow-[var(--shadow-soft-sm)] transition-colors hover:border-border-strong"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium text-fg">
                      <span className="font-mono text-xs text-fg-subtle">
                        {s.consecutivo}
                      </span>
                      {s.titulo}
                    </p>
                    <p className="truncate text-xs text-fg-muted">
                      {s.categoria}
                      {s.area ? ` · ${s.area}` : ""}
                      {s.autor ? ` · ${s.autor}` : ""}
                      {` · ${formatDate(s.created_at)}`}
                      {` · ${s.compra_cotizaciones.length} cotización${
                        s.compra_cotizaciones.length === 1 ? "" : "es"
                      }`}
                    </p>
                  </div>
                  {s.estado === "Aprobada" && !s.recibida_en && (
                    <Badge tone="info">por recibir</Badge>
                  )}
                  {ref && (
                    <span className="shrink-0 font-mono text-sm tnum text-fg-muted">
                      {formatMonto(Number(ref.monto), ref.moneda)}
                    </span>
                  )}
                  <Badge tone={ESTADO_TONE[s.estado]} dot>
                    {s.estado}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <SolicitudDetail
        key={viva?.id ?? "ninguna"}
        solicitud={viva}
        open={viva !== null}
        onClose={() => setAbierta(null)}
        puedeAprobar={puedeAprobar}
        userId={userId}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="lg"
        title="Nueva solicitud de compra"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={onSubmit} loading={formState.isSubmitting}>
              Crear
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="¿Qué se necesita? *" className="sm:col-span-2">
            <Input
              {...register("titulo", { required: true })}
              placeholder="p. ej. Fertilizante para el cultivo"
            />
          </Field>
          <Field label="Categoría">
            <Select {...register("categoria")}>
              {COMPRA_CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Área" hint="A qué área se carga el gasto.">
            <Select {...register("area")} defaultValue="">
              <option value="">Sin asignar</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Detalle" className="sm:col-span-2">
            <Textarea {...register("descripcion")} rows={2} placeholder="Cantidad, referencia, especificaciones…" />
          </Field>
          <Field label="Justificación" className="sm:col-span-2" hint="Ayuda a quien aprueba a decidir sin preguntar.">
            <Textarea {...register("justificacion")} rows={2} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
