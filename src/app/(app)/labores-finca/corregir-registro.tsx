"use client";

import * as React from "react";
import { History } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate } from "@/lib/utils";
import {
  borradorDesde,
  datosDe,
  fechaColombia,
  horasEntre,
  medidaDe,
  sinErrores,
  validar,
  type Borrador,
  type CatalogoCaptura,
  type Errores,
} from "@/lib/finca/captura";
import {
  anularRegistro,
  corregirRegistro,
  historialRegistro,
  type Cambio,
} from "./actions";
import type { Categoria, RegistroVista } from "./page";

/** Lo más viejo que se deja corregir (lo mismo que dice la base, 0119). */
const DESDE = "2025-01-01";

const CATEGORIAS: Record<Categoria, string> = {
  cosecha: "Cosecha",
  poscosecha: "Poscosecha",
  cultivo: "Cultivo",
  riego: "Riego",
  sanidad: "Sanidad",
  mantenimiento: "Mantenimiento",
  administracion: "Administración",
  ausencia: "Ausencia",
};

const ACCIONES: Record<Cambio["accion"], string> = {
  corregir: "Corregido",
  anular: "Anulado",
  restaurar: "Restaurado",
  revisar: "Revisado sin cambios",
};

/** Nombres legibles de las columnas, para el historial. */
const CAMPOS: Record<string, string> = {
  fecha: "Fecha",
  empleado_id: "Trabajador",
  labor_id: "Labor",
  valvulas: "Válvulas",
  sitio: "Sitio",
  hora_inicio: "Inicio",
  hora_fin: "Fin",
  horas: "Horas",
  cantidad: "Cantidad",
  sanas: "Sanas / kg A",
  pasador_monilia: "Pasador",
  negras: "Negras / kg C",
  observaciones: "Observaciones",
  dudoso: "Por revisar",
};

export function CorregirRegistro({
  registro,
  catalogo,
  onClose,
}: {
  registro: RegistroVista | null;
  catalogo: CatalogoCaptura;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={registro != null}
      onClose={onClose}
      title="Corregir registro"
      subtitle={
        registro
          ? `${registro.origen === "app" ? "Del celular" : registro.origen === "telegram" ? "Por Telegram" : `Hoja, fila ${registro.refHoja?.replace(/^\w+:/, "") ?? "—"}`} · ${formatDate(registro.fecha)}`
          : undefined
      }
      width="lg"
    >
      {registro && (
        // `key`: al abrir otra fila el formulario arranca de cero.
        <Formulario key={registro.id} registro={registro} catalogo={catalogo} onClose={onClose} />
      )}
    </Drawer>
  );
}

