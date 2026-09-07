import { createClient } from "@/lib/supabase/server";
import { TrazabilidadClient } from "./trazabilidad-client";

export const dynamic = "force-dynamic";

export type LugarPunto = {
  id: string;
  tipo: "bodega" | "municipio" | "vereda";
  nombre: string;
  lat: number | null;
  lng: number | null;
  fuente: string | null;
};

export type VeredaEnAcopio = {
  id: string | null;
  nombre: string;
  productores: number;
  kg: number;
  lat: number | null;
  lng: number | null;
};

export type EntregaVista = {
  id: string;
  productor: string;
  cedula: string | null;
  tipoProductor: string | null;
  vereda: string | null;
  calidad: string | null;
  kg: number;
  totalVenta: number | null;
};

export type AcopioVista = {
  id: string;
  fecha: string;
  ruta: number;
  rutaEtiqueta: string;
  municipios: LugarPunto[];
  kgPrimera: number;
  kgSegunda: number;
  kgTotal: number;
  productores: number;
  totalVenta: number;
  loteId: string | null;
  loteCodigo: string | null;
  loteKg: number | null;
  loteFecha: string | null;
  enlazadoEn: string | null;
  veredas: VeredaEnAcopio[];
  entregas: EntregaVista[];
};

export type LoteOpcion = {
  id: string;
  code: string;
  entry_date: string | null;
  qty_in_kg: number;
  recepcion: string | null;
  /** Ruta que trae el propio código del lote, para sugerir el enlace. */
  ruta: number | null;
};

const n = (v: number | string | null): number => Number(v ?? 0) || 0;

/** «CISCA ruta #3 (Guachene - villa rica )» → 3. */
function rutaDelCodigo(code: string | null): number | null {
  const m = /ruta\s*#?\s*(\d+)/i.exec(code ?? "");
  return m ? Number(m[1]) : null;
}

