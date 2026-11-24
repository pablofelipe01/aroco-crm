"use client";

import * as React from "react";
import Link from "next/link";
import {
  CloudOff,
  Cloud,
  UploadCloud,
  Check,
  AlertTriangle,
  Pencil,
  Trash2,
  Download,
  ArrowLeft,
  ClipboardList,
  Droplets,
  Fuel,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  armarRegistros,
  borradorVacio,
  fechaColombia,
  horasEntre,
  medidaDe,
  sinErrores,
  validar,
  type Borrador,
  type CatalogoCaptura,
  type Categoria,
  type Errores,
  type RegistroCampo,
} from "@/lib/finca/captura";
import {
  agregar,
  leer,
  quitar,
  subir,
  tipoDe,
  type ItemCola,
  type ItemEnviado,
  type TipoCola,
} from "@/lib/finca/cola";
import type { CatalogoCampo, CompraCampo, UsoCampo } from "@/lib/finca/captura-equipos";
import { Chip, Numero } from "./piezas";
import { FormCompra, FormUso } from "./formularios";

const CATEGORIAS: Record<Categoria, string> = {
  cosecha: "Cosecha",
  poscosecha: "Poscosecha",
  cultivo: "Cultivo",
  riego: "Riego",
  sanidad: "Sanidad",
  mantenimiento: "Mantenimiento",
  administracion: "Administración",
  ausencia: "Ausencias",
};

const SITIOS = ["Quinta", "Vivero", "Lago", "Invernadero", "Oficina"];
const CADA_MS = 60_000;

