/**
 * Seed the AROCO database from `AROCO_Libro_Maestro.xlsx`.
 *
 *   pnpm seed
 *
 * Idempotent:
 *   • leads          → replaced by `source = 'xlsx-import'` marker
 *   • inventory_lots → full replace (cascade clears movements)
 *   • dispatches     → full replace
 *   • price_history  → upsert on (company, date)
 *
 * Inventory / dispatches / prices are SNAPSHOTS extracted from AROCO's live
 * files — they are marked `needs_review` and must be verified against source.
 *
 * team_members and commission_rules are seeded by migration 0009; here we only
 * read team_members to resolve the lead's commercial owner.
 */
import { config } from "dotenv";
import * as path from "node:path";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/types/database";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const XLSX_PATH = path.resolve("AROCO_Libro_Maestro.xlsx");

// ── Parsing helpers ──────────────────────────────────────────────────────────
const MONTHS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
};

/** "5-may-2025" / "2-jun-26" → "2025-05-05". Returns null if unparseable. */
function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim().toLowerCase();
  const m = s.match(/^(\d{1,2})[-/\s]([a-záéíóú]{3,})\.?[-/\s](\d{2,4})$/i);
  if (!m) return null;
  const day = Number(m[1]);
  const mon = MONTHS[m[2].slice(0, 3)];
  let year = Number(m[3]);
  if (!mon) return null;
  if (year < 100) year += 2000;
  return `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "$29.000" / 29000 / "1.542,5" → number | null. COP uses . thousands. */
function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\$/g, "").replace(/\s/g, "");
  if (s === "" || s === "-") return null;
  // If both separators present, assume . thousands and , decimals.
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else s = s.replace(/\./g, ""); // dots are thousands separators
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

type Market = Database["public"]["Enums"]["market"];
function normMarket(v: unknown): Market | null {
  const s = (str(v) ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("intl") || s.includes("internacional")) return "Internacional";
  if (s.includes("nacional")) return "Nacional";
  return null;
}

type LeadType = Database["public"]["Enums"]["lead_type"];
function normLeadType(v: unknown): LeadType | null {
  const s = (str(v) ?? "").toLowerCase();
  if (s.includes("broker")) return "Comprador/Broker";
  if (s.includes("proveedor")) return "Proveedor potencial";
  if (s.includes("comprador")) return "Comprador";
  return null;
}

type LeadStatus = Database["public"]["Enums"]["lead_status"];
function normLeadStatus(v: unknown): { status: LeadStatus; ambiguous: boolean } {
  const s = (str(v) ?? "").toLowerCase();
  const map: Record<string, LeadStatus> = {
    nuevo: "Nuevo",
    cotización: "Cotización",
    cotizacion: "Cotización",
    negociación: "Negociación",
    negociacion: "Negociación",
    enviado: "Enviado",
    "en espera": "En espera",
    "on hold": "En espera",
    espera: "En espera",
    cerrado: "Cerrado",
    descartado: "Descartado",
  };
  if (map[s]) return { status: map[s], ambiguous: false };
  return { status: "Nuevo", ambiguous: s !== "" };
}

/** "Colombia — Catatumbo" → { country, city }. */
function splitLocation(v: unknown): { country: string | null; city: string | null } {
  const s = str(v);
  if (!s) return { country: null, city: null };
  const parts = s.split(/\s*[—–-]\s*/);
  if (parts.length >= 2) return { country: parts[0].trim(), city: parts.slice(1).join(" - ").trim() };
  return { country: s, city: null };
}

function sheetRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Sheet not found: ${name}`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

const report: string[] = [];
function log(msg: string) {
  console.log(msg);
  report.push(msg);
}

// ── Seeders ──────────────────────────────────────────────────────────────────
async function seedLeads(wb: XLSX.WorkBook, ownerByName: Map<string, string>) {
  const rows = sheetRows(wb, "Leads").slice(2); // skip title + header
  const records: Database["public"]["Tables"]["leads"]["Insert"][] = [];
  let skipped = 0;
  const ambiguousStatuses: string[] = [];

  for (const r of rows) {
    const company = str(r[1]);
    if (!company) {
      skipped++;
      continue;
    }
    const { country, city } = splitLocation(r[3]);
    const { status, ambiguous } = normLeadStatus(r[6]);
    if (ambiguous) ambiguousStatuses.push(`${company}: "${str(r[6])}"`);
    const ownerName = (str(r[9]) ?? "").toLowerCase();
    records.push({
      company,
      contact_name: str(r[2]),
      country,
      city,
      market: normMarket(r[4]),
      type: normLeadType(r[5]),
      status,
      product_interest: str(r[7]),
      next_action: str(r[8]),
      commercial_owner: ownerByName.get(ownerName) ?? null,
      notes: str(r[10]),
      source: "xlsx-import",
    });
  }

  await db.from("leads").delete().eq("source", "xlsx-import");
  const { error } = await db.from("leads").insert(records);
  if (error) throw new Error(`leads insert: ${error.message}`);

  log(`✓ Leads: ${records.length} cargados (${skipped} filas vacías saltadas)`);
  if (ambiguousStatuses.length) {
    log(`  ⚠ Estados no estándar mapeados a 'Nuevo': ${ambiguousStatuses.join("; ")}`);
  }
}

