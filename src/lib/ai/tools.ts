import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { cotizar } from "@/lib/calc/cotizador";
import { quoteSchema, toCotizadorInput } from "@/lib/schemas/quote";
import { getMarketData } from "@/lib/market";
import { scopeLabel, type AgentContext } from "@/lib/ai/context";
import { DEPARTMENTS as DEPARTMENT_LIST } from "@/lib/departments";
import { regionFromCode } from "@/lib/inventory/region";

type DB = SupabaseClient<Database>;

/** Copia mutable para los `enum` de los esquemas JSON de las herramientas. */
const DEPARTMENTS: string[] = [...DEPARTMENT_LIST];

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
      "Buscar leads del pipeline comercial. Útil para preguntas como '¿qué leads internacionales están en negociación?', 'leads de John Muñoz' o '¿cuál es el correo de contacto de X?'. Devuelve hasta 25 leads con su estado, mercado, tipo, país, datos de contacto (correo y teléfono) y responsable.",
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
      "Inventario actual en bodega: kg disponibles, lotes con saldo, desglose por procedencia y por clasificación (premium / corriente / corriente C / orgánico), y marca de cadmio. Para '¿cuál es el inventario actual?', '¿cuánto cacao queda disponible?', '¿cuánto hay del Meta?' o '¿qué lotes tienen cadmio alto?'.",
    input_schema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description:
            "Opcional: filtrar por código/procedencia (coincidencia parcial, ej. 'MET', 'CAU').",
        },
        include_zero: {
          type: "boolean",
          description:
            "Incluir lotes ya agotados. Por defecto false: solo lo que queda en bodega.",
        },
        include_lots: {
          type: "boolean",
          description:
            "Devolver el detalle lote por lote además de los totales. Por defecto true.",
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
    name: "query_tasks",
    description:
      "Tareas del equipo. Para '¿qué tareas tiene Nicolás?', '¿qué hay pendiente esta semana?', '¿qué está vencido?' o '¿en qué anda Bodega Central?'. El alcance depende del rol de quien pregunta: Dirección ve todo, el resto ve lo propio y lo de su área.",
    input_schema: {
      type: "object",
      properties: {
        person: {
          type: "string",
          description: "Nombre (o parte) del responsable.",
        },
        status: {
          type: "string",
          enum: ["pending", "progress", "done", "blocked"],
          description:
            "Estado: pending=pendiente, progress=en curso, done=hecha, blocked=bloqueada.",
        },
        department: {
          type: "string",
          enum: DEPARTMENTS,
          description: "Filtrar por área del responsable.",
        },
        overdue: {
          type: "boolean",
          description: "Solo tareas vencidas y sin terminar.",
        },
        due_before: {
          type: "string",
          description: "Vencen hasta esta fecha (YYYY-MM-DD).",
        },
      },
    },
  },
  {
    name: "get_team",
    description:
      "Directorio del equipo: quién es quién, su cargo y su área. Para '¿quién está en Operaciones?', '¿quién es el responsable comercial?' o para resolver un nombre antes de consultar sus tareas.",
    input_schema: {
      type: "object",
      properties: {
        department: {
          type: "string",
          enum: DEPARTMENTS,
          description: "Filtrar por área.",
        },
        search: { type: "string", description: "Nombre (o parte) a buscar." },
      },
    },
  },
  {
    name: "query_dispatches",
    description:
      "Despachos y salidas de bodega. Para '¿qué le despachamos a Casa Luker?', '¿cuánto salió en julio?' o '¿de qué lote salió la remisión 2031?'. Incluye el desglose por clasificación cuando existe.",
    input_schema: {
      type: "object",
      properties: {
        client: {
          type: "string",
          description: "Destino/cliente (coincidencia parcial, ej. 'luker').",
        },
        origin: {
          type: "string",
          description: "Código de procedencia del lote (coincidencia parcial).",
        },
        remision: { type: "string", description: "Remisión de salida o de entrada." },
        since: { type: "string", description: "Desde esta fecha (YYYY-MM-DD)." },
        until: { type: "string", description: "Hasta esta fecha (YYYY-MM-DD)." },
      },
    },
  },
  {
    name: "query_quotes",
    description:
      "Cotizaciones emitidas: estado, cliente, incoterm, precio final y utilidad. Para '¿qué cotizaciones están enviadas?' o '¿en cuánto quedó la cotización de X?'.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["borrador", "enviada", "aceptada", "rechazada"],
          description: "Estado de la cotización.",
        },
        client: { type: "string", description: "Cliente (coincidencia parcial)." },
        incoterm: {
          type: "string",
          enum: ["NACIONAL", "FOB", "CIF"],
          description: "Incoterm.",
        },
      },
    },
  },
  {
    name: "get_commissions",
    description:
      "Comisiones calculadas y toneladas mensuales por agente. Para '¿cuánto lleva de comisión fulano?' o '¿cuántas toneladas hizo el equipo este mes?'.",
    input_schema: {
      type: "object",
      properties: {
        agent: { type: "string", description: "Nombre del agente (parcial)." },
        period: {
          type: "string",
          description: "Periodo de toneladas en formato YYYY-MM.",
        },
      },
    },
  },
  {
    name: "query_proveedores",
    description:
      "Proveedores de cacao y su estado de vinculación. Para '¿qué proveedores están habilitados?', '¿cuántos hay en estudio?' o datos de contacto y capacidad de un proveedor.",
    input_schema: {
      type: "object",
      properties: {
        estado: {
          type: "string",
          enum: ["En estudio", "Habilitado", "Deshabilitado", "Rechazado"],
          description: "Estado de vinculación.",
        },
        search: {
          type: "string",
          description: "Nombre, código, asociación o municipio (parcial).",
        },
        departamento: { type: "string", description: "Departamento de origen." },
      },
    },
  },
  {
    name: "query_ordenes_compra",
    description:
      "Órdenes de compra a proveedores, con sus recepciones y liquidaciones. Para '¿qué OC están pendientes de aprobar?', '¿qué se recibió de la OC X?' o '¿cuánto se liquidó?'.",
    input_schema: {
      type: "object",
      properties: {
        estado: {
          type: "string",
          enum: ["Borrador", "En revisión", "Aprobada", "Rechazada", "Emitida"],
          description: "Estado de la orden.",
        },
        proveedor: { type: "string", description: "Proveedor (coincidencia parcial)." },
        consecutivo: { type: "string", description: "Consecutivo de la OC." },
      },
    },
  },
  {
    name: "compare_prices",
    description:
      "Compara el precio nacional de cada compañía (COP/kg) contra el cacao internacional (futuro ICE NY convertido a COP/kg con la TRM). Para '¿cómo está Casa Luker frente al internacional?', '¿conviene vender nacional o exportar?' o '¿cuál es la brecha hoy?'.",
    input_schema: {
      type: "object",
      properties: {
        company: {
          type: "string",
          description: "Opcional: limitar a una compañía (coincidencia parcial).",
        },
      },
    },
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
        contact_email: { type: "string", description: "Correo del contacto (opcional)." },
        contact_phone: { type: "string", description: "Teléfono del contacto (opcional)." },
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


type ToolResult = Record<string, unknown> | { error: string };

const str = (v: unknown): string => String(v ?? "").trim();
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Execute a tool by name. Returns a JSON-serializable result.
 *
 * `ctx` identifies who is asking; las herramientas que tocan datos de personas
 * (tareas) recortan el resultado con él. El resto ya queda acotado por la RLS
 * del cliente Supabase del usuario.
 */
export async function executeTool(
  db: DB,
  name: string,
  input: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolResult> {
  switch (name) {
    case "query_leads": {
      let q = db
        .from("leads")
        .select(
          "company, contact_name, contact_email, contact_phone, country, city, market, type, status, product_interest, next_action, owner:team_members!leads_commercial_owner_fkey(name)",
        )
        .limit(25);
      if (typeof input.status === "string")
        q = q.eq("status", input.status as Database["public"]["Enums"]["lead_status"]);
      if (typeof input.market === "string")
        q = q.eq("market", input.market as Database["public"]["Enums"]["market"]);
      if (typeof input.search === "string" && input.search.trim()) {
        const s = `%${input.search.trim()}%`;
        q = q.or(
          `company.ilike.${s},contact_name.ilike.${s},contact_email.ilike.${s},contact_phone.ilike.${s},country.ilike.${s},product_interest.ilike.${s}`,
        );
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, leads: data ?? [] };
    }

    case "get_inventory_summary": {
      let q = db
        .from("inventory_lots")
        // Un solo literal: TypeScript no constant-folds `+`, y el parser de
        // tipos de supabase-js necesita el string completo para inferir la fila.
        .select(
          "code, remision, entry_date, quality, cadmio, qty_available_kg, qty_avail_premium_kg, qty_avail_corriente_kg, qty_avail_corriente_c_kg, qty_avail_organico_kg, purchase_price_cop_kg, pct_humedad",
        )
        .order("qty_available_kg", { ascending: false });
      if (str(input.region)) q = q.ilike("code", `%${str(input.region)}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };

      const all = data ?? [];
      const conSaldo = all.filter((l) => Number(l.qty_available_kg) > 0);
      const lots = input.include_zero === true ? all : conSaldo;

      const byRegion = new Map<string, number>();
      const byQuality = new Map<string, number>();
      let total = 0;
      for (const l of conSaldo) {
        const kg = Number(l.qty_available_kg) || 0;
        total += kg;
        const r = regionFromCode(l.code);
        byRegion.set(r, (byRegion.get(r) ?? 0) + kg);
        if (l.quality) byQuality.set(l.quality, (byQuality.get(l.quality) ?? 0) + kg);
      }

      const sum = (k: keyof (typeof conSaldo)[number]) =>
        Math.round(conSaldo.reduce((s, l) => s + (Number(l[k]) || 0), 0));

      return {
        total_disponible_kg: Math.round(total),
        lotes_con_saldo: conSaldo.length,
        lotes_totales: all.length,
        por_procedencia: Object.fromEntries(
          [...byRegion.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([r, kg]) => [r, Math.round(kg)]),
        ),
        por_clasificacion: {
          premium: sum("qty_avail_premium_kg"),
          corriente: sum("qty_avail_corriente_kg"),
          corriente_c: sum("qty_avail_corriente_c_kg"),
          organico: sum("qty_avail_organico_kg"),
        },
        con_cadmio: conSaldo
          .filter((l) => l.cadmio)
          .map((l) => ({ lote: l.code, cadmio: l.cadmio })),
        lotes:
          input.include_lots === false
            ? undefined
            : lots.slice(0, 40).map((l) => ({
                codigo: l.code,
                remision: l.remision,
                ingreso: l.entry_date,
                clasificacion: l.quality,
                disponible_kg: Number(l.qty_available_kg) || 0,
                cadmio: l.cadmio,
                precio_compra_cop_kg: l.purchase_price_cop_kg,
                humedad_pct: l.pct_humedad,
              })),
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

    case "query_tasks": {
      type Person = {
        id: string;
        name: string | null;
        department: string | null;
        profile_id: string | null;
      } | null;
      type Row = {
        name: string;
        description: string | null;
        status: string;
        start_date: string | null;
        due_date: string | null;
        person_name: string | null;
        person: Person;
        task_assignees: { team_members: Person }[] | null;
      };

      let q = db
        .from("tasks")
        .select(
          "name, description, status, start_date, due_date, person_name, person:team_members!tasks_person_id_fkey(id,name,department,profile_id), task_assignees(team_members(id,name,department,profile_id))",
        )
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(300);

      if (typeof input.status === "string")
        q = q.eq("status", input.status as Database["public"]["Enums"]["task_status"]);
      if (str(input.due_before)) q = q.lte("due_date", str(input.due_before));
      if (input.overdue === true) q = q.lt("due_date", today()).neq("status", "done");

      const { data, error } = await q;
      if (error) return { error: error.message };

      const rows = (data ?? []) as unknown as Row[];
      const person = str(input.person).toLowerCase();
      const dept = str(input.department);

      /** Todos los responsables; con respaldo al principal para tareas viejas. */
      const peopleOf = (t: Row): Person[] => {
        const all = (t.task_assignees ?? [])
          .map((a) => a.team_members)
          .filter((m): m is NonNullable<Person> => m != null);
        return all.length > 0 ? all : [t.person];
      };

      // Lo que este usuario no puede ver ya no llegó hasta aquí: la RLS de
      // `tasks` (0048) recorta por rama del organigrama. Lo de abajo son
      // filtros que pidió quien pregunta, no permisos.
      const filtered = rows.filter((t) => {
        const people = peopleOf(t);
        if (dept && !people.some((p) => p?.department === dept)) return false;
        if (!person) return true;
        const names = `${people.map((p) => p?.name ?? "").join(" ")} ${t.person_name ?? ""}`;
        return names.toLowerCase().includes(person);
      });

      // Lo abierto primero: quien pregunta "¿qué tiene fulano?" quiere lo
      // pendiente, no el histórico de lo ya cerrado.
      const ordered = [...filtered].sort((a, b) => {
        const openA = a.status === "done" ? 1 : 0;
        const openB = b.status === "done" ? 1 : 0;
        if (openA !== openB) return openA - openB;
        return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
      });

      return {
        alcance: scopeLabel(ctx),
        total: filtered.length,
        pendientes: filtered.filter((t) => t.status !== "done").length,
        tareas: ordered.slice(0, 40).map((t) => ({
          nombre: t.name,
          estado: t.status,
          responsables:
            peopleOf(t)
              .map((p) => p?.name)
              .filter((n): n is string => !!n) ?? [],
          responsable: peopleOf(t)[0]?.name ?? t.person_name ?? null,
          area: peopleOf(t)[0]?.department ?? null,
          vence: t.due_date,
          inicia: t.start_date,
          detalle: t.description,
          vencida:
            t.due_date != null && t.due_date < today() && t.status !== "done",
        })),
      };
    }

    case "get_team": {
      let q = db
        .from("team_members")
        .select("name, role_title, department, active")
        .eq("active", true)
        .order("name")
        .limit(100);
      if (typeof input.department === "string")
        q = q.eq(
          "department",
          input.department as Database["public"]["Enums"]["department"],
        );
      if (str(input.search)) q = q.ilike("name", `%${str(input.search)}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return {
        total: data?.length ?? 0,
        equipo: (data ?? []).map((m) => ({
          nombre: m.name,
          cargo: m.role_title,
          area: m.department,
        })),
      };
    }

    case "query_dispatches": {
      let q = db
        .from("dispatches")
        .select(
          "dispatch_date, destination, remision_salida, remision_entrada, origin, qty_kg, qty_premium_kg, qty_corriente_kg, qty_corriente_c_kg, qty_organico_kg",
        )
        .order("dispatch_date", { ascending: false, nullsFirst: false })
        .limit(60);
      if (str(input.client)) q = q.ilike("destination", `%${str(input.client)}%`);
      if (str(input.origin)) q = q.ilike("origin", `%${str(input.origin)}%`);
      if (str(input.since)) q = q.gte("dispatch_date", str(input.since));
      if (str(input.until)) q = q.lte("dispatch_date", str(input.until));
      if (str(input.remision)) {
        const r = str(input.remision);
        q = q.or(`remision_salida.eq.${r},remision_entrada.eq.${r}`);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      const rows = data ?? [];
      return {
        total: rows.length,
        total_kg: Math.round(rows.reduce((s, d) => s + (Number(d.qty_kg) || 0), 0)),
        despachos: rows.map((d) => ({
          fecha: d.dispatch_date,
          cliente: d.destination,
          remision_salida: d.remision_salida,
          procedencia: d.origin,
          kg: Number(d.qty_kg) || 0,
          clasificacion: {
            premium: Number(d.qty_premium_kg) || 0,
            corriente: Number(d.qty_corriente_kg) || 0,
            corriente_c: Number(d.qty_corriente_c_kg) || 0,
            organico: Number(d.qty_organico_kg) || 0,
          },
        })),
      };
    }

    case "query_quotes": {
      let q = db
        .from("quotes")
        .select(
          "quote_number, client_name, status, incoterm, market, volume_tm, precio_final_usd_tm, precio_final_cop_tm, utilidad_pct, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(30);
      if (typeof input.status === "string")
        q = q.eq("status", input.status as Database["public"]["Enums"]["quote_status"]);
      if (typeof input.incoterm === "string")
        q = q.eq("incoterm", input.incoterm as Database["public"]["Enums"]["incoterm"]);
      if (str(input.client)) q = q.ilike("client_name", `%${str(input.client)}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return {
        total: data?.length ?? 0,
        cotizaciones: (data ?? []).map((c) => ({
          numero: c.quote_number,
          cliente: c.client_name,
          estado: c.status,
          incoterm: c.incoterm,
          mercado: c.market,
          volumen_tm: c.volume_tm,
          precio_final_usd_tm: c.precio_final_usd_tm,
          precio_final_cop_tm: c.precio_final_cop_tm,
          utilidad_pct: c.utilidad_pct,
          fecha: c.created_at?.slice(0, 10),
        })),
      };
    }

    case "get_commissions": {
      const agent = str(input.agent);
      let cq = db
        .from("commission_calcs")
        .select(
          "agent, role, level, market, sale_total_cop, cost_total_cop, gross_utility, applied_pct, commission_cop, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (agent) cq = cq.ilike("agent", `%${agent}%`);

      let tq = db
        .from("monthly_tonnage")
        .select("agent, period, role, market, tons, note")
        .order("period", { ascending: false })
        .limit(50);
      if (agent) tq = tq.ilike("agent", `%${agent}%`);
      if (str(input.period)) tq = tq.eq("period", str(input.period));

      const [{ data: calcs, error: ce }, { data: tons, error: te }] =
        await Promise.all([cq, tq]);
      if (ce) return { error: ce.message };
      if (te) return { error: te.message };

      const totalComision = (calcs ?? []).reduce(
        (s, c) => s + (Number(c.commission_cop) || 0),
        0,
      );
      const totalTon = (tons ?? []).reduce((s, t) => s + (Number(t.tons) || 0), 0);
      return {
        total_comision_cop: Math.round(totalComision),
        total_toneladas: totalTon,
        comisiones: (calcs ?? []).map((c) => ({
          agente: c.agent,
          rol: c.role,
          nivel: c.level,
          mercado: c.market,
          venta_cop: c.sale_total_cop,
          utilidad_bruta: c.gross_utility,
          pct_aplicado: c.applied_pct,
          comision_cop: c.commission_cop,
          fecha: c.created_at?.slice(0, 10),
        })),
        toneladas: (tons ?? []).map((t) => ({
          agente: t.agent,
          periodo: t.period,
          rol: t.role,
          mercado: t.market,
          toneladas: t.tons,
          nota: t.note,
        })),
      };
    }

    case "query_proveedores": {
      let q = db
        .from("proveedores")
        .select(
          "codigo, nombre, estado, departamento, municipios_produccion, asociacion, contacto, celular, email, cap_seco_mensual, cap_seco_anual, certificaciones",
        )
        .order("nombre")
        .limit(40);
      if (typeof input.estado === "string")
        q = q.eq(
          "estado",
          input.estado as Database["public"]["Enums"]["proveedor_estado"],
        );
      if (str(input.departamento))
        q = q.ilike("departamento", `%${str(input.departamento)}%`);
      if (str(input.search)) {
        const s = `%${str(input.search)}%`;
        q = q.or(
          `nombre.ilike.${s},codigo.ilike.${s},asociacion.ilike.${s},municipios_produccion.ilike.${s}`,
        );
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      const rows = data ?? [];
      const byEstado: Record<string, number> = {};
      for (const p of rows) byEstado[p.estado] = (byEstado[p.estado] ?? 0) + 1;
      return {
        total: rows.length,
        por_estado: byEstado,
        proveedores: rows.map((p) => ({
          codigo: p.codigo,
          nombre: p.nombre,
          estado: p.estado,
          departamento: p.departamento,
          municipios: p.municipios_produccion,
          asociacion: p.asociacion,
          contacto: p.contacto,
          celular: p.celular,
          email: p.email,
          capacidad_seco_mensual_kg: p.cap_seco_mensual,
          certificaciones: p.certificaciones,
        })),
      };
    }

    case "query_ordenes_compra": {
      type OcRow = {
        id: string;
        consecutivo: string | null;
        estado: string;
        tipo_caso: string;
        volumen_kg: number | null;
        precio_kg: number | null;
        valor_total: number | null;
        fecha_entrega: string | null;
        emitida_en: string | null;
        proveedores: { nombre: string } | null;
      };

      let q = db
        .from("ordenes_compra")
        .select(
          "id, consecutivo, estado, tipo_caso, volumen_kg, precio_kg, valor_total, fecha_entrega, emitida_en, proveedores(nombre)",
        )
        .order("created_at", { ascending: false })
        .limit(30);
      if (typeof input.estado === "string")
        q = q.eq("estado", input.estado as Database["public"]["Enums"]["oc_estado"]);
      if (str(input.consecutivo))
        q = q.ilike("consecutivo", `%${str(input.consecutivo)}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };

      let ocs = (data ?? []) as unknown as OcRow[];
      const prov = str(input.proveedor).toLowerCase();
      if (prov) {
        ocs = ocs.filter((o) =>
          (o.proveedores?.nombre ?? "").toLowerCase().includes(prov),
        );
      }
      if (ocs.length === 0) return { total: 0, ordenes: [] };

      // Recepciones y liquidaciones de esas órdenes, en dos consultas.
      const ids = ocs.map((o) => o.id);
      const [{ data: recs }, { data: liqs }] = await Promise.all([
        db
          .from("recepciones")
          .select(
            "orden_id, estado, peso_solicitado_kg, peso_recibido_kg, humedad_pct, fermentacion_pct, cerrada_en",
          )
          .in("orden_id", ids),
        db
          .from("liquidaciones")
          .select(
            "orden_id, estado, tipo_pago, peso_recibido_kg, valor_base, total_sanciones, total_bonificaciones, valor_total",
          )
          .in("orden_id", ids),
      ]);

      return {
        total: ocs.length,
        ordenes: ocs.map((o) => ({
          consecutivo: o.consecutivo,
          proveedor: o.proveedores?.nombre ?? null,
          estado: o.estado,
          tipo: o.tipo_caso,
          volumen_kg: o.volumen_kg,
          precio_kg: o.precio_kg,
          valor_total: o.valor_total,
          fecha_entrega: o.fecha_entrega,
          emitida_en: o.emitida_en,
          recepciones: (recs ?? [])
            .filter((r) => r.orden_id === o.id)
            .map((r) => ({
              estado: r.estado,
              solicitado_kg: r.peso_solicitado_kg,
              recibido_kg: r.peso_recibido_kg,
              humedad_pct: r.humedad_pct,
              fermentacion_pct: r.fermentacion_pct,
              cerrada_en: r.cerrada_en,
            })),
          liquidaciones: (liqs ?? [])
            .filter((l) => l.orden_id === o.id)
            .map((l) => ({
              estado: l.estado,
              tipo_pago: l.tipo_pago,
              recibido_kg: l.peso_recibido_kg,
              valor_base: l.valor_base,
              sanciones: l.total_sanciones,
              bonificaciones: l.total_bonificaciones,
              valor_total: l.valor_total,
            })),
        })),
      };
    }

    case "compare_prices": {
      const [{ data: rows, error }, market] = await Promise.all([
        db
          .from("price_history")
          .select("company, date, price_cop_kg")
          .order("date", { ascending: false })
          .limit(400),
        getMarketData(),
      ]);
      if (error) return { error: error.message };

      // Cacao internacional en COP/kg: USD/T × TRM ÷ 1000.
      const iceCopKg =
        market.cocoaUsdT != null && market.trm != null
          ? (market.cocoaUsdT * market.trm) / 1000
          : null;

      const filter = str(input.company).toLowerCase();
      const latest = new Map<string, { date: string; price: number }>();
      for (const r of rows ?? []) {
        if (filter && !r.company.toLowerCase().includes(filter)) continue;
        // Las filas vienen ordenadas por fecha desc: la primera de cada
        // compañía es la vigente.
        if (!latest.has(r.company)) {
          latest.set(r.company, { date: r.date, price: Number(r.price_cop_kg) });
        }
      }

      const nacionales = [...latest.entries()]
        .map(([company, v]) => ({
          compania: company,
          fecha: v.date,
          precio_cop_kg: v.price,
          vs_internacional_cop_kg:
            iceCopKg != null ? Math.round(v.price - iceCopKg) : null,
          vs_internacional_pct:
            iceCopKg != null && iceCopKg > 0
              ? Number((((v.price - iceCopKg) / iceCopKg) * 100).toFixed(1))
              : null,
        }))
        .sort((a, b) => b.precio_cop_kg - a.precio_cop_kg);

      return {
        internacional: {
          contrato: market.cocoaContract,
          fecha: market.cocoaDate,
          usd_por_tonelada: market.cocoaUsdT,
          trm: market.trm,
          trm_fecha: market.trmDate,
          equivalente_cop_kg: iceCopKg != null ? Math.round(iceCopKg) : null,
        },
        nacionales,
        nota:
          iceCopKg == null
            ? "No se pudo obtener el precio internacional o la TRM; solo hay precios nacionales."
            : "La brecha positiva significa que el nacional paga por encima del equivalente internacional.",
      };
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
          contact_name: str(input.contact_name) || null,
          contact_email: str(input.contact_email).toLowerCase() || null,
          contact_phone: str(input.contact_phone).replace(/[^\d+]/g, "") || null,
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
