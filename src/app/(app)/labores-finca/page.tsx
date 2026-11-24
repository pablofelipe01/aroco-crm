import { AlertTriangle, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { todas } from "@/lib/supabase/todas";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { LaboresFincaClient } from "./labores-finca-client";
import type { CompraTabla, UsoTabla } from "./riego-combustible";

export const dynamic = "force-dynamic";

export type Categoria =
  | "cosecha"
  | "poscosecha"
  | "cultivo"
  | "riego"
  | "sanidad"
  | "mantenimiento"
  | "administracion"
  | "ausencia";

export type RegistroVista = {
  id: string;
  fecha: string;
  empleado: string | null;
  empleadoId: string | null;
  laborId: string;
  labor: string;
  categoria: Categoria;
  valvulas: string[];
  sitio: string | null;
  horaInicio: string | null;
  horaFin: string | null;
  horas: number | null;
  cantidad: number | null;
  unidad: string | null;
  sanas: number | null;
  pasador: number | null;
  negras: number | null;
  observaciones: string | null;
  dudoso: boolean;
  motivoDuda: string | null;
  refHoja: string | null;
  origen: "hoja" | "app";
  /** Tocado a mano en el CRM (0119): la recarga de la hoja ya no lo pisa. */
  editado: boolean;
  /** Anulado: no cuenta en ninguna suma. */
  anulado: { en: string; motivo: string | null } | null;
};

export type BacheVista = {
  numero: number;
  valvulas: string | null;
  calidad: string | null;
  fechaInicio: string | null;
  pesoBaba: number | null;
  pesoFermentado: number | null;
  pesoFinal: number | null;
  fechaFin: string | null;
  fechaDespacho: string | null;
  observaciones: string | null;
  dudoso: boolean;
  motivoDuda: string | null;
};

export type LaborVista = {
  id: string;
  nombre: string;
  categoria: Categoria;
  unidad: string | null;
  usos: number;
};
export type EmpleadoVista = {
  id: string;
  nombre: string;
  registros: number;
  ultimo: string | null;
};
export type ValvulaVista = { codigo: string; registros: number };

const n = (v: number | string | null): number | null =>
  v == null ? null : Number(v);
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export default async function LaboresFincaPage() {
  const session = await getSessionContext();

  // El menú ya lo esconde, pero la ruta se puede escribir a mano. El candado
  // real es la RLS de 0117 (is_direccion); esto solo evita una página vacía
  // que parezca un error.
  if (session?.profile?.department !== "Dirección") {
    return (
      <div>
        <PageHeader title="Labores Finca" />
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title="Acceso restringido"
          description="Por ahora Labores Finca es solo para Dirección."
        />
      </div>
    );
  }

  const supabase = await createClient();
  let datos;
  try {
    datos = await Promise.all([
      todas((d, h) =>
        supabase
          .from("finca_empleados")
          .select("id, nombre")
          .order("nombre")
          .order("id")
          .range(d, h),
      ),
      todas((d, h) =>
        supabase
          .from("finca_labores")
          .select("id, nombre, categoria, unidad")
          .order("nombre")
          .range(d, h),
      ),
      todas((d, h) =>
        supabase
          .from("finca_valvulas")
          .select("codigo, orden")
          .order("orden")
          .range(d, h),
      ),
      todas((d, h) =>
        supabase
          .from("finca_registros")
          .select(
            "id, fecha, empleado_id, labor_id, valvulas, sitio, hora_inicio, hora_fin, horas, cantidad, unidad, sanas, pasador_monilia, negras, observaciones, dudoso, motivo_duda, ref_hoja, origen, editado_en, anulado_en, motivo_anulacion",
          )
          .order("fecha", { ascending: false })
          .order("id")
          .range(d, h),
      ),
      todas((d, h) =>
        supabase
          .from("finca_baches")
          .select("*")
          .order("numero", { ascending: false })
          .range(d, h),
      ),
      // 0120 — riego, equipos y combustible.
      todas((d, h) =>
        supabase
          .from("finca_equipos")
          .select("id, codigo, nombre, combustible, consumo_gal_h")
          .order("codigo")
          .range(d, h),
      ),
      todas((d, h) =>
        supabase
          .from("finca_combustible_compras")
          .select(
            "id, fecha, combustible, recibo, galones, precio_galon, valor, proveedor, destino, observaciones, dudoso, motivo_duda, ref_hoja",
          )
          .order("fecha", { ascending: false })
          .order("id")
          .range(d, h),
      ),
      todas((d, h) =>
        supabase
          .from("finca_equipo_usos")
          .select(
            "id, fecha, equipo_id, actividad, valvulas, sitio, horas, carga_galones, observaciones, dudoso, motivo_duda, ref_hoja",
          )
          .order("fecha", { ascending: false })
          .order("id")
          .range(d, h),
      ),
    ]);
  } catch (e) {
    return (
      <div>
        <PageHeader title="Labores Finca" />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="No se pudieron cargar las labores"
          description={e instanceof Error ? e.message : "Error desconocido"}
        />
      </div>
    );
  }
  const [empleados, labores, valvulas, registros, baches, equipos, compras, usos] = datos;
  const codigoEquipo = new Map(equipos.map((e) => [e.id, e.codigo]));
  const comprasVista: CompraTabla[] = compras.map((c) => ({
    id: c.id,
    fecha: c.fecha,
    combustible: c.combustible,
    recibo: c.recibo,
    galones: n(c.galones),
    precio: n(c.precio_galon),
    valor: n(c.valor),
    proveedor: c.proveedor,
    destino: c.destino,
    observaciones: c.observaciones,
    dudoso: c.dudoso,
    motivoDuda: c.motivo_duda,
    refHoja: c.ref_hoja,
  }));
  const usosVista: UsoTabla[] = usos.map((u) => ({
    id: u.id,
    fecha: u.fecha,
    equipo: codigoEquipo.get(u.equipo_id) ?? "—",
    actividad: u.actividad,
    valvulas: u.valvulas ?? [],
    sitio: u.sitio,
    horas: n(u.horas),
    carga: n(u.carga_galones),
    observaciones: u.observaciones,
    dudoso: u.dudoso,
    motivoDuda: u.motivo_duda,
    refHoja: u.ref_hoja,
  }));

  const nombreEmpleado = new Map(empleados.map((e) => [e.id, e.nombre]));
  const laborPorId = new Map(labores.map((l) => [l.id, l]));

  const regs: RegistroVista[] = registros.map((r) => {
    const l = laborPorId.get(r.labor_id);
    return {
      id: r.id,
      fecha: r.fecha,
      empleado: r.empleado_id
        ? (nombreEmpleado.get(r.empleado_id) ?? null)
        : null,
      empleadoId: r.empleado_id,
      laborId: r.labor_id,
      labor: l?.nombre ?? "—",
      categoria: (l?.categoria ?? "mantenimiento") as Categoria,
      valvulas: r.valvulas ?? [],
      sitio: r.sitio,
      horaInicio: hhmm(r.hora_inicio),
      horaFin: hhmm(r.hora_fin),
      horas: n(r.horas),
      cantidad: n(r.cantidad),
      unidad: r.unidad,
      sanas: n(r.sanas),
      pasador: n(r.pasador_monilia),
      negras: n(r.negras),
      observaciones: r.observaciones,
      dudoso: r.dudoso,
      motivoDuda: r.motivo_duda,
      refHoja: r.ref_hoja,
      origen: r.origen === "app" ? "app" : "hoja",
      editado: r.editado_en != null,
      anulado: r.anulado_en
        ? { en: r.anulado_en, motivo: r.motivo_anulacion }
        : null,
    };
  });

  const usosLabor = new Map<string, number>();
  const porEmpleado = new Map<
    string,
    { registros: number; ultimo: string | null }
  >();
  const porValvula = new Map<string, number>();
  for (const r of registros) {
    if (r.anulado_en) continue;
    usosLabor.set(r.labor_id, (usosLabor.get(r.labor_id) ?? 0) + 1);
    if (r.empleado_id) {
      const e = porEmpleado.get(r.empleado_id) ?? {
        registros: 0,
        ultimo: null,
      };
      e.registros++;
      if (!e.ultimo || r.fecha > e.ultimo) e.ultimo = r.fecha;
      porEmpleado.set(r.empleado_id, e);
    }
    for (const v of r.valvulas ?? [])
      porValvula.set(v, (porValvula.get(v) ?? 0) + 1);
  }

  return (
    <LaboresFincaClient
      registros={regs.filter((r) => !r.anulado)}
      anulados={regs.filter((r) => r.anulado)}
      baches={baches.map((b) => ({
        numero: b.numero,
        valvulas: b.valvulas_texto,
        calidad: b.calidad,
        fechaInicio: b.fecha_inicio,
        pesoBaba: n(b.peso_baba),
        pesoFermentado: n(b.peso_fermentado),
        pesoFinal: n(b.peso_final),
        fechaFin: b.fecha_fin,
        fechaDespacho: b.fecha_despacho,
        observaciones: b.observaciones,
        dudoso: b.dudoso,
        motivoDuda: b.motivo_duda,
      }))}
      labores={labores.map((l) => ({
        id: l.id,
        nombre: l.nombre,
        categoria: l.categoria as Categoria,
        unidad: l.unidad,
        usos: usosLabor.get(l.id) ?? 0,
      }))}
      empleados={empleados.map((e) => ({
        id: e.id,
        nombre: e.nombre,
        registros: porEmpleado.get(e.id)?.registros ?? 0,
        ultimo: porEmpleado.get(e.id)?.ultimo ?? null,
      }))}
      combustible={{
        compras: comprasVista,
        usos: usosVista,
        equipos: equipos.map((e) => ({
          codigo: e.codigo,
          nombre: e.nombre,
          combustible: e.combustible,
          consumoGalH: n(e.consumo_gal_h),
        })),
      }}
      valvulas={valvulas.map((v) => ({
        codigo: v.codigo,
        registros: porValvula.get(v.codigo) ?? 0,
      }))}
    />
  );
}
