/**
 * Aplica el organigrama de AROCO al CRM: árbol de mando, áreas y niveles de
 * acceso. Idempotente — se puede volver a correr cuando cambie el equipo.
 *
 *   pnpm tsx scripts/setup-jerarquia.ts [--dry]
 *
 * Requiere las migraciones 0047 y 0048 aplicadas.
 *
 * Niveles:
 *   admin       SuperAdmin, acceso total.
 *   admin_view  ve las tareas de todas las áreas, no administra.
 *   member      lo suyo y su rama del organigrama.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/types/database";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const dry = process.argv.includes("--dry");
const db = createClient<Database>(url, key, { auth: { persistSession: false } });

type Dept = Database["public"]["Enums"]["department"];
type Role = Database["public"]["Enums"]["user_role"];

type Persona = {
  /** Nombre con el que queda la ficha de equipo. */
  nombre: string;
  /** Ficha existente a la que corresponde. null = hay que crearla. */
  ficha: string | null;
  /** Correo de la cuenta, si tiene. Sirve para enlazar ficha ↔ perfil. */
  correo?: string;
  cargo: string;
  area: Dept;
  /** Nombre del jefe directo. null solo en la raíz. */
  jefe: string | null;
  nivel?: Role;
};

// El organigrama, tal cual, en un solo lugar.
const ORGANIGRAMA: Persona[] = [
  { nombre: "Álvaro Acosta", ficha: "Álvaro Acosta", correo: "alvaro.acosta@aroco.co", cargo: "Gerente General", area: "Dirección", jefe: null, nivel: "admin" },

  { nombre: "Ángela María Acosta", ficha: "Ángela María Acosta", correo: "angela.acosta@aroco.co", cargo: "Gerente Producción Finca", area: "Finca", jefe: "Álvaro Acosta", nivel: "admin" },
  { nombre: "Juan Carlos García", ficha: "Juan Carlos", correo: "fincaelmilagro@aroco.co", cargo: "Coordinador Producción", area: "Finca", jefe: "Ángela María Acosta", nivel: "member" },

  // Gerencia de Operaciones vacante (TBD): su equipo sube a Álvaro.
  { nombre: "John Saenz", ficha: "John Saenz", correo: "jesc.saenz@gmail.com", cargo: "Coord. QA/QC", area: "Operaciones", jefe: "Álvaro Acosta", nivel: "member" },
  { nombre: "Juan David Alarcón", ficha: "Juan David Alarcón", correo: "bodegabogota@aroco.co", cargo: "Aux. Calidad y Bodega Central Bogotá", area: "Bodega Central", jefe: "Álvaro Acosta", nivel: "member" },
  { nombre: "Fernando Mejía Paz", ficha: "Fernando Mejía Paz", correo: "fernandojosemejiapaz1@gmail.com", cargo: "Oper. Postcosecha Cauca", area: "Operaciones", jefe: "Álvaro Acosta", nivel: "member" },
  { nombre: "Maribel Romero", ficha: null, cargo: "Oper. Postcosecha Chaparral", area: "Operaciones", jefe: "Álvaro Acosta" },

  { nombre: "Nicolás Rodríguez", ficha: "Nicolás Rodríguez", correo: "nicolas.rodriguez@aroco.co", cargo: "Gerente Comercial", area: "Comercial", jefe: "Álvaro Acosta", nivel: "admin" },
  { nombre: "David Bermúdez", ficha: null, cargo: "Director Comercial Zona Norte", area: "Comercial", jefe: "Nicolás Rodríguez" },
  { nombre: "John Muñoz", ficha: "John Muñoz", correo: "comercial@aroco.co", cargo: "Director Comercial Zona Sur", area: "Comercial", jefe: "Nicolás Rodríguez", nivel: "member" },
  { nombre: "Maximilian Werner", ficha: "Maximilian Werner", correo: "maximilian.werner@aroco.co", cargo: "Director Ventas Internacionales", area: "Comercial", jefe: "Nicolás Rodríguez", nivel: "member" },

  { nombre: "Luis Ernesto Barrios", ficha: "Luis Ernesto Barrios", correo: "luis.barrios@aroco.co", cargo: "Gerente Admin", area: "Financiero", jefe: "Álvaro Acosta", nivel: "admin_view" },
  { nombre: "Natalia Gonzalez", ficha: null, cargo: "Tesorería", area: "Financiero", jefe: "Luis Ernesto Barrios" },
  { nombre: "D. F. Fernández", ficha: null, cargo: "Contabilidad", area: "Financiero", jefe: "Luis Ernesto Barrios" },
  { nombre: "Heiner Sierra", ficha: null, cargo: "Aux Contable", area: "Financiero", jefe: "D. F. Fernández" },
  { nombre: "Milena Soto", ficha: "Milena Soto", correo: "info@aroco.co", cargo: "Aux. Contratos y Compras", area: "Financiero", jefe: "Luis Ernesto Barrios", nivel: "member" },

  { nombre: "Teo Ilelaty", ficha: null, cargo: "Coberturas", area: "Dirección", jefe: "Álvaro Acosta" },
  { nombre: "Martha Ospina", ficha: null, correo: "martha.ospina@moconsultores.com.co", cargo: "Gestión Documental", area: "Dirección", jefe: "Álvaro Acosta", nivel: "member" },

  { nombre: "Pablo Felipe", ficha: null, correo: "pablofelipe@me.com", cargo: "Plataforma / CRM", area: "Dirección", jefe: "Álvaro Acosta", nivel: "admin" },
  { nombre: "Alejo Acosta", ficha: null, correo: "alejoacosta@gmail.com", cargo: "Dirección", area: "Dirección", jefe: "Álvaro Acosta", nivel: "admin" },
];

