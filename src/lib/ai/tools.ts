import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { cotizar } from "@/lib/calc/cotizador";
import { quoteSchema, toCotizadorInput } from "@/lib/schemas/quote";

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
  {
    name: "propose_lead_status_change",
    description:
      "PREPARA (no ejecuta) un cambio de estado de un lead — el usuario debe confirmarlo en la interfaz. Úsalo cuando el usuario pida mover o cambiar el estado de un lead. Nunca afirmes que el cambio se hizo: solo queda propuesto hasta que el usuario confirme.",
    input_schema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Nombre (o parte) de la empresa del lead." },
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
          description: "Nuevo estado propuesto.",
        },
      },
      required: ["company", "status"],
    },
  },
  {
    name: "propose_lead_note",
    description:
      "PREPARA (no ejecuta) registrar una nota/actividad en la bitácora de un lead — el usuario debe confirmarla. Úsalo cuando el usuario pida 'agrega una nota', 'registra que…', 'deja constancia de…'. Nunca afirmes que se guardó hasta que el usuario confirme.",
    input_schema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Nombre (o parte) de la empresa del lead." },
        note: { type: "string", description: "Texto de la nota a registrar." },
      },
      required: ["company", "note"],
    },
  },
  {
    name: "propose_create_task",
    description:
      "PREPARA (no ejecuta) la creación de una tarea — el usuario debe confirmarla. Úsalo cuando pidan 'crea una tarea', 'recuérdame…', 'asígnale a X que…'. Nunca afirmes que se creó hasta que el usuario confirme.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Qué hay que hacer (título de la tarea)." },
        person: { type: "string", description: "Nombre del responsable (opcional)." },
        due_date: { type: "string", description: "Fecha de vencimiento YYYY-MM-DD (opcional)." },
        description: { type: "string", description: "Detalle adicional (opcional)." },
      },
      required: ["name"],
    },
  },
  {
    name: "propose_inventory_movement",
    description:
      "PREPARA (no ejecuta) un movimiento de inventario (entrada o salida) sobre un lote — el usuario debe confirmarlo. Úsalo cuando pidan 'registra una salida de N kg del lote X', 'ingresa N kg'. Nunca afirmes que se registró hasta que el usuario confirme.",
    input_schema: {
      type: "object",
      properties: {
        lot_code: { type: "string", description: "Código (o parte) del lote." },
        kind: {
          type: "string",
          enum: ["entrada", "salida"],
          description: "Tipo de movimiento.",
        },
        qty_kg: { type: "number", description: "Cantidad en kg (positiva)." },
        note: { type: "string", description: "Nota (opcional)." },
      },
      required: ["lot_code", "kind", "qty_kg"],
    },
  },
  {
    name: "propose_create_lead",
    description:
      "PREPARA (no ejecuta) la creación de un lead/prospecto — el usuario debe confirmarlo. Úsalo cuando pidan 'crea un lead', 'agrega el prospecto X'. Nunca afirmes que se creó hasta que el usuario confirme.",
    input_schema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Nombre de la empresa o prospecto." },
        contact_name: { type: "string", description: "Persona de contacto (opcional)." },
        country: { type: "string", description: "País / ciudad (opcional)." },
        market: {
          type: "string",
          enum: ["Nacional", "Internacional"],
          description: "Mercado (opcional).",
        },
        type: {
          type: "string",
          enum: ["Comprador", "Proveedor potencial", "Comprador/Broker"],
          description: "Tipo (opcional).",
        },
        product_interest: { type: "string", description: "Producto/interés (opcional)." },
        owner: { type: "string", description: "Nombre del responsable comercial (opcional)." },
      },
      required: ["company"],
    },
  },
  {
    name: "propose_create_quote",
    description:
      "PREPARA (no ejecuta) una cotización en BORRADOR — el usuario debe confirmarla. Úsalo cuando pidan 'cotiza…' o 'haz una cotización'. Reúne incoterm, volumen, precio de compra (COP/kg), TRM y referencia; los modificadores que no menciones quedan en 0 y el usuario los ajusta en el módulo Cotizaciones. Nunca afirmes que se creó hasta que el usuario confirme.",
    input_schema: {
      type: "object",
      properties: {
        incoterm: { type: "string", enum: ["NACIONAL", "FOB", "CIF"] },
        company: { type: "string", description: "Lead o cliente (opcional)." },
        volume_tm: { type: "number", description: "Volumen en TM." },
        purchase_price_cop_kg: { type: "number", description: "Precio de compra COP/kg." },
        trm: { type: "number", description: "TRM USD/COP." },
        cocoa_usd_t: { type: "number", description: "Precio cocoa USD/T (export)." },
        differential_pct: { type: "number", description: "Diferencial % (export)." },
        commission_pct: { type: "number", description: "Comisión %." },
        target_utility_pct: { type: "number", description: "Utilidad objetivo % (NACIONAL)." },
      },
      required: ["incoterm", "purchase_price_cop_kg", "trm"],
    },
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

    case "propose_lead_status_change": {
      const company = String(input.company ?? "").trim();
      const status = String(input.status ?? "").trim();
      if (!company || !status) return { error: "Faltan datos." };
      const { data } = await db
        .from("leads")
        .select("id, company, status")
        .ilike("company", `%${company}%`)
        .limit(1);
      const lead = data?.[0];
      if (!lead) return { error: `No encontré un lead que coincida con "${company}".` };
      return {
        proposal: {
          kind: "lead_status",
          lead_id: lead.id,
          company: lead.company,
          from: lead.status,
          status,
        },
        note: "Cambio preparado. Indica al usuario que lo confirme en la tarjeta de abajo; aún NO se aplicó.",
      };
    }

    case "propose_lead_note": {
      const company = String(input.company ?? "").trim();
      const note = String(input.note ?? "").trim();
      if (!company || !note) return { error: "Faltan datos." };
      const { data } = await db
        .from("leads")
        .select("id, company")
        .ilike("company", `%${company}%`)
        .limit(1);
      const lead = data?.[0];
      if (!lead) return { error: `No encontré un lead que coincida con "${company}".` };
      return {
        proposal: { kind: "lead_note", lead_id: lead.id, company: lead.company, note },
        note: "Nota preparada. Indica al usuario que la confirme en la tarjeta de abajo; aún NO se guardó.",
      };
    }

    case "propose_create_task": {
      const name = String(input.name ?? "").trim();
      if (!name) return { error: "Falta el nombre de la tarea." };
      let person_id: string | null = null;
      let person_name: string | null = null;
      const person = String(input.person ?? "").trim();
      if (person) {
        const { data } = await db
          .from("team_members")
          .select("id, name")
          .ilike("name", `%${person}%`)
          .limit(1);
        if (data?.[0]) {
          person_id = data[0].id;
          person_name = data[0].name;
        }
      }
      return {
        proposal: {
          kind: "create_task",
          name,
          person_id,
          person_name,
          due_date: String(input.due_date ?? "").trim() || null,
          description: String(input.description ?? "").trim() || null,
        },
        note: "Tarea preparada. Indica al usuario que la confirme; aún NO se creó.",
      };
    }

    case "propose_inventory_movement": {
      const lotCode = String(input.lot_code ?? "").trim();
      const movement = String(input.kind ?? "");
      const qty = Number(input.qty_kg);
      if (
        !lotCode ||
        (movement !== "entrada" && movement !== "salida") ||
        !Number.isFinite(qty) ||
        qty <= 0
      ) {
        return { error: "Datos de movimiento inválidos (lote, tipo y cantidad > 0)." };
      }
      const { data } = await db
        .from("inventory_lots")
        .select("id, code, qty_available_kg")
        .ilike("code", `%${lotCode}%`)
        .limit(1);
      const lot = data?.[0];
      if (!lot) return { error: `No encontré un lote que coincida con "${lotCode}".` };
      return {
        proposal: {
          kind: "inventory_movement",
          lot_id: lot.id,
          code: lot.code,
          movement,
          qty_kg: qty,
          available: lot.qty_available_kg,
          note: String(input.note ?? "").trim() || null,
        },
        note: "Movimiento preparado. Indica al usuario que lo confirme; aún NO se registró.",
      };
    }

    case "propose_create_lead": {
      const company = String(input.company ?? "").trim();
      if (!company) return { error: "Falta el nombre de la empresa." };
      let owner_id: string | null = null;
      let owner_name: string | null = null;
      const owner = String(input.owner ?? "").trim();
      if (owner) {
        const { data } = await db
          .from("team_members")
          .select("id, name")
          .ilike("name", `%${owner}%`)
          .limit(1);
        if (data?.[0]) {
          owner_id = data[0].id;
          owner_name = data[0].name;
        }
      }
      return {
        proposal: {
          kind: "create_lead",
          company,
          contact_name: String(input.contact_name ?? "").trim() || null,
          country: String(input.country ?? "").trim() || null,
          market: (input.market as string) || null,
          type: (input.type as string) || null,
          status: (String(input.status ?? "").trim() || "Nuevo") as string,
          product_interest: String(input.product_interest ?? "").trim() || null,
          commercial_owner: owner_id,
          owner_name,
        },
        note: "Lead preparado. Indica al usuario que lo confirme; aún NO se creó.",
      };
    }

    case "propose_create_quote": {
      const incoterm = String(input.incoterm ?? "");
      if (!["NACIONAL", "FOB", "CIF"].includes(incoterm))
        return { error: "Incoterm inválido." };
      const company = String(input.company ?? "").trim();
      let lead_id: string | null = null;
      let client_name: string | null = null;
      let market: string | null = null;
      if (company) {
        const { data } = await db
          .from("leads")
          .select("id, company, market")
          .ilike("company", `%${company}%`)
          .limit(1);
        if (data?.[0]) {
          lead_id = data[0].id;
          client_name = data[0].company;
          market = data[0].market;
        }
      }
      const quote = {
        incoterm,
        lead_id,
        client_name,
        market,
        trm: Number(input.trm) || 0,
        cocoa_usd_t: Number(input.cocoa_usd_t) || 0,
        differential_pct: Number(input.differential_pct) || 0,
        purchase_price_cop_kg: Number(input.purchase_price_cop_kg) || 0,
        volume_tm: Number(input.volume_tm) || 1,
        commission_pct: Number(input.commission_pct) || 0,
        target_utility_pct: Number(input.target_utility_pct) || 0,
        transporte_bodega: 0,
        seleccion: 0,
        fumigacion: 0,
        estibas: 0,
        costales: 0,
        coberturas: 0,
        costos_exportacion: 0,
        bonif_calidad: 0,
        bonif_cadmio: 0,
        bonif_trazabilidad: 0,
        bonif_transporte: 0,
        validity_days: 15,
      };
      let preview: number | null = null;
      try {
        const parsed = quoteSchema.parse(quote);
        preview = Math.round(cotizar(toCotizadorInput(parsed)).precioFinalUsdTm * 100) / 100;
      } catch {
        /* preview optional */
      }
      return {
        proposal: {
          kind: "create_quote",
          company: client_name ?? company ?? "—",
          incoterm,
          preview_usd_tm: preview,
          quote,
        },
        note: "Cotización (borrador) preparada. Indica al usuario que la confirme; aún NO se creó.",
      };
    }

    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}