function Formulario({
  registro: r,
  catalogo,
  onClose,
}: {
  registro: RegistroVista;
  catalogo: CatalogoCaptura;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [b, setB] = React.useState<Borrador>(() =>
    borradorDesde({
      fecha: r.fecha,
      empleado_id: r.empleadoId,
      labor_id: r.laborId,
      valvulas: r.valvulas,
      sitio: r.sitio,
      hora_inicio: r.horaInicio,
      hora_fin: r.horaFin,
      horas: r.horas,
      cantidad: r.cantidad,
      sanas: r.sanas,
      pasador_monilia: r.pasador,
      negras: r.negras,
      observaciones: r.observaciones,
    }),
  );
  const [errores, setErrores] = React.useState<Errores>({});
  const [seguirDudoso, setSeguirDudoso] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [motivoAnular, setMotivoAnular] = React.useState("");
  const [anulando, setAnulando] = React.useState(false);

  // Las válvulas viejas de la hoja pueden no estar en el catálogo activo; se
  // muestran igual para poder quitarlas.
  const valvulas = React.useMemo(
    () => [...new Set([...catalogo.valvulas, ...r.valvulas])],
    [catalogo.valvulas, r.valvulas],
  );
  const labor = catalogo.labores.find((l) => l.id === b.laborId);
  const medida = labor ? medidaDe(labor) : null;
  const opciones = {
    desde: DESDE,
    permitirSinEmpleado: r.empleadoId == null,
    permitirSinHoras: r.horas == null,
  };

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => {
    setB((x) => ({ ...x, [k]: v }));
    setErrores((e) => {
      if (!e[k]) return e;
      const n = { ...e };
      delete n[k];
      return n;
    });
  };

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const errs = validar(b, catalogo, fechaColombia(new Date()), opciones);
    setErrores(errs);
    if (!sinErrores(errs)) return;
    setGuardando(true);
    const res = await corregirRegistro(r.id, {
      ...datosDe(b, catalogo),
      empleado_id: b.empleados[0] ?? null,
      seguir_dudoso: seguirDudoso,
    });
    setGuardando(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se guardó", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Registro corregido" });
    onClose();
  }

  async function anular() {
    if (!motivoAnular.trim()) return;
    setAnulando(true);
    const res = await anularRegistro(r.id, true, motivoAnular);
    setAnulando(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se anuló", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Registro anulado", description: "Ya no cuenta en las sumas." });
    onClose();
  }

  const horasCalc = horasEntre(b.horaInicio, b.horaFin);

  return (
    <div className="space-y-6">
      {r.dudoso && (
        <p className="rounded-[var(--radius-md)] bg-warn-soft px-3 py-2 text-sm text-warn">
          Por revisar: {r.motivoDuda}
        </p>
      )}

      <form onSubmit={guardar} noValidate className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha" error={errores.fecha}>
            <Input
              type="date"
              value={b.fecha}
              min={DESDE}
              max={fechaColombia(new Date())}
              onChange={(e) => set("fecha", e.target.value)}
            />
          </Field>
          <Field label="Trabajador" error={errores.empleados}>
            <Select
              value={b.empleados[0] ?? ""}
              onChange={(e) => set("empleados", e.target.value ? [e.target.value] : [])}
            >
              <option value="" disabled={r.empleadoId != null}>
                {r.empleadoId == null ? "Sin trabajador (resumen de la hoja)" : "Elija…"}
              </option>
              {catalogo.empleados.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Labor" error={errores.laborId}>
          <Select value={b.laborId} onChange={(e) => set("laborId", e.target.value)}>
            {(Object.keys(CATEGORIAS) as Categoria[]).map((c) => {
              const ls = catalogo.labores.filter((l) => l.categoria === c);
              return ls.length ? (
                <optgroup key={c} label={CATEGORIAS[c]}>
                  {ls.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </Select>
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-fg-muted">Válvulas</legend>
          <div className="flex flex-wrap gap-1.5">
            {valvulas.map((v) => {
              const activo = b.valvulas.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={activo}
                  onClick={() =>
                    set("valvulas", activo ? b.valvulas.filter((x) => x !== v) : [...b.valvulas, v])
                  }
                  className={cn(
                    "tnum rounded-full border px-3 py-1 font-mono text-xs transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    activo
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border bg-surface text-fg hover:border-border-strong",
                  )}
                >
                  {v}
                </button>
              );
            })}
          </div>
          {errores.valvulas && <p className="mt-1 text-xs text-danger">{errores.valvulas}</p>}
        </fieldset>

        <Field label="Otro sitio">
          <Input value={b.sitio} onChange={(e) => set("sitio", e.target.value)} placeholder="Quinta, Vivero…" />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Inicio" error={errores.horaInicio}>
            <Input type="time" value={b.horaInicio} onChange={(e) => set("horaInicio", e.target.value)} />
          </Field>
          <Field label="Fin" error={errores.horaFin}>
            <Input type="time" value={b.horaFin} onChange={(e) => set("horaFin", e.target.value)} />
          </Field>
          {b.horaInicio || b.horaFin ? (
            <Field label="Horas">
              <p className="tnum flex h-10 items-center font-mono text-sm text-fg-muted">
                {horasCalc != null ? String(horasCalc).replace(".", ",") : "—"}
              </p>
            </Field>
          ) : (
            <Field label="Horas" error={errores.horas}>
              <Input
                inputMode="decimal"
                value={b.horas}
                onChange={(e) => set("horas", e.target.value)}
                className="tnum font-mono"
              />
            </Field>
          )}
        </div>

        {medida === "cosecha" && (
          <div className="grid grid-cols-3 gap-3">
            <Num label="Sanas" v={b.sanas} e={errores.sanas} on={(x) => set("sanas", x)} />
            <Num label="Pasador / monilia" v={b.pasador} e={errores.pasador} on={(x) => set("pasador", x)} />
            <Num label="Negras" v={b.negras} e={errores.negras} on={(x) => set("negras", x)} />
          </div>
        )}
        {medida === "desgrane" && (
          <div className="grid grid-cols-2 gap-3">
            <Num label="Kg baba A" v={b.sanas} e={errores.sanas} on={(x) => set("sanas", x)} />
            <Num label="Kg baba C" v={b.negras} e={errores.negras} on={(x) => set("negras", x)} />
          </div>
        )}
        {medida === "cantidad" && labor && (
          <Num label={`Cantidad (${labor.unidad})`} v={b.cantidad} e={errores.cantidad} on={(x) => set("cantidad", x)} />
        )}

        <Field label="Observaciones">
          <Textarea value={b.observaciones} onChange={(e) => set("observaciones", e.target.value)} rows={2} />
        </Field>

        {r.dudoso && (
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              checked={seguirDudoso}
              onChange={(e) => setSeguirDudoso(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Dejarlo en «Por revisar» después de guardar
          </label>
        )}

        <div className="flex gap-2">
          <Button type="submit" loading={guardando}>
            Guardar corrección
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
        <p className="text-xs text-fg-subtle">
          {r.origen === "hoja"
            ? "Al guardar, esta fila queda fija: si se vuelve a cargar la hoja, no la reescribe."
            : "El cambio queda en el historial con su nombre y la hora."}
        </p>
      </form>

      <section className="space-y-2 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-fg">Anular</h3>
        <p className="text-xs text-fg-muted">
          Para duplicados o registros que no debieron existir. No se borra: deja de contar en las
          sumas y se puede restaurar desde «Ver anulados».
        </p>
        <div className="flex gap-2">
          <Input
            value={motivoAnular}
            onChange={(e) => setMotivoAnular(e.target.value)}
            placeholder="Motivo, p. ej. «duplicado de la fila 83»"
            aria-label="Motivo de la anulación"
          />
          <Button
            type="button"
            variant="danger"
            onClick={() => void anular()}
            loading={anulando}
            disabled={!motivoAnular.trim()}
          >
            Anular
          </Button>
        </div>
      </section>

      <Historial id={r.id} catalogo={catalogo} />
    </div>
  );
}

function Num({ label, v, e, on }: { label: string; v: string; e?: string; on: (x: string) => void }) {
  return (
    <Field label={label} error={e}>
      <Input inputMode="decimal" value={v} onChange={(x) => on(x.target.value)} className="tnum font-mono" />
    </Field>
  );
}

export function Historial({ id, catalogo }: { id: string; catalogo: CatalogoCaptura }) {
  const [estado, setEstado] = React.useState<
    { tipo: "cargando" } | { tipo: "error"; mensaje: string } | { tipo: "ok"; cambios: Cambio[] }
  >({ tipo: "cargando" });

  React.useEffect(() => {
    let vivo = true;
    void historialRegistro(id).then((r) => {
      if (!vivo) return;
      setEstado(r.ok ? { tipo: "ok", cambios: r.cambios } : { tipo: "error", mensaje: r.error });
    });
    return () => {
      vivo = false;
    };
  }, [id]);

  const nombre = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const e of catalogo.empleados) m.set(e.id, e.nombre);
    for (const l of catalogo.labores) m.set(l.id, l.nombre);
    return m;
  }, [catalogo]);
  const ver = (k: string, v: unknown): string => {
    if (v == null || v === "") return "—";
    if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
    if (typeof v === "boolean") return v ? "sí" : "no";
    if ((k === "empleado_id" || k === "labor_id") && typeof v === "string") return nombre.get(v) ?? v;
    if ((k === "hora_inicio" || k === "hora_fin") && typeof v === "string") return v.slice(0, 5);
    return String(v).replace(".", ",");
  };

  return (
    <section className="space-y-2 border-t border-border pt-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
        <History className="h-4 w-4" /> Historial
      </h3>
      {estado.tipo === "cargando" ? (
        <p className="text-xs text-fg-subtle">Cargando…</p>
      ) : estado.tipo === "error" ? (
        <p className="text-xs text-danger">No se pudo leer el historial: {estado.mensaje}</p>
      ) : estado.cambios.length === 0 ? (
        <p className="text-xs text-fg-subtle">Sin cambios: está como llegó.</p>
      ) : (
        <ul className="space-y-3">
          {estado.cambios.map((c) => {
            const claves =
              c.accion === "corregir" && c.antes && c.despues
                ? Object.keys(CAMPOS).filter(
                    (k) => JSON.stringify(c.antes?.[k] ?? null) !== JSON.stringify(c.despues?.[k] ?? null),
                  )
                : [];
            return (
              <li key={c.id} className="text-xs">
                <p className="text-fg">
                  <Badge tone={c.accion === "anular" ? "danger" : "neutral"}>{ACCIONES[c.accion]}</Badge>{" "}
                  <span className="text-fg-muted">
                    {c.por ?? "—"} ·{" "}
                    <span className="tnum font-mono">
                      {new Date(c.en).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </span>
                </p>
                {c.motivo && <p className="mt-0.5 text-fg-muted">«{c.motivo}»</p>}
                {claves.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {claves.map((k) => (
                      <li key={k} className="text-fg-muted">
                        {CAMPOS[k]}:{" "}
                        <span className="tnum font-mono line-through">{ver(k, c.antes?.[k])}</span> →{" "}
                        <span className="tnum font-mono text-fg">{ver(k, c.despues?.[k])}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
