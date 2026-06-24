"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  CERTIFICACIONES,
  LIBRE_DEFORESTACION,
  LIBRE_TRABAJO_INFANTIL,
  PERTENECE_ASOCIACION,
  REGIMEN_TRIBUTARIO,
  SELLOS,
  SI_NO,
  TIPO_CUENTA,
  TIPO_DOCUMENTO,
  TIPO_PROVEEDOR,
  TIPO_SECADO,
  VARIEDAD_CACAO,
} from "@/lib/procesos/proveedor-opts";
import type { Departamento, Proveedor } from "@/lib/types/database";
import { crearProveedor, actualizarProveedor, documentoExiste } from "./actions";

type FormState = Record<string, string>;

const NUM_FIELDS = [
  "cap_baba_mensual",
  "cap_baba_anual",
  "cap_seco_mensual",
  "cap_seco_anual",
  "humedad",
  "num_productores_compra",
];

function initialState(p?: Proveedor | null): FormState {
  const s: FormState = {};
  const keys = [
    "codigo", "nombre", "tipo_proveedor", "tipo_documento", "numero_documento", "direccion",
    "representante_legal", "documento_representante",
    "departamento", "municipio", "pertenece_asociacion", "asociacion", "pertenece_programa",
    "programa", "nit_asociacion", "contacto", "celular", "whatsapp", "email", "variedad_cacao",
    "cap_baba_mensual", "cap_baba_anual", "cap_seco_mensual", "cap_seco_anual", "tipo_secado",
    "humedad", "capacidad_comercializacion", "municipios_produccion", "libre_deforestacion",
    "libre_trabajo_infantil", "banco", "tipo_cuenta", "numero_cuenta", "tipo_documento_titular",
    "cedula_titular", "nombre_titular", "regimen_tributario",
    "referencia_comercial_1", "referencia_comercial_2", "num_productores_compra", "coordenadas",
    "acepta_compromisos_eticos", "acepta_politica_datos", "declara_origen_licito",
    "autoriza_verificacion",
  ];
  for (const k of keys) {
    const v = (p as Record<string, unknown> | undefined)?.[k];
    s[k] = v == null ? "" : String(v);
  }
  return s;
}

