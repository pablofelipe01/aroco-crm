"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { fechaColombia, horasEntre, leerNumero } from "@/lib/finca/captura";
import {
  DESTINOS,
  PROVEEDORES,
  armarCompra,
  armarUso,
  compraABorrador,
  compraVacia,
  completarCompra,
  usoABorrador,
  usoVacio,
  validarCompra,
  validarUso,
  type BorradorCompra,
  type BorradorUso,
  type CatalogoCampo,
  type CompraCampo,
  type ErroresCompra,
  type ErroresUso,
  type UsoCampo,
} from "@/lib/finca/captura-equipos";
import { formatCOP } from "@/lib/utils";
import { Chip, Numero } from "./piezas";

const hoy = () => fechaColombia(new Date());
const tarjeta =
  "space-y-5 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-soft-sm)]";

function AvisoCorrigiendo({ onCancelar }: { onCancelar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-warn-soft px-3 py-2 text-sm text-warn">
      <span>Corrigiendo algo que no se ha subido</span>
      <button type="button" className="font-medium underline" onClick={onCancelar}>
        Cancelar
      </button>
    </div>
  );
}

// ── Riego y equipos ─────────────────────────────────────────────────────────

export function FormUso({
  catalogo,
  editar,
  onGuardar,
  onCancelar,
}: {
  catalogo: CatalogoCampo;
  /** Uso de la cola que se está corrigiendo. */
  editar: UsoCampo | null;
  onGuardar: (u: UsoCampo) => Promise<void>;
  onCancelar: () => void;
}) {
  const { toast } = useToast();
  const [b, setB] = React.useState<BorradorUso>(() =>
    editar ? usoABorrador(editar) : usoVacio(hoy(), catalogo),
  );
  const [errores, setErrores] = React.useState<ErroresUso>({});
  const equipos = catalogo.equipos ?? [];
  const equipo = equipos.find((q) => q.id === b.equipoId);
  const esMotor = equipo?.codigo === "motor-riego";

  const set = <K extends keyof BorradorUso>(k: K, v: BorradorUso[K]) => {
    setB((x) => ({ ...x, [k]: v }));
    setErrores((e) => {
      if (!e[k]) return e;
      const n = { ...e };
      delete n[k];
      return n;
    });
  };

  if (equipos.length === 0) {
    return (
      <p className={`${tarjeta} text-sm text-warn`}>
        Este teléfono tiene guardada una versión de la pantalla sin la lista de equipos. Ábrala una
        vez con señal (en la oficina) y aparece.
      </p>
    );
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const errs = validarUso(b, catalogo, hoy());
    setErrores(errs);
    if (Object.keys(errs).length) {
      toast({ tone: "error", title: "Revise los campos marcados" });
      return;
    }
    await onGuardar(armarUso(b, new Date(), editar?.id ?? crypto.randomUUID()));
    // Quedan fecha, equipo y quién: lo normal es anotar los grupos de
    // válvulas del día uno tras otro. El nuevo tramo empieza donde terminó.
    setB((x) => ({
      ...usoVacio(x.fecha, catalogo),
      fecha: x.fecha,
      equipoId: x.equipoId,
      empleadoId: x.empleadoId,
      horaInicio: editar ? "" : x.horaFin,
    }));
  }

  const horasCalc = horasEntre(b.horaInicio, b.horaFin);

  return (
    <form onSubmit={guardar} noValidate className={tarjeta}>
      {editar && <AvisoCorrigiendo onCancelar={onCancelar} />}

      <Field label="Fecha" error={errores.fecha}>
        <Input type="date" value={b.fecha} max={hoy()} onChange={(e) => set("fecha", e.target.value)} className="h-12 text-base" />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-fg-muted">Equipo</legend>
        <div className="flex flex-wrap gap-2">
          {equipos.map((q) => (
            <Chip key={q.id} activo={b.equipoId === q.id} onClick={() => set("equipoId", q.id)}>
              {q.codigo === "motor-riego" ? "Motor de riego" : q.nombre}
            </Chip>
          ))}
        </div>
        {errores.equipoId && <p className="mt-1 text-xs text-danger">{errores.equipoId}</p>}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-fg-muted">
          {esMotor ? "Válvulas que se abrieron (riegan a la vez)" : "Válvulas"}
        </legend>
        <div className="flex flex-wrap gap-2">
          {catalogo.valvulas.map((v) => (
            <Chip
              key={v}
              mono
              activo={b.valvulas.includes(v)}
              onClick={() =>
                set("valvulas", b.valvulas.includes(v) ? b.valvulas.filter((x) => x !== v) : [...b.valvulas, v])
              }
            >
              {v}
            </Chip>
          ))}
        </div>
        {errores.valvulas && <p className="mt-1 text-xs text-danger">{errores.valvulas}</p>}
        {!esMotor && (
          <div className="mt-3">
            <Field label="Otro sitio (si no es en una válvula)">
              <Input value={b.sitio} onChange={(e) => set("sitio", e.target.value)} placeholder="Quinta, Lago, Bodegas…" className="h-12 text-base" />
            </Field>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1.5 text-xs font-medium text-fg-muted">Horas de uso</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inicio" error={errores.horaInicio}>
            <Input type="time" value={b.horaInicio} onChange={(e) => set("horaInicio", e.target.value)} className="h-12 text-base" />
          </Field>
          <Field label="Fin" error={errores.horaFin}>
            <Input type="time" value={b.horaFin} onChange={(e) => set("horaFin", e.target.value)} className="h-12 text-base" />
          </Field>
        </div>
        {b.horaInicio || b.horaFin ? (
          <p className="tnum text-sm text-fg-muted">
            {horasCalc != null ? `${String(horasCalc).replace(".", ",")} horas` : "—"}
          </p>
        ) : (
          <Numero label="…o el total de horas" valor={b.horas} error={errores.horas} onChange={(v) => set("horas", v)} placeholder="3" />
        )}
      </fieldset>

      <Numero
        label={`¿Le echó ${equipo?.combustible === "gasolina" ? "gasolina" : "ACPM"}? Galones`}
        valor={b.carga}
        error={errores.carga}
        onChange={(v) => set("carga", v)}
        hint="Déjelo vacío si no tanqueó. Si tanqueó sin usarlo, anote solo los galones."
      />

      <Field label={catalogo.porOtros ? "Quién lo usó (opcional)" : "Trabajador"} error={errores.empleadoId}>
        <Select value={b.empleadoId} onChange={(e) => set("empleadoId", e.target.value)} className="h-12 text-base" disabled={!catalogo.porOtros}>
          <option value="">{catalogo.porOtros ? "—" : "Elija…"}</option>
          {catalogo.empleados.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </Select>
      </Field>

      {!esMotor && (
        <Field label="Actividad">
          <Input value={b.actividad} onChange={(e) => set("actividad", e.target.value)} placeholder="Control de malezas, repique de melina…" className="h-12 text-base" />
        </Field>
      )}

      <Field label="Observaciones">
        <Textarea value={b.observaciones} onChange={(e) => set("observaciones", e.target.value)} rows={2} className="text-base" />
      </Field>

      <Button type="submit" size="lg" className="w-full">
        <Check className="h-5 w-5" />
        {editar ? "Guardar corrección" : "Guardar"}
      </Button>
    </form>
  );
}

// ── Compras de combustible ──────────────────────────────────────────────────

export function FormCompra({
  editar,
  onGuardar,
  onCancelar,
}: {
  editar: CompraCampo | null;
  onGuardar: (c: CompraCampo) => Promise<void>;
  onCancelar: () => void;
}) {
  const { toast } = useToast();
  const [b, setB] = React.useState<BorradorCompra>(() => (editar ? compraABorrador(editar) : compraVacia(hoy())));
  const [errores, setErrores] = React.useState<ErroresCompra>({});

  const set = <K extends keyof BorradorCompra>(k: K, v: BorradorCompra[K]) => {
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
    const errs = validarCompra(b, hoy());
    setErrores(errs);
    if (Object.keys(errs).length) {
      toast({ tone: "error", title: "Revise los campos marcados" });
      return;
    }
    await onGuardar(armarCompra(b, new Date(), editar?.id ?? crypto.randomUUID()));
    setB((x) => ({ ...compraVacia(x.fecha), combustible: x.combustible, proveedor: x.proveedor, destino: x.destino }));
  }

  // Lo que se va a guardar si falta uno de los tres.
  const n = (s: string) => {
    const x = leerNumero(s);
    return x == null || Number.isNaN(x) ? null : x;
  };
  const calc = completarCompra(n(b.galones), n(b.precio), n(b.valor));
  const calculado =
    !b.valor.trim() && calc.valor != null
      ? `Valor: ${formatCOP(calc.valor)}`
      : !b.galones.trim() && calc.galones != null
        ? `Galones: ${String(calc.galones).replace(".", ",")}`
        : !b.precio.trim() && calc.precio != null
          ? `Precio por galón: ${formatCOP(calc.precio)}`
          : null;

  return (
    <form onSubmit={guardar} noValidate className={tarjeta}>
      {editar && <AvisoCorrigiendo onCancelar={onCancelar} />}

      <Field label="Fecha" error={errores.fecha}>
        <Input type="date" value={b.fecha} max={hoy()} onChange={(e) => set("fecha", e.target.value)} className="h-12 text-base" />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-fg-muted">Combustible</legend>
        <div className="flex gap-2">
          <Chip activo={b.combustible === "acpm"} onClick={() => set("combustible", "acpm")}>
            ACPM
          </Chip>
          <Chip activo={b.combustible === "gasolina"} onClick={() => set("combustible", "gasolina")}>
            Gasolina
          </Chip>
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Numero label="Galones" valor={b.galones} error={errores.galones} onChange={(v) => set("galones", v)} />
        <Numero label="Precio por galón" valor={b.precio} error={errores.precio} onChange={(v) => set("precio", v)} placeholder="11.300" />
      </div>
      <Numero label="Valor pagado" valor={b.valor} error={errores.valor} onChange={(v) => set("valor", v)} placeholder="406.800" />
      {calculado && <p className="tnum -mt-3 text-sm text-fg-muted">Se calcula — {calculado}</p>}

      <Field label="Recibo No.">
        <Input value={b.recibo} onChange={(e) => set("recibo", e.target.value)} inputMode="numeric" className="tnum h-12 text-base" />
      </Field>

      <Field label="Proveedor">
        <Input value={b.proveedor} onChange={(e) => set("proveedor", e.target.value)} list="campo-proveedores" className="h-12 text-base" />
        <datalist id="campo-proveedores">
          {PROVEEDORES.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Field>

      <Field label="Para qué">
        <Input value={b.destino} onChange={(e) => set("destino", e.target.value)} list="campo-destinos" className="h-12 text-base" />
        <datalist id="campo-destinos">
          {DESTINOS.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </Field>

      <Field label="Observaciones">
        <Textarea value={b.observaciones} onChange={(e) => set("observaciones", e.target.value)} rows={2} className="text-base" placeholder="De dónde salió la plata, quién lo trajo…" />
      </Field>

      <Button type="submit" size="lg" className="w-full">
        <Check className="h-5 w-5" />
        {editar ? "Guardar corrección" : "Guardar"}
      </Button>
    </form>
  );
}
