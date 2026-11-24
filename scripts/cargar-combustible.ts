/**
 * Carga histórica de riego, equipos y combustible (0120) desde la
 * «Planilla Control Operacion combustible riego».
 *
 *   pnpm tsx scripts/cargar-combustible.ts <planilla.xlsx>             → solo muestra
 *   pnpm tsx scripts/cargar-combustible.ts <planilla.xlsx> --escribir  → escribe
 *
 * Recargable: cada fila lleva `ref_hoja` («diesel:12», «riego:455»,
 * «guadana:14»…) y se reemplaza en su sitio; lo que ya no está en la hoja se
 * borra. Lo registrado desde la app (`origen = 'app'`) no se toca.
 *
 * La lectura está en `src/lib/finca/combustible-hoja.ts` (con sus tests).
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { clave } from "../src/lib/finca/hoja";
import {
  leerCompras,
  leerEquipo,
  leerRiego,
  type UsoHoja,
} from "../src/lib/finca/combustible-hoja";

config({ path: ".env.local" });

const archivo = process.argv[2];
const escribir = process.argv.includes("--escribir");
if (!archivo) {
  console.error("Uso: pnpm tsx scripts/cargar-combustible.ts <planilla.xlsx> [--escribir]");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (escribir && (!url || !serviceKey)) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const wb = XLSX.readFile(archivo);
function hoja(nombre: string): { filas: unknown[][]; offset: number } {
  const ws = wb.Sheets[nombre];
  if (!ws) throw new Error(`El archivo no trae la hoja «${nombre}»`);
  const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
  // Fila de Excel del índice 0 (RIEGO empieza en A1; las de equipo en B3).
  const offset = XLSX.utils.decode_range(ws["!ref"] ?? "A1").s.r + 1;
  return { filas, offset };
}

// ── Leer ────────────────────────────────────────────────────────────────────
const diesel = leerCompras(hoja("DIESEL").filas, "acpm");
const gasolina = leerCompras(hoja("GASOLINA").filas, "gasolina");
const riego = leerRiego(hoja("RIEGO").filas);

/** Hoja de la planilla → código de equipo (0120) y prefijo de ref_hoja. */
const HOJAS_EQUIPO: { hoja: string; equipo: string }[] = [
  { hoja: "guadaña", equipo: "guadana" },
  { hoja: "Motorierra Bauker", equipo: "motosierra" },
  { hoja: "Bombas de Motor", equipo: "bombas" },
  { hoja: "eatacionaria", equipo: "planta" },
];
const equipos = HOJAS_EQUIPO.filter((h) => wb.Sheets[h.hoja]).map((h) => {
  const { filas, offset } = hoja(h.hoja);
  return { ...h, usos: leerEquipo(filas, offset) };
});

// ── Resumen ─────────────────────────────────────────────────────────────────
const sum = (xs: (number | null)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);
const rango = (fs: string[]) => {
  const s = [...fs].sort();
  return s.length ? `${s[0]} → ${s.at(-1)}` : "—";
};
for (const [n, cs] of [["ACPM", diesel], ["Gasolina", gasolina]] as const) {
  console.log(
    `${n}: ${cs.length} compras (${rango(cs.map((c) => c.fecha))}), ${sum(cs.map((c) => c.galones)).toFixed(1)} gal, $${sum(cs.map((c) => c.valor)).toLocaleString("es-CO")}, ${cs.filter((c) => c.dudas.length).length} por revisar`,
  );
}
console.log(
  `Riego: ${riego.length} tramos (${rango(riego.map((u) => u.fecha))}), ${sum(riego.map((u) => u.horas)).toFixed(1)} h, carga al motor ${sum(riego.map((u) => u.carga_galones)).toFixed(1)} gal, ${riego.filter((u) => u.dudas.length).length} por revisar`,
);
for (const e of equipos) {
  console.log(
    `${e.hoja}: ${e.usos.length} usos (${rango(e.usos.map((u) => u.fecha))}), ${sum(e.usos.map((u) => u.horas)).toFixed(1)} h, ${e.usos.filter((u) => u.dudas.length).length} por revisar`,
  );
}
const todasDudas = [
  ...diesel.map((c) => [`diesel:${c.fila}`, c.fecha, c.dudas] as const),
  ...gasolina.map((c) => [`gasolina:${c.fila}`, c.fecha, c.dudas] as const),
  ...riego.map((u) => [`riego:${u.fila}`, u.fecha, u.dudas] as const),
  ...equipos.flatMap((e) => e.usos.map((u) => [`${e.equipo}:${u.fila}`, u.fecha, u.dudas] as const)),
].filter(([, , d]) => d.length);
if (todasDudas.length) {
  console.log("\nPor revisar:");
  for (const [ref, f, d] of todasDudas) console.log(`  ${ref.padEnd(16)} ${f}  ${d.join(" · ")}`);
}

