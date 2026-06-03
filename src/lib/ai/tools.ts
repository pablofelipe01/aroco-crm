import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type DB = SupabaseClient<Database>;

/**
 * Read-only AI tools. Each executor runs against the *user's* Supabase client
 * (their cookies/session), so RLS applies — the assistant can only read what
 * the user is allowed to read. No writes here: write actions (changing a
 * lead's status, creating a quote, sending a message) require explicit human
 * confirmation in the UI and are introduced in a later iteration.
 */
export const AI_TOOLS: Anthropic.Tool[] = [
  {
    name: "query_leads",
    description:
      "Buscar leads del pipeline comercial. Útil para preguntas como '¿qué leads internacionales están en negociación?' o 'leads de John Muñoz'. Devuelve hasta 25 leads con su estado, mercado, tipo, país y responsable.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: [
            "Nuevo",
            "Cotización",
            "Negociación",
            "Enviado",
            "En espera",
            "Cerrado",
            "Descartado",
          ],
          description: "Filtrar por etapa del pipeline.",
        },
        market: {
          type: "string",
          enum: ["Nacional", "Internacional"],
          description: "Filtrar por mercado.",
        },
        search: {
          type: "string",
          description:
            "Texto a buscar en empresa, contacto, país o producto de interés.",
        },
      },
    },
  },
  {
    name: "get_inventory_summary",
    description:
      "Resumen del inventario en bodega: total disponible en kg, número de lotes y desglose por procedencia (región del código del lote). Para preguntas como '¿cuánto cacao queda disponible?' o '¿cuánto hay del Meta?'.",
    input_schema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description:
            "Opcional: filtrar por código/procedencia (coincidencia parcial, ej. 'MET', 'CAU').",
        },
      },
    },
  },
  {
    name: "get_price_history",
    description:
      "Precios de referencia recientes (COP/kg) por compañía con su variación. Para '¿cuál es el precio actual de Casa Luker?' o tendencias de precio.",
    input_schema: {
      type: "object",
      properties: {
        company: {
          type: "string",
          description: "Opcional: filtrar por compañía (coincidencia parcial).",
        },
        limit: {
          type: "integer",
          description: "Número de fechas recientes a incluir (default 8, máx 30).",
        },
      },
    },
  },
  {
    name: "get_lead_activity",
    description:
      "Bitácora de actividad de un lead (notas, llamadas, correos, cambios de estado). Para 'resume la actividad de Mamuschka'. Recibe el nombre de la empresa.",
    input_schema: {
      type: "object",
      properties: {
        company: {
          type: "string",
          description: "Nombre (o parte) de la empresa del lead.",
        },
      },
      required: ["company"],
    },
  },
  {
    name: "get_pipeline_summary",
    description:
      "Conteo de leads por etapa del pipeline y por mercado. Para '¿cómo va el pipeline?' o '¿cuántos leads activos hay?'.",
    input_schema: { type: "object", properties: {} },
  },
];

function regionFromCode(code: string): string {
  return code.split("-")[1]?.trim() || "Otro";
}

type ToolResult = Record<string, unknown> | { error: string };

/** Execute a read-only tool by name. Returns a JSON-serializable result. */
export async function executeTool(
  db: DB,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "query_leads": {
      let q = db
        .from("leads")
        .select(
          "company, contact_name, country, city, market, type, status, product_interest, next_action, owner:team_members!leads_commercial_owner_fkey(name)",
        )
        .limit(25);
      if (typeof input.status === "string")
        q = q.eq("status", input.status as Database["public"]["Enums"]["lead_status"]);
      if (typeof input.market === "string")
        q = q.eq("market", input.market as Database["public"]["Enums"]["market"]);
      if (typeof input.search === "string" && input.search.trim()) {
        const s = `%${input.search.trim()}%`;
        q = q.or(
          `company.ilike.${s},contact_name.ilike.${s},country.ilike.${s},product_interest.ilike.${s}`,
        );
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, leads: data ?? [] };
    }

    case "get_inventory_summary": {
      let q = db.from("inventory_lots").select("code, qty_available_kg, quality");
      if (typeof input.region === "string" && input.region.trim()) {
        q = q.ilike("code", `%${input.region.trim()}%`);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      const lots = data ?? [];
      const byRegion = new Map<string, number>();
      let total = 0;
      for (const l of lots) {
        const kg = Number(l.qty_available_kg) || 0;
        total += kg;
        if (kg <= 0) continue;
        const r = regionFromCode(l.code);
        byRegion.set(r, (byRegion.get(r) ?? 0) + kg);
      }
      return {
        total_disponible_kg: Math.round(total),
        lotes: lots.length,
        por_procedencia: Object.fromEntries(
          [...byRegion.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([r, kg]) => [r, Math.round(kg)]),
        ),
      };
    }

    case "get_price_history": {
      const limit = Math.min(Number(input.limit) || 8, 30);
      let q = db
        .from("price_history")
        .select("company, date, price_cop_kg")
        .order("date", { ascending: false });
      if (typeof input.company === "string" && input.company.trim()) {
        q = q.ilike("company", `%${input.company.trim()}%`);
      }
      const { data, error } = await q.limit(limit * 4);
      if (error) return { error: error.message };
      const rows = data ?? [];
      const companies = [...new Set(rows.map((r) => r.company))];
      const result = companies.map((c) => {
        const pts = rows
          .filter((r) => r.company === c)
          .slice(0, limit)
          .map((r) => ({ date: r.date, price_cop_kg: r.price_cop_kg }));
        const latest = pts[0]?.price_cop_kg ?? null;
        const prev = pts[1]?.price_cop_kg ?? null;
        const change_pct =
          latest != null && prev ? Number((((latest - prev) / prev) * 100).toFixed(1)) : null;
        return { company: c, latest_cop_kg: latest, change_pct, recent: pts };
      });
      return { companies: result };
    }

    case "get_lead_activity": {
      const company = String(input.company ?? "").trim();
      if (!company) return { error: "Falta el nombre de la empresa." };
      const { data: leads, error: le } = await db
        .from("leads")
        .select("id, company, status")
        .ilike("company", `%${company}%`)
        .limit(1);
      if (le) return { error: le.message };
      const lead = leads?.[0];
      if (!lead) return { error: `No se encontró un lead que coincida con "${company}".` };
      const { data: acts, error: ae } = await db
        .from("lead_activities")
        .select("type, description, user_name, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (ae) return { error: ae.message };
      return {
        lead: { company: lead.company, status: lead.status },
        activities: acts ?? [],
      };
    }

    case "get_pipeline_summary": {
      const { data, error } = await db.from("leads").select("status, market");
      if (error) return { error: error.message };
      const byStatus: Record<string, number> = {};
      const byMarket: Record<string, number> = {};
      for (const l of data ?? []) {
        byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
        if (l.market) byMarket[l.market] = (byMarket[l.market] ?? 0) + 1;
      }
      return { total: data?.length ?? 0, por_estado: byStatus, por_mercado: byMarket };
    }

    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}
