import { createClient } from "@/lib/supabase/server";
import { agregarVentas, type VentaRow } from "@/lib/ventas";
import { VentasClient } from "./ventas-client";

export const dynamic = "force-dynamic";

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string }>;
}) {
  const supabase = await createClient();
  const { anio: anioParam } = await searchParams;

  const { data, error } = await supabase
    .from("ventas")
    .select("fecha, cliente, odc, kg, valor_total, bonificacion, valor_pagar, mercado")
    .order("fecha");
  const ventas = (data ?? []) as VentaRow[];

  const hoy = new Date();
  const anios = [...new Set(ventas.map((v) => v.fecha.slice(0, 4)))]
    .map(Number)
    .sort((a, b) => b - a);
  if (anios.length === 0) anios.push(hoy.getFullYear());

  const pedido = Number(anioParam);
  const anio = anios.includes(pedido) ? pedido : anios[0];

  return (
    <VentasClient
      ventas={agregarVentas(ventas, anio, hoy)}
      anio={anio}
      anios={anios}
      // Sin esto, una consulta rota se ve igual que un año sin ventas.
      error={error?.message ?? null}
      vacio={ventas.length === 0}
    />
  );
}
