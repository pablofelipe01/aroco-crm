/**
 * Carga histórica de Labores Finca desde el «REPORTE DIARIO 2026 FINCA».
 *
 *   pnpm tsx scripts/cargar-finca.ts <reporte.xlsx>             → solo muestra
 *   pnpm tsx scripts/cargar-finca.ts <reporte.xlsx> --escribir  → escribe
 *
 * Se puede correr otra vez con el archivo actualizado: cada fila lleva
 * `ref_hoja` («diario:<fila>», «mayo:<fecha>») y se reemplaza en su sitio. Las
 * filas de la hoja que ya no existen se borran; lo capturado desde la app
 * (`origen = 'app'`) no se toca nunca.
 *
 * La lectura y la limpieza están en `src/lib/finca/hoja.ts` (con sus tests);
 * aquí solo se lee el archivo y se escribe.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import {
  catalogoLabores,
  clave,
  leerDesgraneMayo,
  leerFilaBache,
  leerFilaRegistro,
  type LaborCanonica,
} from "../src/lib/finca/hoja";

config({ path: ".env.local" });

const archivo = process.argv[2];
const escribir = process.argv.includes("--escribir");
if (!archivo) {
  console.error(
    "Uso: pnpm tsx scripts/cargar-finca.ts <reporte.xlsx> [--escribir]",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (escribir && (!url || !serviceKey)) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}

const wb = XLSX.readFile(archivo);
const hoja = (nombre: string) => {
  const ws = wb.Sheets[nombre];
  if (!ws) throw new Error(`El archivo no trae la hoja «${nombre}»`);
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: true,
  });
};

// ── Leer ────────────────────────────────────────────────────────────────────
const diario = hoja("Reporte Labores x Empleado");
const registros = diario
  .map((r, i) => leerFilaRegistro(r, i + 1))
  .filter((r) => r !== null);
const sinFecha = diario.filter(
  (r, i) => i > 2 && r[6] && r[7] && leerFilaRegistro(r, i + 1) === null,
).length;

const baches = hoja("Poscosecha")
  .map(leerFilaBache)
  .filter((b) => b !== null);
const mayo = wb.Sheets["Cosecha Mayo"]
  ? leerDesgraneMayo(hoja("Cosecha Mayo"))
  : [];

// Catálogo: el fijo más cualquier labor nueva que traiga la hoja.
const labores = new Map<string, LaborCanonica>();
for (const l of catalogoLabores()) labores.set(l.nombre, l);
for (const r of registros)
  if (!labores.has(r.labor.nombre)) labores.set(r.labor.nombre, r.labor);
const empleados = [...new Set(registros.map((r) => r.empleado))].sort();

// ── Resumen ─────────────────────────────────────────────────────────────────
const dudosos = registros.filter((r) => r.dudas.length);
const fechas = registros.map((r) => r.fecha).sort();
console.log(
  `Reporte diario: ${registros.length} registros (${fechas[0]} → ${fechas.at(-1)})`,
);
if (sinFecha) console.log(`  · ${sinFecha} fila(s) sin fecha, no se cargan`);
console.log(`  · ${dudosos.length} por revisar`);
console.log(`Trabajadores: ${empleados.length} — ${empleados.join(", ")}`);
console.log(
  `Labores: ${labores.size} en catálogo, ${new Set(registros.map((r) => r.labor.nombre)).size} usadas`,
);
console.log(
  `Poscosecha: ${baches.length} baches (${baches.filter((b) => b.dudas.length).length} por revisar)`,
);
console.log(`Desgrane de mayo sin trabajador: ${mayo.length} días`);

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

async function main() {
  // Trabajadores
  {
    const { error } = await db.from("finca_empleados").upsert(
      empleados.map((nombre) => ({ nombre, clave: clave(nombre) })),
      { onConflict: "clave" },
    );
    if (error) throw new Error(`empleados: ${error.message}`);
  }
  const { data: emp, error: e1 } = await db
    .from("finca_empleados")
    .select("id, clave");
  if (e1) throw new Error(e1.message);
  const idEmpleado = new Map(
    (emp ?? []).map((e) => [e.clave as string, e.id as string]),
  );

  // Labores: solo se agregan las que faltan; la categoría o unidad que alguien
  // ya ajustó en el CRM no se pisa.
  {
    const { error } = await db
      .from("finca_labores")
      .upsert([...labores.values()], {
        onConflict: "nombre",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`labores: ${error.message}`);
  }
  const { data: lab, error: e2 } = await db
    .from("finca_labores")
    .select("id, nombre");
  if (e2) throw new Error(e2.message);
  const idLabor = new Map(
    (lab ?? []).map((l) => [l.nombre as string, l.id as string]),
  );

  const filas = registros.map((r) => ({
    ref_hoja: `diario:${r.filaHoja}`,
    fecha: r.fecha,
    empleado_id: idEmpleado.get(clave(r.empleado))!,
    labor_id: idLabor.get(r.labor.nombre)!,
    valvulas: r.valvulas,
    sitio: r.sitio,
    hora_inicio: r.horaInicio,
    hora_fin: r.horaFin,
    horas: r.horas,
    cantidad: r.cantidad,
    unidad: r.unidad,
    sanas: r.sanas,
    pasador_monilia: r.pasadorMonilia,
    negras: r.negras,
    observaciones: r.observaciones,
    origen: "hoja",
    dudoso: r.dudas.length > 0,
    motivo_duda: r.dudas.join(" · ") || null,
    original: r.original,
    registrado_por: null,
  }));

  const desgrane = idLabor.get("Desgrane")!;
  for (const d of mayo) {
    filas.push({
      ref_hoja: `mayo:${d.fecha}`,
      fecha: d.fecha,
      empleado_id: null as unknown as string,
      labor_id: desgrane,
      valvulas: [],
      sitio: null,
      hora_inicio: null,
      hora_fin: null,
      horas: null,
      cantidad: (d.kgA ?? 0) + (d.kgC ?? 0),
      unidad: "kg",
      sanas: d.kgA,
      pasador_monilia: null,
      negras: d.kgC,
      observaciones:
        "Resumen diario de la hoja «Cosecha Mayo», sin detalle por trabajador",
      origen: "hoja",
      dudoso: d.duda != null,
      motivo_duda: d.duda,
      original: {},
      registrado_por: null,
    });
  }

  await enTandas(filas, (t) =>
    db.from("finca_registros").upsert(t, { onConflict: "ref_hoja" }),
  );

  // Lo que estaba en la hoja y ya no está.
  const vigentes = new Set(filas.map((f) => f.ref_hoja));
  const { data: previas, error: e3 } = await db
    .from("finca_registros")
    .select("id, ref_hoja")
    .eq("origen", "hoja")
    .order("id")
    .range(0, 9999);
  if (e3) throw new Error(e3.message);
  const sobran = (previas ?? [])
    .filter((p) => !vigentes.has(p.ref_hoja as string))
    .map((p) => p.id as string);
  if (sobran.length) {
    await enTandas(sobran, (t) =>
      db.from("finca_registros").delete().in("id", t),
    );
  }

  await enTandas(
    baches.map((b) => ({
      numero: b.numero,
      valvulas_texto: b.valvulasTexto,
      variedad: b.variedad,
      calidad: b.calidad,
      fecha_inicio: b.fechaInicio,
      peso_baba: b.pesoBaba,
      fecha_salida_secado: b.fechaSalidaSecado,
      peso_fermentado: b.pesoFermentado,
      peso_final: b.pesoFinal,
      fecha_fin: b.fechaFin,
      fecha_despacho: b.fechaDespacho,
      peso_salida: b.pesoSalida,
      observaciones: b.observaciones,
      origen: "hoja",
      dudoso: b.dudas.length > 0,
      motivo_duda: b.dudas.join(" · ") || null,
      original: b.original,
      created_by: null,
    })),
    (t) => db.from("finca_baches").upsert(t, { onConflict: "numero" }),
  );

  console.log(
    `\nEscrito: ${filas.length} registros, ${baches.length} baches. Borrados de la hoja: ${sobran.length}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