export default async function TrazabilidadPage() {
  const supabase = await createClient();

  /**
   * Todo en consultas PLANAS, sin anidar.
   *
   * PostgREST sabe seguir las llaves foráneas, pero los tipos generados de
   * estas tablas no traen sus relaciones y el anidado obligaba a un `as
   * unknown as` en cada consulta. Un cast así apaga justamente la
   * comprobación que evita leer un campo que no existe. Son cuatro consultas
   * más contra tablas de decenas de filas.
   */
  const [
    { data: acopios },
    { data: entregas },
    { data: rutas },
    { data: rutaMunicipios },
    { data: lugares },
    { data: lotes },
  ] = await Promise.all([
    supabase
      .from("trazabilidad_acopios")
      .select(
        "id, fecha, ruta, kg_primera, kg_segunda, kg_total, productores, total_venta, lote_id, enlazado_en",
      )
      .order("fecha", { ascending: false }),
    supabase
      .from("trazabilidad_entregas")
      .select(
        "id, acopio_id, productor, cedula, tipo_productor, vereda_cruda, vereda_id, calidad, kg_primera, kg_segunda, total_venta",
      ),
    supabase.from("trazabilidad_rutas").select("numero, etiqueta").order("numero"),
    supabase.from("trazabilidad_ruta_municipios").select("ruta, lugar_id"),
    supabase
      .from("trazabilidad_lugares")
      .select("id, tipo, nombre, lat, lng, fuente")
      .order("nombre"),
    // Solo los lotes que traen «ruta» en el código: son los de CISCA y los
    // únicos a los que un acopio puede corresponder. Ofrecer los 500 del
    // inventario convertiría el enlace en una búsqueda a ciegas.
    supabase
      .from("inventory_lots")
      .select("id, code, entry_date, qty_in_kg, recepcion")
      .ilike("code", "%ruta%")
      .order("entry_date", { ascending: false, nullsFirst: false }),
  ]);

  const porId = new Map<string, LugarPunto>(
    (lugares ?? []).map((l) => [
      l.id,
      {
        id: l.id,
        tipo: l.tipo as LugarPunto["tipo"],
        nombre: l.nombre,
        lat: l.lat === null ? null : Number(l.lat),
        lng: l.lng === null ? null : Number(l.lng),
        fuente: l.fuente,
      },
    ]),
  );

  const municipiosDeRuta = new Map<number, LugarPunto[]>();
  for (const rm of rutaMunicipios ?? []) {
    const lugar = porId.get(rm.lugar_id);
    if (!lugar) continue;
    municipiosDeRuta.set(rm.ruta, [...(municipiosDeRuta.get(rm.ruta) ?? []), lugar]);
  }

  const etiquetaDeRuta = new Map((rutas ?? []).map((r) => [r.numero, r.etiqueta]));
  const lotePorId = new Map((lotes ?? []).map((l) => [l.id, l]));

  const entregasDeAcopio = new Map<string, typeof entregas>();
  for (const e of entregas ?? []) {
    entregasDeAcopio.set(e.acopio_id, [...(entregasDeAcopio.get(e.acopio_id) ?? []), e]);
  }

  const vista: AcopioVista[] = (acopios ?? []).map((a) => {
    const suyas = entregasDeAcopio.get(a.id) ?? [];
    const lote = a.lote_id ? lotePorId.get(a.lote_id) : null;

    // Kilos y productores por vereda: alimenta el mapa y la cadena de la
    // pantalla con el mismo cálculo, para que no puedan discrepar.
    const porVereda = new Map<string, VeredaEnAcopio>();
    for (const e of suyas) {
      const lugar = e.vereda_id ? porId.get(e.vereda_id) : null;
      const clave = lugar?.id ?? e.vereda_cruda ?? "—";
      const acc: VeredaEnAcopio = porVereda.get(clave) ?? {
        id: lugar?.id ?? null,
        nombre: lugar?.nombre ?? e.vereda_cruda ?? "Sin vereda",
        productores: 0,
        kg: 0,
        lat: lugar?.lat ?? null,
        lng: lugar?.lng ?? null,
      };
      acc.productores += 1;
      acc.kg += n(e.kg_primera) + n(e.kg_segunda);
      porVereda.set(clave, acc);
    }

    return {
      id: a.id,
      fecha: a.fecha,
      ruta: a.ruta,
      rutaEtiqueta: etiquetaDeRuta.get(a.ruta) ?? `Ruta ${a.ruta}`,
      municipios: municipiosDeRuta.get(a.ruta) ?? [],
      kgPrimera: n(a.kg_primera),
      kgSegunda: n(a.kg_segunda),
      kgTotal: n(a.kg_total),
      productores: a.productores,
      totalVenta: n(a.total_venta),
      loteId: a.lote_id,
      loteCodigo: lote?.code ?? null,
      loteKg: lote ? n(lote.qty_in_kg) : null,
      loteFecha: lote?.entry_date ?? null,
      enlazadoEn: a.enlazado_en,
      veredas: [...porVereda.values()]
        .map((v) => ({ ...v, kg: Math.round(v.kg * 100) / 100 }))
        .sort((x, y) => y.kg - x.kg),
      entregas: suyas
        .map((e) => ({
          id: e.id,
          productor: e.productor,
          cedula: e.cedula,
          tipoProductor: e.tipo_productor,
          vereda: e.vereda_id
            ? (porId.get(e.vereda_id)?.nombre ?? e.vereda_cruda)
            : e.vereda_cruda,
          calidad: e.calidad,
          kg: Math.round((n(e.kg_primera) + n(e.kg_segunda)) * 100) / 100,
          totalVenta: e.total_venta === null ? null : n(e.total_venta),
        }))
        .sort((x, y) => y.kg - x.kg),
    };
  });

  const bodega = [...porId.values()].find((l) => l.tipo === "bodega") ?? null;
  const veredas = [...porId.values()].filter((l) => l.tipo === "vereda");

  return (
    <TrazabilidadClient
      acopios={vista}
      bodega={bodega}
      veredas={veredas}
      lotes={(lotes ?? []).map((l) => ({
        id: l.id,
        code: l.code,
        entry_date: l.entry_date,
        qty_in_kg: n(l.qty_in_kg),
        recepcion: l.recepcion,
        ruta: rutaDelCodigo(l.code),
      }))}
    />
  );
}
