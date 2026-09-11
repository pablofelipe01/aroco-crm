import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { ComisionesClient } from "./comisiones-client";
import { MonthlyTonnage } from "./monthly-tonnage";
import { OcComisiones, type OcComisionRow } from "./oc-comisiones";
import {
  Liquidacion,
  type LiquidacionLinea,
  type LiquidacionOperacion,
  type LiquidacionPeriodo,
} from "./liquidacion";
import type { CommissionRule, MonthlyTonnage as MonthlyTonnageRow, TeamMember } from "@/lib/types/database";
import type { CommissionRole } from "@/lib/calc/comisiones";

export const dynamic = "force-dynamic";

const WRITE_DEPTS = ["Financiero", "Comercial"];

export default async function ComisionesPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string }>;
}) {
  const supabase = await createClient();
  const session = await getSessionContext();
  const { anio: anioParam, mes: mesParam } = await searchParams;

  const canWrite =
    session?.profile?.role === "admin" ||
    (session?.profile?.department != null &&
      WRITE_DEPTS.includes(session.profile.department));
  const canEditRules =
    session?.profile?.role === "admin" ||
    session?.profile?.department === "Financiero";
  // The tonnage board is a Financiero/admin tool.
  const canEditTonnage =
    session?.profile?.role === "admin" ||
    session?.profile?.department === "Financiero";
  // Commission history (who participated per OC) is restricted to admins and
  // area heads. "Jefe de área" isn't modeled yet, so we approximate with
  // admin + Financiero (the area that owns commissions).
  const canSeeHistory =
    session?.profile?.role === "admin" ||
    session?.profile?.department === "Financiero";

  const [{ data: rules }, { data: team }, { data: tonnage }, { data: ocComerciales }] =
    await Promise.all([
      supabase.from("commission_rules").select("*").order("market").order("level"),
      supabase.from("team_members").select("*").eq("active", true).order("name"),
      supabase.from("monthly_tonnage").select("*").order("period", { ascending: false }),
      canSeeHistory
        ? supabase
            .from("oc_comerciales")
            .select(
              "orden_id, rol, team_members(name), ordenes_compra(consecutivo, valor_total, estado, created_at, proveedores(nombre))",
            )
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as never[] }),
    ]);

  // Group commercial participation by purchase order.
  const ocRows: OcComisionRow[] = [];
  if (canSeeHistory) {
    const raw = (ocComerciales ?? []) as unknown as {
      orden_id: string;
      rol: CommissionRole;
      team_members: { name?: string } | null;
      ordenes_compra: {
        consecutivo: string | null;
        valor_total: number | null;
        estado: string;
        proveedores: { nombre?: string } | null;
      } | null;
    }[];
    const byOrden = new Map<string, OcComisionRow>();
    for (const c of raw) {
      const oc = c.ordenes_compra;
      if (!oc) continue;
      let row = byOrden.get(c.orden_id);
      if (!row) {
        row = {
          ordenId: c.orden_id,
          consecutivo: oc.consecutivo,
          proveedor: oc.proveedores?.nombre ?? "—",
          valorTotal: oc.valor_total,
          estado: oc.estado,
          participantes: [],
        };
        byOrden.set(c.orden_id, row);
        ocRows.push(row);
      }
      row.participantes.push({
        nombre: c.team_members?.name ?? "—",
        rol: c.rol,
      });
    }
  }

  // ── Liquidación sincronizada de la hoja ───────────────────────────────────
  //
  // Qué meses hay se saca de las LÍNEAS y no de los periodos: un comercial no
  // puede leer `comision_periodos` —ahí está el total del equipo— y aun así
  // tiene que poder moverse por su propio histórico. La RLS ya recorta las
  // líneas a las suyas, así que la lista de meses le sale correcta sola.
  const veTodo = session?.profile?.ve_comisiones_todas ?? false;

  const { data: mesesData } = await supabase
    .from("comision_lineas")
    .select("anio, mes")
    .order("anio", { ascending: false })
    .order("mes", { ascending: false });

  const meses: { anio: number; mes: number }[] = [];
  for (const m of mesesData ?? []) {
    if (!meses.some((x) => x.anio === m.anio && x.mes === m.mes)) meses.push(m);
  }

  const pedido = { anio: Number(anioParam), mes: Number(mesParam) };
  const seleccion =
    meses.find((m) => m.anio === pedido.anio && m.mes === pedido.mes) ??
    meses[0] ??
    null;

  const [{ data: periodoData }, { data: lineasData }, { data: comerciales }] =
    await Promise.all([
      seleccion
        ? supabase
            .from("comision_periodos")
            .select("*")
            .eq("anio", seleccion.anio)
            .eq("mes", seleccion.mes)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      seleccion
        ? supabase
            .from("comision_lineas")
            .select("*")
            .eq("anio", seleccion.anio)
            .eq("mes", seleccion.mes)
            .order("total_pagar", { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase.from("comision_comerciales").select("nombre, profile_id"),
    ]);

  const nombrePerfil = new Map(
    (team ?? []).map((t) => [t.profile_id, t.name] as const),
  );
  const asignadoDe = new Map(
    (comerciales ?? []).map((c) => [
      c.nombre,
      c.profile_id ? (nombrePerfil.get(c.profile_id) ?? null) : null,
    ]),
  );

  const { data: opsData } = periodoData
    ? await supabase
        .from("comision_operaciones")
        .select("*")
        .eq("periodo_id", periodoData.id)
        .order("fila")
    : { data: [] };

  const n = (v: number | string | null) => Number(v ?? 0) || 0;

  const periodo: LiquidacionPeriodo | null = periodoData
    ? {
        anio: periodoData.anio,
        mes: periodoData.mes,
        mesNombre: periodoData.mes_nombre,
        toneladas: n(periodoData.toneladas),
        utilidad: n(periodoData.utilidad),
        totalComisiones: n(periodoData.total_comisiones),
        sumaLineas: n(periodoData.suma_lineas),
        umbralSeniorTon: periodoData.umbral_senior_ton === null ? null : n(periodoData.umbral_senior_ton),
        syncedAt: periodoData.synced_at,
      }
    : null;

  const lineas: LiquidacionLinea[] = (lineasData ?? []).map((l) => ({
    id: l.id,
    anio: l.anio,
    mes: l.mes,
    comercial: l.comercial,
    asignadoA: asignadoDe.get(l.comercial) ?? null,
    tonVenta: n(l.ton_venta),
    tonCompra: n(l.ton_compra),
    tonTotal: n(l.ton_total),
    nivel: l.nivel,
    pctTecho: l.pct_techo === null ? null : n(l.pct_techo),
    utilidadVenta: n(l.utilidad_venta),
    utilidadCompra: n(l.utilidad_compra),
    comisionVenta: n(l.comision_venta),
    comisionCompra: n(l.comision_compra),
    totalPagar: n(l.total_pagar),
  }));

  const operaciones: LiquidacionOperacion[] = (opsData ?? []).map((o) => ({
    id: o.id,
    fecha: o.fecha,
    cliente: o.cliente,
    odc: o.odc,
    descripcion: o.descripcion,
    kg: n(o.kg),
    vendedor: o.vendedor,
    comprador: o.comprador,
    utilidadNeta: n(o.utilidad_neta),
    comisionVendedor: n(o.comision_vendedor),
    comisionComprador: n(o.comision_comprador),
  }));

  return (
    <div className="space-y-8">
      {/* Va primero: es la cifra que la gente viene a mirar. El simulador y el
          tablero de toneladas son herramientas; esto es el resultado. */}
      <Liquidacion
        periodo={periodo}
        lineas={lineas}
        operaciones={operaciones}
        meses={meses}
        seleccion={seleccion}
        veTodo={veTodo}
      />
      <ComisionesClient
        rules={(rules ?? []) as CommissionRule[]}
        team={(team ?? []) as TeamMember[]}
        canWrite={canWrite}
        canEditRules={canEditRules}
      />
      {canSeeHistory && <OcComisiones rows={ocRows} />}
      <MonthlyTonnage
        team={(team ?? []) as TeamMember[]}
        records={(tonnage ?? []) as MonthlyTonnageRow[]}
        canWrite={canEditTonnage}
      />
    </div>
  );
}
