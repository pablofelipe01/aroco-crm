import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { todas } from "@/lib/supabase/todas";
import { InventarioClient } from "./inventario-client";
import type { InventoryLot } from "@/lib/types/database";

export const dynamic = "force-dynamic";

// Los mismos departamentos que las políticas RLS de cada tabla: lotes y
// ajustes por un lado, salidas (dispatches) por otro.
const WRITE_DEPTS = ["Bodega Central", "Administrativo", "Operaciones"];
const SALIDA_DEPTS = ["Bodega Central", "Comercial", "Operaciones"];

export default async function InventarioPage() {
  const supabase = await createClient();
  const session = await getSessionContext();
  const esAdmin = session?.profile?.role === "admin";
  const depto = session?.profile?.department ?? null;

  const [{ data: lots }, { data: cfg }, { data: proveedores }, destinos] = await Promise.all([
    supabase
      .from("inventory_lots")
      .select("*")
      .order("entry_date", { ascending: false, nullsFirst: false }),
    supabase.from("inventario_config").select("fuente").maybeSingle(),
    supabase
      .from("proveedores")
      .select("id, nombre, departamento, municipio")
      .order("nombre"),
    todas((desde, hasta) =>
      supabase.from("dispatches").select("id, destination").order("id").range(desde, hasta),
    ),
  ]);

  return (
    <InventarioClient
      initialLots={(lots ?? []) as InventoryLot[]}
      canWrite={esAdmin || (depto != null && WRITE_DEPTS.includes(depto))}
      puedeSalida={esAdmin || (depto != null && SALIDA_DEPTS.includes(depto))}
      esAdmin={esAdmin}
      modoCrm={cfg?.fuente === "crm"}
      proveedores={proveedores ?? []}
      destinos={[...new Set(destinos.map((d) => d.destination?.trim()).filter(Boolean) as string[])].sort()}
    />
  );
}