async function seedInventoryLots(wb: XLSX.WorkBook) {
  const rows = sheetRows(wb, "Inv · Disponible Bodega").slice(2);
  const byKey = new Map<string, Database["public"]["Tables"]["inventory_lots"]["Insert"]>();
  let skipped = 0;

  for (const r of rows) {
    const code = str(r[2]);
    if (!code) {
      skipped++;
      continue;
    }
    const remision = str(r[1]);
    const rec = {
      code,
      entry_date: parseDate(r[0]),
      remision,
      qty_in_kg: parseNum(r[3]) ?? 0,
      qty_out_kg: parseNum(r[4]) ?? 0,
      qty_available_kg: parseNum(r[5]) ?? 0,
      samples_pasilla_merma_kg: parseNum(r[6]) ?? 0,
      needs_review: true,
    };
    byKey.set(`${code}|${remision ?? ""}`, rec); // dedupe by (code, remisión)
  }

  // Full replace (cascade clears movements/dispatch links).
  await db.from("inventory_lots").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const records = [...byKey.values()];
  const { error } = await db.from("inventory_lots").insert(records);
  if (error) throw new Error(`inventory_lots insert: ${error.message}`);

  const totalAvail = records.reduce((s, r) => s + (r.qty_available_kg ?? 0), 0);
  log(`✓ Inventario: ${records.length} lotes cargados (${skipped} saltados) · disponible ≈ ${totalAvail.toLocaleString("es-CO")} kg [snapshot — verificar]`);
  return records;
}

async function seedDispatches(wb: XLSX.WorkBook, lotByRemision: Map<string, string>) {
  const rows = sheetRows(wb, "Inv · Despachos").slice(2);
  const records: Database["public"]["Tables"]["dispatches"]["Insert"][] = [];
  let skipped = 0;

  for (const r of rows) {
    const qty = parseNum(r[5]);
    const destination = str(r[2]);
    if (qty == null && !destination) {
      skipped++;
      continue;
    }
    const remisionEntrada = str(r[3]);
    records.push({
      remision_salida: str(r[0]),
      dispatch_date: parseDate(r[1]) ?? new Date().toISOString().slice(0, 10),
      destination,
      remision_entrada: remisionEntrada,
      origin: str(r[4]),
      qty_kg: qty ?? 0,
      total_salida_kg: parseNum(r[6]),
      purchase_price_cop_kg: parseNum(r[7]),
      lot_id: remisionEntrada ? (lotByRemision.get(remisionEntrada) ?? null) : null,
      needs_review: true,
    });
  }

  await db.from("dispatches").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error } = await db.from("dispatches").insert(records);
  if (error) throw new Error(`dispatches insert: ${error.message}`);

  const linked = records.filter((r) => r.lot_id).length;
  log(`✓ Despachos: ${records.length} cargados (${skipped} saltados) · ${linked} ligados a lote por remisión [snapshot — verificar]`);
}

async function seedPriceHistory(wb: XLSX.WorkBook) {
  const rows = sheetRows(wb, "Histórico Precios");
  const header = rows[1] as unknown[]; // ["Fecha","CASA LUKER","NAC. CHOCOLATE BTA","NAC. CHOCOLATE IBAGUÉ"]
  const companies = header.slice(1).map((c) => str(c) ?? "");
  const records: Database["public"]["Tables"]["price_history"]["Insert"][] = [];
  let skipped = 0;

  for (const r of rows.slice(2)) {
    const date = parseDate(r[0]);
    if (!date) {
      if (r.some((c) => c != null && c !== "")) skipped++;
      continue;
    }
    companies.forEach((company, i) => {
      const price = parseNum(r[i + 1]);
      if (company && price != null) {
        records.push({ company, date, price_cop_kg: price });
      }
    });
  }

  const { error } = await db
    .from("price_history")
    .upsert(records, { onConflict: "company,date" });
  if (error) throw new Error(`price_history upsert: ${error.message}`);

  log(`✓ Precios: ${records.length} registros (${companies.length} compañías, ${skipped} filas sin fecha saltadas) [snapshot — verificar]`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log(`Leyendo ${XLSX_PATH}`);
  const wb = XLSX.readFile(XLSX_PATH);

  // Resolve commercial owners from the seeded team catalog.
  const { data: team, error: teamErr } = await db.from("team_members").select("id,name");
  if (teamErr) throw new Error(`team_members read: ${teamErr.message}`);
  const ownerByName = new Map((team ?? []).map((t) => [t.name.toLowerCase(), t.id]));
  log(`• Catálogo de equipo: ${ownerByName.size} miembros para asignar responsables`);

  await seedLeads(wb, ownerByName);
  const lots = await seedInventoryLots(wb);
  const lotByRemision = new Map<string, string>();
  // Re-read lots with ids to build remisión→id map for dispatch linking.
  const { data: lotRows } = await db.from("inventory_lots").select("id,remision");
  for (const l of lotRows ?? []) {
    if (l.remision) lotByRemision.set(l.remision, l.id);
  }
  void lots;
  await seedDispatches(wb, lotByRemision);
  await seedPriceHistory(wb);

  log("\n✅ Siembra completada.");
  log("   Recuerda: inventario, despachos e histórico son SNAPSHOTS — verificar contra los archivos vivos de AROCO.");
}

main().catch((e) => {
  console.error("\n❌ Seed failed:", e.message ?? e);
  process.exit(1);
});
