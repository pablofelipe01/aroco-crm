import { createClient } from "@/lib/supabase/server";
import { agregarVentas, type DespachoVenta } from "@/lib/ventas";
import { VentasClient } from "./ventas-client";

export const dynamic = "force-dynamic";

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string }>;
}) {
  const supabase = await createClient();
  const { anio: anioParam } = await searchParams;

  const { data } = await supabase
    .from("dispatches")
    .select(
      "dispatch_date, destination, qty_kg, qty_premium_kg, qty_corriente_kg, qty_corriente_c_kg, qty_organico_kg",
    );
  const despachos = (data ?? []) as DespachoVenta[];

  // Años con despachos, para el selector. Si aún no hay nada, el actual.
  const hoy = new Date();
  const anios = [
    ...new Set(
      despachos
        .map((d) => d.dispatch_date?.slice(0, 4))
        .filter((a): a is string => !!a),
    ),
  ]
    .map(Number)
    .sort((a, b) => b - a);
  if (anios.length === 0) anios.push(hoy.getFullYear());

  const pedido = Number(anioParam);
  const anio = anios.includes(pedido) ? pedido : anios[0];

  return (
    <VentasClient
      ventas={agregarVentas(despachos, anio, hoy)}
      anio={anio}
      anios={anios}
    />
  );
}