const log = (s: string) => console.log(s);

async function main() {
  const [{ data: fichas }, { data: perfiles }] = await Promise.all([
    db.from("team_members").select("id, name, role_title, department, manager_id, profile_id"),
    db.from("profiles").select("id, full_name, email, role, department"),
  ]);
  const cards = fichas ?? [];
  const profs = perfiles ?? [];

  const cardByName = new Map(cards.map((c) => [c.name, c]));
  const profByEmail = new Map(profs.map((p) => [p.email.toLowerCase(), p]));

  // ── 1. Fichas: crear las que faltan, corregir cargo/área, enlazar cuenta ──
  const idPorNombre = new Map<string, string>();

  for (const p of ORGANIGRAMA) {
    const existente = p.ficha ? cardByName.get(p.ficha) : undefined;
    const perfil = p.correo ? profByEmail.get(p.correo) : undefined;

    if (p.correo && !perfil) {
      log(`  ⚠ ${p.nombre}: no hay cuenta con ${p.correo}`);
    }

    if (existente) {
      idPorNombre.set(p.nombre, existente.id);
      const cambios: string[] = [];
      if (existente.name !== p.nombre) cambios.push(`nombre → ${p.nombre}`);
      if (existente.role_title !== p.cargo) cambios.push(`cargo → ${p.cargo}`);
      if (existente.department !== p.area) cambios.push(`área ${existente.department} → ${p.area}`);
      if (perfil && existente.profile_id !== perfil.id) cambios.push("enlazar con su cuenta");
      if (cambios.length === 0) continue;
      log(`  ${p.nombre}: ${cambios.join(" · ")}`);
      if (!dry) {
        const { error } = await db
          .from("team_members")
          .update({
            name: p.nombre,
            role_title: p.cargo,
            department: p.area,
            ...(perfil ? { profile_id: perfil.id } : {}),
          })
          .eq("id", existente.id);
        if (error) log(`    ✗ ${error.message}`);
      }
    } else {
      log(`  + ficha nueva: ${p.nombre} · ${p.cargo} · ${p.area}`);
      if (!dry) {
        const { data, error } = await db
          .from("team_members")
          .insert({
            name: p.nombre,
            role_title: p.cargo,
            department: p.area,
            active: true,
            ...(perfil ? { profile_id: perfil.id } : {}),
          })
          .select("id")
          .single();
        if (error) log(`    ✗ ${error.message}`);
        else idPorNombre.set(p.nombre, data.id);
      } else {
        idPorNombre.set(p.nombre, `nuevo:${p.nombre}`);
      }
    }
  }

  // ── 2. El árbol, en una segunda pasada (ya existen todas las fichas) ─────
  log("\nCadena de mando:");
  for (const p of ORGANIGRAMA) {
    const id = idPorNombre.get(p.nombre);
    const jefeId = p.jefe ? idPorNombre.get(p.jefe) : null;
    if (!id) continue;
    if (p.jefe && !jefeId) {
      log(`  ✗ ${p.nombre}: no se encontró a su jefe (${p.jefe})`);
      continue;
    }
    log(`  ${p.nombre} → ${p.jefe ?? "(raíz)"}`);
    if (!dry && !id.startsWith("nuevo:")) {
      const { error } = await db
        .from("team_members")
        .update({ manager_id: jefeId ?? null })
        .eq("id", id);
      if (error) log(`    ✗ ${error.message}`);
    }
  }

  // ── 3. Niveles de acceso y área en el perfil ────────────────────────────
  log("\nNiveles de acceso:");
  for (const p of ORGANIGRAMA) {
    if (!p.correo || !p.nivel) continue;
    const perfil = profByEmail.get(p.correo);
    if (!perfil) continue;
    const cambios: string[] = [];
    if (perfil.role !== p.nivel) cambios.push(`${perfil.role} → ${p.nivel}`);
    if (perfil.department !== p.area) cambios.push(`área ${perfil.department} → ${p.area}`);
    if (cambios.length === 0) continue;
    log(`  ${p.nombre}: ${cambios.join(" · ")}`);
    if (!dry) {
      const { error } = await db
        .from("profiles")
        .update({ role: p.nivel, department: p.area })
        .eq("id", perfil.id);
      if (error) log(`    ✗ ${error.message}`);
    }
  }

  // ── 4. Quién queda fuera del organigrama ────────────────────────────────
  const enOrganigrama = new Set(ORGANIGRAMA.map((p) => p.nombre));
  const huerfanas = cards.filter(
    (c) => !enOrganigrama.has(c.name) && !ORGANIGRAMA.some((p) => p.ficha === c.name),
  );
  if (huerfanas.length > 0) {
    log("\nFichas que no están en el organigrama (quedan sin jefe):");
    for (const c of huerfanas) log(`  · ${c.name} (${c.role_title ?? "sin cargo"})`);
  }

  log(dry ? "\n--dry: no se escribió nada." : "\n✓ Jerarquía aplicada.");
}

main().catch((e) => {
  console.error("Falló:", e.message ?? e);
  process.exit(1);
});