if (!escribir) {
  console.log("\nNada escrito. Agrega --escribir para cargar.");
  process.exit(0);
}

// ── Escribir ────────────────────────────────────────────────────────────────
const db = createClient(url!, serviceKey!, { auth: { persistSession: false } });

async function enTandas<T>(
  filas: T[],
  fn: (tanda: T[]) => PromiseLike<{ error: { message: string } | null }>,
) {
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await fn(filas.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
}

/** Borra las filas de hoja cuyo ref_hoja ya no viene en el archivo. */
async function borrarSobrantes(tabla: string, vigentes: Set<string>) {
  const { data, error } = await db
    .from(tabla)
    .select("id, ref_hoja")
    .eq("origen", "hoja")
    .order("id")
    .range(0, 9999);
  if (error) throw new Error(`${tabla}: ${error.message}`);
  if ((data ?? []).length >= 10000) throw new Error(`${tabla}: más de 10.000 filas, paginar.`);
  const sobran = (data ?? []).filter((p) => !vigentes.has(p.ref_hoja as string)).map((p) => p.id as string);
  if (sobran.length) await enTandas(sobran, (t) => db.from(tabla).delete().in("id", t));
  return sobran.length;
}

async function main() {
  const { data: eqs, error: e1 } = await db.from("finca_equipos").select("id, codigo");
  if (e1) throw new Error(e1.message);
  const equipoId = new Map((eqs ?? []).map((e) => [e.codigo as string, e.id as string]));
  const { data: emps, error: e2 } = await db.from("finca_empleados").select("id, nombre");
  if (e2) throw new Error(e2.message);
  const empleadoId = new Map((emps ?? []).map((e) => [clave(e.nombre as string), e.id as string]));

  // Compras
  const compras = [
    ...diesel.map((c) => ({ c, ref: `diesel:${c.fila}` })),
    ...gasolina.map((c) => ({ c, ref: `gasolina:${c.fila}` })),
  ].map(({ c, ref }) => ({
    fecha: c.fecha,
    combustible: c.combustible,
    recibo: c.recibo,
    galones: c.galones,
    precio_galon: c.precio_galon,
    valor: c.valor,
    proveedor: c.proveedor,
    destino: c.destino,
    observaciones: c.observaciones,
    origen: "hoja",
    ref_hoja: ref,
    dudoso: c.dudas.length > 0,
    motivo_duda: c.dudas.join(" · ") || null,
    original: c.original,
    created_by: null,
  }));
  await enTandas(compras, (t) =>
    db.from("finca_combustible_compras").upsert(t, { onConflict: "ref_hoja" }),
  );
  const borradasC = await borrarSobrantes(
    "finca_combustible_compras",
    new Set(compras.map((c) => c.ref_hoja)),
  );

  // Usos
  const fila = (u: UsoHoja, equipo: string, ref: string) => {
    const id = equipoId.get(equipo);
    if (!id) throw new Error(`Falta el equipo «${equipo}» (¿se aplicó 0120?)`);
    return {
      fecha: u.fecha,
      equipo_id: id,
      actividad: u.actividad,
      valvulas: u.valvulas,
      sitio: u.sitio,
      hora_inicio: u.hora_inicio,
      hora_fin: u.hora_fin,
      horas: u.horas,
      carga_galones: u.carga_galones,
      empleado_id: u.empleado ? (empleadoId.get(clave(u.empleado)) ?? null) : null,
      observaciones: u.observaciones,
      origen: "hoja",
      ref_hoja: ref,
      dudoso: u.dudas.length > 0,
      motivo_duda: u.dudas.join(" · ") || null,
      original: u.original,
      registrado_por: null,
    };
  };
  const usos = [
    ...riego.map((u) => fila(u, "motor-riego", `riego:${u.fila}`)),
    ...equipos.flatMap((e) => e.usos.map((u) => fila(u, e.equipo, `${e.equipo}:${u.fila}`))),
  ];
  await enTandas(usos, (t) => db.from("finca_equipo_usos").upsert(t, { onConflict: "ref_hoja" }));
  const borradosU = await borrarSobrantes("finca_equipo_usos", new Set(usos.map((u) => u.ref_hoja)));

  console.log(
    `\nEscrito: ${compras.length} compras, ${usos.length} usos de equipo. Borrados de la hoja: ${borradasC} compras, ${borradosU} usos.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