export function ProveedorForm({
  open,
  onClose,
  departamentos,
  municipios,
  initial,
  onSaved,
  certOpts,
  selloOpts,
}: {
  open: boolean;
  onClose: () => void;
  departamentos: Departamento[];
  municipios: { departamento: string; nombre: string }[];
  initial?: Proveedor | null;
  onSaved: (id: string) => void;
  certOpts?: string[];
  selloOpts?: string[];
}) {
  const { toast } = useToast();
  const [form, setForm] = React.useState<FormState>(() => initialState(initial));
  const [certs, setCerts] = React.useState<string[]>(initial?.certificaciones ?? []);
  const [sellos, setSellos] = React.useState<string[]>(initial?.sellos ?? []);

  // Opciones desde catálogo (BD) con fallback a las estáticas; se unen las ya
  // seleccionadas para no perder valores que se hayan desactivado en el catálogo.
  const union = (opts: string[] | undefined, base: string[], selected: string[]) => {
    const list = opts && opts.length > 0 ? opts : base;
    return [...list, ...selected.filter((s) => !list.includes(s))];
  };
  const certOptions = union(certOpts, CERTIFICACIONES, certs);
  const selloOptions = union(selloOpts, SELLOS, sellos);
  const [saving, setSaving] = React.useState(false);
  const [docDup, setDocDup] = React.useState(false);
  const [prevOpen, setPrevOpen] = React.useState(false);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(initialState(initial));
      setCerts(initial?.certificaciones ?? []);
      setSellos(initial?.sellos ?? []);
      setDocDup(false);
    }
  }

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const muniOpts = municipios.filter((m) => m.departamento === form.departamento);

  async function checkDoc() {
    if (!form.numero_documento?.trim()) return setDocDup(false);
    setDocDup(await documentoExiste(form.numero_documento, initial?.id));
  }

  async function onSubmit() {
    if (!form.nombre?.trim()) {
      toast({ tone: "error", title: "El nombre es obligatorio" });
      return;
    }
    if (docDup) {
      toast({ tone: "error", title: "Documento duplicado", description: "Ya existe un proveedor con ese número." });
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = { certificaciones: certs, sellos };
    for (const [k, v] of Object.entries(form)) {
      payload[k] = NUM_FIELDS.includes(k) ? (v.trim() === "" ? null : Number(v)) : v;
    }
    const res = initial
      ? await actualizarProveedor(initial.id, payload)
      : await crearProveedor(payload);
    setSaving(false);
    if (!res.ok || !res.id) {
      toast({ tone: "error", title: "No se pudo guardar", description: res.error });
      return;
    }
    toast({ tone: "success", title: initial ? "Proveedor actualizado" : "Proveedor creado" });
    onSaved(res.id);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={initial ? "Editar proveedor" : "Nuevo proveedor"}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={onSubmit} loading={saving}>
            {initial ? "Guardar" : "Crear proveedor"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Seccion titulo="Identificación">
          <Field label="Nombre del proveedor *" className="sm:col-span-2">
            <Input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />
          </Field>
          <Sel label="Tipo de proveedor" v={form.tipo_proveedor} set={(x) => set("tipo_proveedor", x)} opts={TIPO_PROVEEDOR} />
          <Sel label="Tipo de documento" v={form.tipo_documento} set={(x) => set("tipo_documento", x)} opts={TIPO_DOCUMENTO} />
          <Field label="Número de documento">
            <Input
              value={form.numero_documento}
              onChange={(e) => set("numero_documento", e.target.value)}
              onBlur={checkDoc}
              className={cn("font-mono", docDup && "border-danger")}
            />
            {docDup && <span className="mt-1 block text-xs text-danger">Ya existe un proveedor con ese documento.</span>}
          </Field>
          <Txt label="Código productor" v={form.codigo} set={(x) => set("codigo", x)} />
          <Txt label="Representante legal (empresas/asociaciones)" v={form.representante_legal} set={(x) => set("representante_legal", x)} />
          <Txt label="Documento del representante / persona natural" v={form.documento_representante} set={(x) => set("documento_representante", x)} />
        </Seccion>

        <Seccion titulo="Ubicación">
          <Sel
            label="Departamento"
            v={form.departamento}
            set={(x) => { set("departamento", x); set("municipio", ""); }}
            opts={departamentos.map((d) => d.nombre)}
          />
          <Sel label="Municipio" v={form.municipio} set={(x) => set("municipio", x)} opts={muniOpts.map((m) => m.nombre)} disabled={!form.departamento} />
          <Field label="Dirección" className="sm:col-span-2">
            <Input value={form.direccion} onChange={(e) => set("direccion", e.target.value)} />
          </Field>
          <Txt label="Coordenadas" v={form.coordenadas} set={(x) => set("coordenadas", x)} />
        </Seccion>

        <Seccion titulo="Asociación / Programa">
          <Sel label="¿Pertenece a asociación o cooperativa?" v={form.pertenece_asociacion} set={(x) => set("pertenece_asociacion", x)} opts={PERTENECE_ASOCIACION} />
          <Txt label="Asociación / Vereda / Cooperativa" v={form.asociacion} set={(x) => set("asociacion", x)} />
          <Sel label="¿Pertenece a algún programa?" v={form.pertenece_programa} set={(x) => set("pertenece_programa", x)} opts={SI_NO} />
          <Txt label="Nombre del programa" v={form.programa} set={(x) => set("programa", x)} />
          <Txt label="NIT asociación o cooperativa" v={form.nit_asociacion} set={(x) => set("nit_asociacion", x)} />
        </Seccion>

        <Seccion titulo="Contacto">
          <Txt label="Contacto" v={form.contacto} set={(x) => set("contacto", x)} />
          <Txt label="Celular" v={form.celular} set={(x) => set("celular", x)} />
          <Sel label="¿WhatsApp?" v={form.whatsapp} set={(x) => set("whatsapp", x)} opts={SI_NO} />
          <Txt label="Email" v={form.email} set={(x) => set("email", x)} />
        </Seccion>

        <Seccion titulo="Producción y calidad">
          <Sel label="Variedad de cacao" v={form.variedad_cacao} set={(x) => set("variedad_cacao", x)} opts={VARIEDAD_CACAO} />
          <Sel label="Tipo de secado" v={form.tipo_secado} set={(x) => set("tipo_secado", x)} opts={TIPO_SECADO} />
          <Num label="Cap. baba mensual (kg)" v={form.cap_baba_mensual} set={(x) => set("cap_baba_mensual", x)} />
          <Num label="Cap. baba anual (kg)" v={form.cap_baba_anual} set={(x) => set("cap_baba_anual", x)} />
          <Num label="Cap. seco mensual (kg)" v={form.cap_seco_mensual} set={(x) => set("cap_seco_mensual", x)} />
          <Num label="Cap. seco anual (kg)" v={form.cap_seco_anual} set={(x) => set("cap_seco_anual", x)} />
          <Num label="Humedad promedio (%)" v={form.humedad} set={(x) => set("humedad", x)} />
          <Num label="# productores a los que compra" v={form.num_productores_compra} set={(x) => set("num_productores_compra", x)} />
          <Txt label="Capacidad de comercialización (Ton/mes o año)" v={form.capacidad_comercializacion} set={(x) => set("capacidad_comercializacion", x)} />
          <Txt label="Municipios de producción (comercializadores)" v={form.municipios_produccion} set={(x) => set("municipios_produccion", x)} />
          <Sel label="Libre de deforestación" v={form.libre_deforestacion} set={(x) => set("libre_deforestacion", x)} opts={LIBRE_DEFORESTACION} className="sm:col-span-2" />
          <Sel label="Libre de trabajo infantil" v={form.libre_trabajo_infantil} set={(x) => set("libre_trabajo_infantil", x)} opts={LIBRE_TRABAJO_INFANTIL} className="sm:col-span-2" />
        </Seccion>

        <Seccion titulo="Datos bancarios">
          <Txt label="Banco / billetera" v={form.banco} set={(x) => set("banco", x)} />
          <Sel label="Tipo de cuenta" v={form.tipo_cuenta} set={(x) => set("tipo_cuenta", x)} opts={TIPO_CUENTA} />
          <Txt label="# de cuenta" v={form.numero_cuenta} set={(x) => set("numero_cuenta", x)} />
          <Sel label="Tipo de documento del titular" v={form.tipo_documento_titular} set={(x) => set("tipo_documento_titular", x)} opts={TIPO_DOCUMENTO} />
          <Txt label="Documento del titular" v={form.cedula_titular} set={(x) => set("cedula_titular", x)} />
          <Txt label="Nombre titular" v={form.nombre_titular} set={(x) => set("nombre_titular", x)} />
          <Sel label="Régimen tributario" v={form.regimen_tributario} set={(x) => set("regimen_tributario", x)} opts={REGIMEN_TRIBUTARIO} />
        </Seccion>

        <Seccion titulo="Certificaciones, sellos y referencias">
          <Checks label="Certificaciones vigentes" opts={certOptions} values={certs} setValues={setCerts} />
          <Checks label="Sellos vigentes" opts={selloOptions} values={sellos} setValues={setSellos} />
          <Txt label="Referencia comercial 1" v={form.referencia_comercial_1} set={(x) => set("referencia_comercial_1", x)} />
          <Txt label="Referencia comercial 2" v={form.referencia_comercial_2} set={(x) => set("referencia_comercial_2", x)} />
          <Sel label="Acepta compromisos éticos" v={form.acepta_compromisos_eticos} set={(x) => set("acepta_compromisos_eticos", x)} opts={SI_NO} />
          <Sel label="Acepta política de datos (Habeas Data)" v={form.acepta_politica_datos} set={(x) => set("acepta_politica_datos", x)} opts={SI_NO} />
          <Sel label="Declara origen lícito de fondos (SARLAFT)" v={form.declara_origen_licito} set={(x) => set("declara_origen_licito", x)} opts={SI_NO} />
          <Sel label="Autoriza verificación de datos" v={form.autoriza_verificacion} set={(x) => set("autoriza_verificacion", x)} opts={SI_NO} />
        </Seccion>
      </div>
    </Modal>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold uppercase tracking-wide text-accent-soft-fg">{titulo}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Txt({ label, v, set }: { label: string; v: string; set: (x: string) => void }) {
  return (
    <Field label={label}>
      <Input value={v ?? ""} onChange={(e) => set(e.target.value)} />
    </Field>
  );
}

function Num({ label, v, set }: { label: string; v: string; set: (x: string) => void }) {
  return (
    <Field label={label}>
      <Input type="number" step="any" value={v ?? ""} onChange={(e) => set(e.target.value)} className="font-mono tnum" />
    </Field>
  );
}

function Sel({
  label, v, set, opts, disabled, className,
}: {
  label: string; v: string; set: (x: string) => void; opts: string[]; disabled?: boolean; className?: string;
}) {
  return (
    <Field label={label} className={className}>
      <Select value={v ?? ""} onChange={(e) => set(e.target.value)} disabled={disabled}>
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </Select>
    </Field>
  );
}

function Checks({
  label, opts, values, setValues,
}: {
  label: string; opts: string[]; values: string[]; setValues: (v: string[]) => void;
}) {
  const toggle = (o: string) =>
    setValues(values.includes(o) ? values.filter((x) => x !== o) : [...values, o]);
  return (
    <div className="sm:col-span-2">
      <p className="mb-1.5 text-[13px] font-medium text-fg-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              values.includes(o)
                ? "border-accent bg-accent text-accent-fg"
                : "border-border text-fg-muted hover:border-accent/50",
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
