import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/types/database";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ok = (c: boolean, m: string) => console.log(`${c ? "  ok  " : "  FALLA"} ${m}`);
const creados: string[] = [];
const fichas: string[] = [];

async function cuenta(tag: string) {
  const email = `tmp-${tag}-${Date.now() % 1e7}@proveedor.test`, pass = "Tmp!12345aA";
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true });
  if (error) throw error;
  creados.push(u.user.id);
  const cli = createClient<Database>(url, anon, { auth: { persistSession: false } });
  const { error: e2 } = await cli.auth.signInWithPassword({ email, password: pass });
  if (e2) throw e2;
  return { id: u.user.id, email, cli };
}

async function registrar(c: { id: string; email: string; cli: SupabaseClient<Database> }, doc: string) {
  const { data, error } = await c.cli.from("proveedores_insumos").insert({
    auth_user_id: c.id, tipo_persona: "Jurídica", tipo_documento: "NIT",
    numero_documento: doc, razon_social: `Prueba ${doc} SAS`,
    email: c.email, telefono: "3101234567", descripcion: "Insumos de prueba",
    categorias: ["Oficina"],
  }).select("id, estado").single();
  if (error) throw new Error(`registro: ${error.message}`);
  fichas.push(data.id);
  return data;
}

async function main() {
  console.log("1 · ESTRUCTURA");
  for (const t of ["proveedores_insumos", "proveedor_insumo_documentos", "cuentas_cobro", "cuenta_cobro_items"] as const) {
    const { error } = await admin.from(t).select("*").limit(1);
    ok(!error, `tabla ${t}`);
  }
  const { data: verif } = await admin.from("profiles").select("full_name").eq("verifica_proveedores", true);
  ok((verif?.length ?? 0) === 1, `verifica proveedores: ${(verif ?? []).map(v => v.full_name).join(", ") || "nadie"}`);

  console.log("\n2 · UN PROVEEDOR NO VE EL CRM");
  const a = await cuenta("a");
  const fa = await registrar(a, "9001112223");
  ok(fa.estado === "Pendiente", "se registra en estado Pendiente");
  for (const t of ["tasks", "meetings", "ventas", "broker_positions", "profiles", "inventory_lots", "leads", "compra_solicitudes"] as const) {
    const { data } = await a.cli.from(t).select("*").limit(5);
    ok((data?.length ?? 0) === 0, `no ve ${t} (${data?.length ?? 0} filas)`);
  }

  console.log("\n3 · SOLO SU PROPIA FICHA");
  const b = await cuenta("b");
  await registrar(b, "9004445556");
  const { data: veA } = await a.cli.from("proveedores_insumos").select("id, razon_social");
  ok(veA?.length === 1 && veA[0].id === fa.id, `A ve 1 ficha, la suya (ve ${veA?.length})`);

  console.log("\n4 · NO PUEDE ACTIVARSE SOLO");
  const { error: eAct } = await a.cli.from("proveedores_insumos").update({ estado: "Activo" }).eq("id", fa.id);
  const { data: tras } = await admin.from("proveedores_insumos").select("estado").eq("id", fa.id).single();
  ok(tras?.estado === "Pendiente", `sigue Pendiente${eAct ? " · " + eAct.message.slice(0, 60) : ""}`);

  console.log("\n5 · NO PUEDE COBRAR SIN ESTAR ACTIVO");
  const { data: cc1 } = await a.cli.from("cuentas_cobro").insert({ proveedor_id: fa.id, concepto: "prueba" }).select("id");
  ok(!cc1?.length, "un proveedor Pendiente no radica cuentas de cobro");

  console.log("\n6 · MILENA LO ACTIVA, Y AHÍ SÍ COBRA");
  await admin.from("proveedores_insumos").update({ estado: "Activo", verificado_en: new Date().toISOString() }).eq("id", fa.id);
  const { data: cc2, error: eCc } = await a.cli.from("cuentas_cobro").insert({ proveedor_id: fa.id, concepto: "Papelería agosto" }).select("id, consecutivo").single();
  ok(!!cc2, `ya activo, radica: ${cc2?.consecutivo}${eCc ? " · " + eCc.message : ""}`);
  if (cc2) {
    const { error: eIt } = await a.cli.from("cuenta_cobro_items").insert({ cuenta_id: cc2.id, descripcion: "Resmas", cantidad: 10, valor_unitario: 18000 });
    ok(!eIt, "puede agregar ítems a su cuenta");
    const { data: veB } = await b.cli.from("cuentas_cobro").select("id");
    ok((veB?.length ?? 0) === 0, "B no ve las cuentas de cobro de A");
  }

  console.log("\n7 · CAMBIAR LA CUENTA BANCARIA LO DEVUELVE A VERIFICACIÓN");
  await a.cli.from("proveedores_insumos").update({ numero_cuenta: "9999888877", banco: "Bancolombia" }).eq("id", fa.id);
  const { data: post } = await admin.from("proveedores_insumos").select("estado, motivo_rechazo").eq("id", fa.id).single();
  ok(post?.estado === "Pendiente", `volvió a Pendiente: «${post?.motivo_rechazo?.slice(0, 50)}»`);

  console.log("\n8 · NO PUEDE TOCAR LA FICHA DE OTRO");
  await a.cli.from("proveedores_insumos").update({ razon_social: "HACKEADO" }).eq("numero_documento", "9004445556");
  const { data: bOk } = await admin.from("proveedores_insumos").select("razon_social").eq("numero_documento", "9004445556").single();
  ok(!bOk?.razon_social?.includes("HACKEADO"), `la ficha de B quedó intacta: ${bOk?.razon_social}`);

  for (const f of fichas) await admin.from("proveedores_insumos").delete().eq("id", f);
  for (const id of creados) await admin.auth.admin.deleteUser(id);
  console.log(`\n  (${creados.length} cuentas y ${fichas.length} fichas de prueba borradas)`);
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