type Estado =
  | { tipo: "quieto" }
  | { tipo: "subiendo" }
  | { tipo: "sin-sesion" }
  | { tipo: "error"; mensaje: string };

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export function CampoClient({
  catalogo,
  usuario,
  nombre,
}: {
  catalogo: CatalogoCampo;
  usuario: string;
  nombre: string;
}) {
  // Labores, riego y equipos, o compras de combustible (estas solo Dirección
  // y Finca: es plata).
  const [modo, setModo] = React.useState<TipoCola>("labor");
  // Uso o compra de la cola que se está corrigiendo (las labores usan
  // `corrigiendo`, que puede ser una cuadrilla entera).
  const [editando, setEditando] = React.useState<
    { tipo: "uso"; item: UsoCampo; grupo: string } | { tipo: "compra"; item: CompraCampo; grupo: string } | null
  >(null);
  const { toast } = useToast();
  const supabase = React.useMemo(() => createClient(), []);
  const hoy = () => fechaColombia(new Date());

  const [b, setB] = React.useState<Borrador>(() => borradorVacio(hoy(), catalogo.yo));
  const [errores, setErrores] = React.useState<Errores>({});
  const [cola, setCola] = React.useState<ItemCola[]>([]);
  const [enviados, setEnviados] = React.useState<ItemEnviado[]>([]);
  const enLinea = React.useSyncExternalStore(suscribirRed, () => navigator.onLine, () => true);
  const [estado, setEstado] = React.useState<Estado>({ tipo: "quieto" });
  const [corrigiendo, setCorrigiendo] = React.useState<string | null>(null);
  const [listo, setListo] = React.useState(false);
  const subiendo = React.useRef(false);

  const nombreDe = React.useMemo(
    () => new Map(catalogo.empleados.map((e) => [e.id, e.nombre])),
    [catalogo.empleados],
  );
  const laborDe = React.useMemo(
    () => new Map(catalogo.labores.map((l) => [l.id, l])),
    [catalogo.labores],
  );
  const equipoDe = React.useMemo(
    () => new Map((catalogo.equipos ?? []).map((q) => [q.id, q.nombre])),
    [catalogo.equipos],
  );
  const labor = laborDe.get(b.laborId);
  const medida = labor ? medidaDe(labor) : null;

  const refrescar = React.useCallback(async () => {
    const r = await leer();
    setCola(r.cola);
    setEnviados(r.enviados.filter((x) => x.usuario === usuario));
    setListo(true);
  }, [usuario]);

  const intentarSubir = React.useCallback(
    async (manual = false) => {
      if (subiendo.current) return;
      if (!navigator.onLine) {
        if (manual) toast({ tone: "warn", title: "Sin señal", description: "Se sube solo al volver a la oficina." });
        return;
      }
      subiendo.current = true;
      setEstado({ tipo: "subiendo" });
      try {
        const r = await subir((fn, args) => supabase.rpc(fn, args as never), usuario);
        if (r.tipo === "ok") {
          setEstado({ tipo: "quieto" });
          if (r.subidos)
            toast({ tone: "success", title: `${r.subidos} ${r.subidos === 1 ? "registro subido" : "registros subidos"}` });
          if (r.rechazados)
            toast({
              tone: "error",
              title: `${r.rechazados} sin subir`,
              description: "Revise el motivo en «Por subir» y corríjalos.",
            });
        } else if (r.tipo === "sin-sesion") setEstado({ tipo: "sin-sesion" });
        else if (r.tipo === "error") setEstado({ tipo: "error", mensaje: r.mensaje });
        else {
          setEstado({ tipo: "quieto" });
          if (manual && r.tipo === "nada") toast({ tone: "info", title: "No hay nada por subir" });
          if (manual && r.tipo === "sin-red")
            toast({ tone: "warn", title: "Sin señal", description: "Se sube solo al volver a la oficina." });
        }
      } finally {
        subiendo.current = false;
        await refrescar();
      }
    },
    [refrescar, supabase, toast, usuario],
  );

  // Arranque: cola del teléfono, service worker, almacenamiento persistente y
  // subida automática al tener señal.
  React.useEffect(() => {
    const t0 = window.setTimeout(() => void refrescar().then(() => intentarSubir()), 0);

    const on = () => {
      void intentarSubir();
    };
    window.addEventListener("online", on);
    const visible = () => {
      if (document.visibilityState === "visible") void intentarSubir();
    };
    document.addEventListener("visibilitychange", visible);
    const t = window.setInterval(() => void intentarSubir(), CADA_MS);

    // Que el navegador no borre la cola cuando le falte espacio.
    void navigator.storage?.persist?.();

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker
        .register("/sw-campo.js", { scope: "/campo", updateViaCache: "none" })
        .then(async () => {
          const reg = await navigator.serviceWorker.ready;
          // Espera a que la página termine de pedir sus archivos y se los pasa
          // al worker: la primera visita ocurre antes de que él la controle.
          window.setTimeout(() => {
            if (!navigator.onLine) return;
            const urls = performance
              .getEntriesByType("resource")
              .map((e) => e.name)
              .filter((u) => u.includes("/_next/static/"));
            reg.active?.postMessage({ tipo: "guardar-archivos", urls, podar: true });
          }, 4000);
        })
        .catch(() => {
          /* sin service worker la pantalla sirve igual mientras haya señal */
        });
    }

    return () => {
      window.removeEventListener("online", on);
        document.removeEventListener("visibilitychange", visible);
      window.clearInterval(t);
      window.clearTimeout(t0);
    };
  }, [intentarSubir, refrescar]);

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => {
    setB((x) => ({ ...x, [k]: v }));
    setErrores((e) => {
      if (!e[k]) return e;
      const n = { ...e };
      delete n[k];
      return n;
    });
  };

  const alternar = (k: "empleados" | "valvulas", v: string) =>
    set(k, b[k].includes(v) ? b[k].filter((x) => x !== v) : [...b[k], v]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const errs = validar(b, catalogo, hoy());
    setErrores(errs);
    if (!sinErrores(errs)) {
      toast({ tone: "error", title: "Revise los campos marcados" });
      return;
    }
    const previos = corrigiendo
      ? cola.filter((x): x is Extract<ItemCola, { empleado_id: string }> & { labor_id: string } => x.grupo === corrigiendo && tipoDe(x) === "labor")
      : [];
    const idPrevio = new Map(previos.map((x) => [x.empleado_id, x.id]));
    const filas = armarRegistros(b, catalogo, new Date(), (emp) => idPrevio.get(emp) ?? crypto.randomUUID());
    const grupo = corrigiendo ?? crypto.randomUUID();
    const quedan = new Set(filas.map((f) => f.id));
    await quitar(previos.filter((x) => !quedan.has(x.id)).map((x) => x.id));
    await agregar(filas.map((f) => ({ ...f, tipo: "labor" as const, usuario, estado: "pendiente" as const, grupo })));

    toast({
      tone: "success",
      title: corrigiendo ? "Corregido" : "Guardado en el teléfono",
      description: navigator.onLine ? "Subiendo…" : "Se sube solo al volver a la oficina.",
    });
    // Quedan la fecha, las personas y la labor: lo normal es anotar varias
    // válvulas o tramos seguidos de la misma labor.
    setB((x) => ({
      ...borradorVacio(x.fecha, catalogo.yo),
      fecha: x.fecha,
      empleados: x.empleados,
      laborId: corrigiendo ? "" : x.laborId,
    }));
    setCorrigiendo(null);
    await refrescar();
    void intentarSubir();
  }

  /** Guarda un uso o una compra (nuevo o corregido) en la cola y sube. */
  async function guardarOtro(tipo: "uso" | "compra", dato: UsoCampo | CompraCampo) {
    const grupo = editando?.grupo ?? crypto.randomUUID();
    await agregar([{ ...dato, tipo, usuario, estado: "pendiente", grupo } as ItemCola]);
    toast({
      tone: "success",
      title: editando ? "Corregido" : "Guardado en el teléfono",
      description: navigator.onLine ? "Subiendo…" : "Se sube solo al volver a la oficina.",
    });
    setEditando(null);
    await refrescar();
    void intentarSubir();
  }

  function corregir(grupo: string) {
    const todos = cola.filter((x) => x.grupo === grupo);
    const primero = todos[0];
    if (!primero) return;
    const tipo = tipoDe(primero);
    if (tipo !== "labor") {
      const { usuario: _u, estado: _e, motivo: _m, grupo: _g, tipo: _t, ...dato } = primero as ItemCola & { tipo: string };
      void _u;
      void _e;
      void _m;
      void _g;
      void _t;
      setEditando(
        tipo === "uso"
          ? { tipo, item: dato as unknown as UsoCampo, grupo }
          : { tipo, item: dato as unknown as CompraCampo, grupo },
      );
      setCorrigiendo(null);
      setModo(tipo);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setEditando(null);
    setModo("labor");
    const items = todos as unknown as RegistroCampo[];
    const f = items[0];
    const s = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
    setB({
      fecha: f.fecha,
      empleados: items.map((x) => x.empleado_id),
      laborId: f.labor_id,
      valvulas: f.valvulas,
      sitio: f.sitio ?? "",
      horaInicio: f.hora_inicio ?? "",
      horaFin: f.hora_fin ?? "",
      horas: f.hora_inicio ? "" : s(f.horas),
      cantidad: medidaDe(laborDe.get(f.labor_id) ?? { nombre: "", unidad: null }) === "cantidad" ? s(f.cantidad) : "",
      sanas: s(f.sanas),
      pasador: s(f.pasador_monilia),
      negras: s(f.negras),
      observaciones: f.observaciones ?? "",
    });
    setErrores({});
    setCorrigiendo(grupo);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function borrar(grupo: string) {
    await quitar(cola.filter((x) => x.grupo === grupo).map((x) => x.id));
    if (corrigiendo === grupo) setCorrigiendo(null);
    if (editando?.grupo === grupo) setEditando(null);
    await refrescar();
  }

  const mios = cola.filter((x) => x.usuario === usuario);
  const ajenos = cola.length - mios.length;
  const pendientes = mios.filter((x) => x.estado === "pendiente").length;
  const rechazados = mios.filter((x) => x.estado === "rechazado").length;
  const horasCalc = horasEntre(b.horaInicio, b.horaFin);

  const porCategoria = React.useMemo(() => {
    const m = new Map<Categoria, CatalogoCaptura["labores"]>();
    for (const l of catalogo.labores) {
      const arr = m.get(l.categoria) ?? [];
      arr.push(l);
      m.set(l.categoria, arr);
    }
    return (Object.keys(CATEGORIAS) as Categoria[])
      .filter((c) => m.has(c))
      .map((c) => [c, m.get(c)!] as const);
  }, [catalogo.labores]);

  return (
    <div className="min-h-dvh bg-bg pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <Link href="/elegir" aria-label="Volver al CRM" className="text-fg-muted hover:text-fg">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-fg">Labores Finca</h1>
            <p className="truncate text-xs text-fg-muted">{nombre}</p>
          </div>
          <Badge tone={enLinea ? "success" : "warn"} className="gap-1">
            {enLinea ? <Cloud className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
            {enLinea ? "Con señal" : "Sin señal"}
          </Badge>
        </div>
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 pb-3 text-sm">
          <span className="tnum flex-1 text-fg-muted">
            {!listo
              ? "Leyendo el teléfono…"
              : pendientes + rechazados === 0
                ? "Todo subido"
                : `${pendientes} por subir${rechazados ? ` · ${rechazados} con error` : ""}`}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void intentarSubir(true)}
            loading={estado.tipo === "subiendo"}
            disabled={pendientes === 0}
          >
            <UploadCloud className="h-4 w-4" />
            Subir ahora
          </Button>
        </div>
        {estado.tipo === "sin-sesion" && (
          <p className="mx-auto max-w-xl px-4 pb-3 text-sm text-danger">
            La sesión venció. Lo anotado sigue guardado en el teléfono:{" "}
            <a href="/login?redirectedFrom=/campo" className="underline">
              vuelva a entrar
            </a>{" "}
            y se sube solo.
          </p>
        )}
        {estado.tipo === "error" && (
          <p className="mx-auto max-w-xl px-4 pb-3 text-sm text-danger">
            No se pudo subir: {estado.mensaje}. Lo anotado sigue guardado en el teléfono.
          </p>
        )}
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-4 pt-4">
        <Instalar />

        <div role="tablist" aria-label="Qué registrar" className="grid grid-cols-3 gap-1 rounded-[var(--radius-lg)] border border-border bg-surface p-1">
          {(
            [
              { k: "labor", label: "Labores", icon: ClipboardList },
              { k: "uso", label: "Riego y equipos", icon: Droplets },
              ...(catalogo.porOtros ? [{ k: "compra", label: "Combustible", icon: Fuel }] : []),
            ] as { k: TipoCola; label: string; icon: typeof Fuel }[]
          ).map(({ k, label, icon: Icono }) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={modo === k}
              onClick={() => {
                setModo(k);
                setEditando(null);
              }}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] px-2 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                modo === k ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
              )}
            >
              <Icono className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {modo === "uso" && (
          <FormUso
            key={editando?.grupo ?? "nuevo-uso"}
            catalogo={catalogo}
            editar={editando?.tipo === "uso" ? editando.item : null}
            onGuardar={(u) => guardarOtro("uso", u)}
            onCancelar={() => setEditando(null)}
          />
        )}
        {modo === "compra" && catalogo.porOtros && (
          <FormCompra
            key={editando?.grupo ?? "nueva-compra"}
            editar={editando?.tipo === "compra" ? editando.item : null}
            onGuardar={(c) => guardarOtro("compra", c)}
            onCancelar={() => setEditando(null)}
          />
        )}

        {modo === "labor" && (
        <form
          onSubmit={guardar}
          noValidate
          className="space-y-5 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-soft-sm)]"
        >
          {corrigiendo && (
            <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-warn-soft px-3 py-2 text-sm text-warn">
              <span>Corrigiendo un registro que no se ha subido</span>
              <button
                type="button"
                className="font-medium underline"
                onClick={() => {
                  setCorrigiendo(null);
                  setB(borradorVacio(hoy(), catalogo.yo));
                  setErrores({});
                }}
              >
                Cancelar
              </button>
            </div>
          )}

          <Field label="Fecha" error={errores.fecha}>
            <Input
              type="date"
              value={b.fecha}
              max={hoy()}
              onChange={(e) => set("fecha", e.target.value)}
              className="h-12 text-base"
            />
          </Field>

          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-fg-muted">
              {catalogo.porOtros ? "¿Quién? (marque a toda la cuadrilla)" : "Trabajador"}
            </legend>
            {catalogo.empleados.length === 0 ? (
              <p className="text-sm text-danger">
                Su cuenta no está enlazada a ningún trabajador. Pida a Dirección que la enlace.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {catalogo.empleados.map((e) => (
                  <Chip
                    key={e.id}
                    activo={b.empleados.includes(e.id)}
                    onClick={() => catalogo.porOtros && alternar("empleados", e.id)}
                    disabled={!catalogo.porOtros}
                  >
                    {e.nombre}
                  </Chip>
                ))}
              </div>
            )}
            {errores.empleados && <p className="mt-1 text-xs text-danger">{errores.empleados}</p>}
            {b.empleados.length > 1 && (
              <p className="mt-1 text-xs text-fg-subtle">
                Queda un registro por persona, cada uno con las mismas cifras.
              </p>
            )}
          </fieldset>

          <Field label="Labor" error={errores.laborId}>
            <Select
              value={b.laborId}
              onChange={(e) => set("laborId", e.target.value)}
              className="h-12 text-base"
            >
              <option value="">Elija la labor…</option>
              {porCategoria.map(([c, ls]) => (
                <optgroup key={c} label={CATEGORIAS[c]}>
                  {ls.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>

          {labor?.categoria !== "ausencia" && (
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-fg-muted">Válvulas</legend>
              <div className="flex flex-wrap gap-2">
                {catalogo.valvulas.map((v) => (
                  <Chip key={v} activo={b.valvulas.includes(v)} onClick={() => alternar("valvulas", v)} mono>
                    {v}
                  </Chip>
                ))}
              </div>
              {errores.valvulas && <p className="mt-1 text-xs text-danger">{errores.valvulas}</p>}
              <div className="mt-3">
                <Field label="Otro sitio (si no es en una válvula)">
                  <Input
                    value={b.sitio}
                    onChange={(e) => set("sitio", e.target.value)}
                    list="campo-sitios"
                    placeholder="Quinta, Vivero, Lago…"
                    className="h-12 text-base"
                  />
                  <datalist id="campo-sitios">
                    {SITIOS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </Field>
              </div>
            </fieldset>
          )}

          <fieldset className="space-y-3">
            <legend className="mb-1.5 text-xs font-medium text-fg-muted">Horas</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inicio" error={errores.horaInicio}>
                <Input
                  type="time"
                  value={b.horaInicio}
                  onChange={(e) => set("horaInicio", e.target.value)}
                  className="h-12 text-base"
                />
              </Field>
              <Field label="Fin" error={errores.horaFin}>
                <Input
                  type="time"
                  value={b.horaFin}
                  onChange={(e) => set("horaFin", e.target.value)}
                  className="h-12 text-base"
                />
              </Field>
            </div>
            {b.horaInicio || b.horaFin ? (
              <p className="tnum text-sm text-fg-muted">
                {horasCalc != null ? `${String(horasCalc).replace(".", ",")} horas` : "—"}
              </p>
            ) : (
              <Field label="…o el total de horas" error={errores.horas}>
                <Input
                  inputMode="decimal"
                  value={b.horas}
                  onChange={(e) => set("horas", e.target.value)}
                  placeholder="7,5"
                  className="tnum h-12 text-base"
                />
              </Field>
            )}
          </fieldset>

          {medida === "cosecha" && (
            <div className="grid grid-cols-3 gap-3">
              <Numero label="Sanas" valor={b.sanas} error={errores.sanas} onChange={(v) => set("sanas", v)} />
              <Numero
                label="Pasador / monilia"
                valor={b.pasador}
                error={errores.pasador}
                onChange={(v) => set("pasador", v)}
              />
              <Numero label="Negras" valor={b.negras} error={errores.negras} onChange={(v) => set("negras", v)} />
              <p className="col-span-3 -mt-1 text-xs text-fg-subtle">Mazorcas. Cada uno anota lo suyo.</p>
            </div>
          )}
          {medida === "desgrane" && (
            <div className="grid grid-cols-2 gap-3">
              <Numero label="Kg baba A (sanas)" valor={b.sanas} error={errores.sanas} onChange={(v) => set("sanas", v)} />
              <Numero
                label="Kg baba C (negras)"
                valor={b.negras}
                error={errores.negras}
                onChange={(v) => set("negras", v)}
              />
            </div>
          )}
          {medida === "cantidad" && labor && (
            <Numero
              label={`Cantidad (${labor.unidad})`}
              valor={b.cantidad}
              error={errores.cantidad}
              onChange={(v) => set("cantidad", v)}
            />
          )}

          <Field label="Observaciones">
            <Textarea
              value={b.observaciones}
              onChange={(e) => set("observaciones", e.target.value)}
              rows={2}
              className="text-base"
            />
          </Field>

          <Button type="submit" size="lg" className="w-full" disabled={catalogo.empleados.length === 0}>
            <Check className="h-5 w-5" />
            {corrigiendo ? "Guardar corrección" : "Guardar"}
          </Button>
        </form>
        )}

        <Lista
          titulo="Por subir"
          vacio={listo ? "Nada pendiente: todo lo anotado ya llegó." : "Leyendo el teléfono…"}
          items={mios}
          nombreDe={nombreDe}
          laborDe={laborDe}
          equipoDe={equipoDe}
          acciones={(grupo) =>
            estado.tipo === "subiendo" ? null : (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => corregir(grupo)} aria-label="Corregir">
                <Pencil className="h-4 w-4" />
              </Button>
              <BorrarBoton onConfirmar={() => void borrar(grupo)} />
            </div>
            )
          }
        />
        {ajenos > 0 && (
          <p className="text-xs text-fg-subtle">
            Hay {ajenos} {ajenos === 1 ? "registro" : "registros"} de otra cuenta en este teléfono. Se suben
            cuando esa persona entre.
          </p>
        )}

        <Lista
          titulo="Subidos (últimos 7 días)"
          vacio="Todavía no ha subido nada desde este teléfono."
          items={enviados}
          nombreDe={nombreDe}
          laborDe={laborDe}
          equipoDe={equipoDe}
        />
      </main>
    </div>
  );
}

function BorrarBoton({ onConfirmar }: { onConfirmar: () => void }) {
  const [seguro, setSeguro] = React.useState(false);
  React.useEffect(() => {
    if (!seguro) return;
    const t = window.setTimeout(() => setSeguro(false), 4000);
    return () => window.clearTimeout(t);
  }, [seguro]);
  return seguro ? (
    <Button size="sm" variant="danger" onClick={onConfirmar}>
      ¿Borrar?
    </Button>
  ) : (
    <Button size="sm" variant="ghost" onClick={() => setSeguro(true)} aria-label="Borrar">
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

type Fila = ItemCola | ItemEnviado;

function Lista({
  titulo,
  vacio,
  items,
  nombreDe,
  laborDe,
  equipoDe,
  acciones,
}: {
  titulo: string;
  vacio: string;
  items: Fila[];
  nombreDe: Map<string, string>;
  laborDe: Map<string, CatalogoCaptura["labores"][number]>;
  equipoDe: Map<string, string>;
  acciones?: (grupo: string) => React.ReactNode;
}) {
  const grupos = React.useMemo(() => {
    const m = new Map<string, Fila[]>();
    for (const it of items) {
      const arr = m.get(it.grupo) ?? [];
      arr.push(it);
      m.set(it.grupo, arr);
    }
    return [...m.entries()];
  }, [items]);

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-fg">{titulo}</h2>
      {grupos.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-border p-4 text-sm text-fg-subtle">
          {vacio}
        </p>
      ) : (
        <ul className="space-y-2">
          {grupos.map(([grupo, fs]) => {
            const d = describir(fs, nombreDe, laborDe, equipoDe);
            const rechazo = fs.find((x) => "estado" in x && x.estado === "rechazado") as ItemCola | undefined;
            return (
              <li
                key={grupo}
                className={cn(
                  "rounded-[var(--radius-md)] border bg-surface p-3",
                  rechazo ? "border-danger/50" : "border-border",
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">{d.titulo}</p>
                    <p className="tnum text-xs text-fg-muted">{d.detalle}</p>
                    {d.personas && <p className="truncate text-xs text-fg-subtle">{d.personas}</p>}
                    {rechazo && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-danger">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        No subió: {rechazo.motivo}
                      </p>
                    )}
                  </div>
                  {acciones?.(grupo)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function cifra(f: RegistroCampo, l: CatalogoCaptura["labores"][number] | undefined): string {
  if (!l) return "";
  const n = (x: number | null) => (x == null ? "0" : String(x).replace(".", ","));
  const m = medidaDe(l);
  if (m === "cosecha") return ` · ${n(f.sanas)} sanas / ${n(f.pasador_monilia)} pasador / ${n(f.negras)} negras`;
  if (m === "desgrane") return ` · A ${n(f.sanas)} kg / C ${n(f.negras)} kg`;
  if (m === "cantidad" && f.cantidad != null) return ` · ${n(f.cantidad)} ${l.unidad}`;
  return "";
}

const coma = (x: number | null) => (x == null ? "" : String(x).replace(".", ","));

/** Título y detalle de un grupo de la cola, según su tipo. */
function describir(
  fs: Fila[],
  nombreDe: Map<string, string>,
  laborDe: Map<string, CatalogoCaptura["labores"][number]>,
  equipoDe: Map<string, string>,
): { titulo: string; detalle: string; personas: string | null } {
  const f = fs[0];
  const tipo = tipoDe(f);
  if (tipo === "compra") {
    const c = f as unknown as CompraCampo;
    return {
      titulo: `Compra de ${c.combustible === "acpm" ? "ACPM" : "gasolina"}`,
      detalle: [
        c.fecha,
        c.galones != null ? `${coma(c.galones)} gal` : null,
        c.valor != null ? `$${Math.round(c.valor).toLocaleString("es-CO")}` : null,
        c.recibo ? `recibo ${c.recibo}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      personas: c.destino,
    };
  }
  if (tipo === "uso") {
    const u = f as unknown as UsoCampo;
    return {
      titulo: equipoDe.get(u.equipo_id) ?? "Equipo",
      detalle: [
        u.fecha,
        u.horas != null ? `${coma(u.horas)} h` : null,
        u.valvulas.length ? `V ${u.valvulas.join(", ")}` : null,
        u.sitio,
        u.carga_galones != null ? `tanqueó ${coma(u.carga_galones)} gal` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      personas: u.empleado_id ? (nombreDe.get(u.empleado_id) ?? null) : null,
    };
  }
  const r = f as unknown as RegistroCampo;
  const l = laborDe.get(r.labor_id);
  return {
    titulo: l?.nombre ?? "Labor",
    detalle: `${r.fecha} · ${coma(r.horas)} h${r.valvulas.length ? ` · V ${r.valvulas.join(", ")}` : ""}${r.sitio ? ` · ${r.sitio}` : ""}${cifra(r, l)}`,
    personas: (fs as unknown as RegistroCampo[]).map((x) => nombreDe.get(x.empleado_id) ?? "¿?").join(", "),
  };
}

/**
 * Invitación a instalar la app. Instalada, el teléfono la abre sin barra del
 * navegador y —en iPhone— no borra lo guardado tras días sin uso, que es lo
 * que pasa con una página común.
 */
function Instalar() {
  const [evento, setEvento] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [cerrado, setCerrado] = React.useState(false);
  const plataforma = React.useSyncExternalStore(nada, plataformaInstalable, () => "oculto" as const);
  const modo = cerrado ? "oculto" : plataforma;

  React.useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setEvento(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  if (modo === "oculto") return null;
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border bg-accent-soft p-3 text-sm text-accent-soft-fg">
      <Download className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">Instale la app en este teléfono</p>
        <p className="mt-0.5 text-xs">
          {modo === "ios"
            ? "En Safari toque Compartir y luego «Agregar a inicio». Así funciona sin señal y no se borra lo guardado."
            : "Así se abre como app y funciona sin señal."}
        </p>
        {evento && (
          <Button
            size="sm"
            className="mt-2"
            onClick={async () => {
              await evento.prompt();
              setEvento(null);
              setCerrado(true);
            }}
          >
            Instalar
          </Button>
        )}
      </div>
    </div>
  );
}

function suscribirRed(cambio: () => void) {
  window.addEventListener("online", cambio);
  window.addEventListener("offline", cambio);
  return () => {
    window.removeEventListener("online", cambio);
    window.removeEventListener("offline", cambio);
  };
}

function nada() {
  return () => {};
}

function plataformaInstalable(): "oculto" | "ios" | "otro" {
  const instalada =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (instalada) return "oculto";
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios" : "otro";
}
