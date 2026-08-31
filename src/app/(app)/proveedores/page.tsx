import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ProveedoresClient } from "./proveedores-client";
import type {
  ProveedorInsumo, ProveedorInsumoDocumento, CuentaCobro, CuentaCobroItem,
} from "@/lib/types/database";

export const dynamic = "force-dynamic";

export type ProveedorConTodo = ProveedorInsumo & {
  proveedor_insumo_documentos: ProveedorInsumoDocumento[];
};
export type CuentaConTodo = CuentaCobro & {
  cuenta_cobro_items: CuentaCobroItem[];
  proveedores_insumos: Pick<
    ProveedorInsumo,
    "id" | "codigo" | "tipo_persona" | "nombres" | "apellidos" | "razon_social" | "banco" | "numero_cuenta" | "tipo_cuenta" | "titular_cuenta"
  > | null;
};

export default async function ProveedoresPage() {
  const session = await getSessionContext();

  // Ver proveedores es de todo el equipo; DECIDIR sobre ellos, no. La pantalla
  // se muestra a cualquiera, pero los botones dependen del permiso — y las
  // acciones vuelven a comprobarlo, porque la interfaz se puede saltar.
  const supabase = await createClient();
  const [{ data: proveedores, error }, { data: cuentas }] = await Promise.all([
    supabase
      .from("proveedores_insumos")
      .select("*, proveedor_insumo_documentos(*)")
      .order("created_at", { ascending: false }),
    supabase
      .from("cuentas_cobro")
      .select(
        "*, cuenta_cobro_items(*), proveedores_insumos(id, codigo, tipo_persona, nombres, apellidos, razon_social, banco, numero_cuenta, tipo_cuenta, titular_cuenta)",
      )
      .order("created_at", { ascending: false }),
  ]);

  if (!session?.profile) {
    return (
      <div>
        <PageHeader title="Proveedores" />
        <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="Acceso restringido" />
      </div>
    );
  }

  return (
    <ProveedoresClient
      // Cast a través de unknown: los tipos generados declaran las relaciones
      // vacías, así que el embed no se resuelve solo. Es el mismo patrón que
      // usa /compras.
      proveedores={(proveedores ?? []) as unknown as ProveedorConTodo[]}
      cuentas={(cuentas ?? []) as unknown as CuentaConTodo[]}
      puedeVerificar={session.profile.verifica_proveedores === true}
      error={error?.message ?? null}
    />
  );
}
