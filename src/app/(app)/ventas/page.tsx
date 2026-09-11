import { createClient } from "@/lib/supabase/server";
import { agregarVentas, type VentaRow } from "@/lib/ventas";
import { VentasClient } from "./ventas-client";
import { OperacionesMargen, type OperacionVista } from "./operaciones";

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

  // El margen por operación, de «VENTAS 2026». La RLS ya recorta a quien puede
  // verlo: si la consulta vuelve vacía, la tarjeta no se pinta.
  const { data: ops } = await supabase
    .from("ventas_operaciones")
    .select(
      "id, fecha, cliente, odc, origen, recepcion_kg, precio_base_proveedor, costo_real_kg, valor_a_pagar, pago_proveedor, bonificacion_proveedor, descuento_humedad, disponible_aroco, descuadre",
    )
    .order("fecha", { ascending: false, nullsFirst: false })
    .order("odc");

  const num = (v: number | string | null) => Number(v ?? 0) || 0;
  const operaciones: OperacionVista[] = (ops ?? []).map((o) => ({
    id: o.id,
    fecha: o.fecha,
    cliente: o.cliente,
    odc: o.odc,
    origen: o.origen,
    kg: num(o.recepcion_kg),
    precioBase: num(o.precio_base_proveedor),
    costoRealKg: o.costo_real_kg === null ? null : num(o.costo_real_kg),
    ventaKg: num(o.recepcion_kg) > 0 ? num(o.valor_a_pagar) / num(o.recepcion_kg) : 0,
    valorAPagar: num(o.valor_a_pagar),
    pagoProveedor: num(o.pago_proveedor),
    bonificacionProveedor: num(o.bonificacion_proveedor),
    descuentoHumedad: num(o.descuento_humedad),
    margen: num(o.disponible_aroco),
    descuadre: o.descuadre === null ? null : num(o.descuadre),
  }));

  return (
    <>
    <VentasClient
      ventas={agregarVentas(ventas, anio, hoy)}
      anio={anio}
      anios={anios}
      // Sin esto, una consulta rota se ve igual que un año sin ventas.
      error={error?.message ?? null}
      vacio={ventas.length === 0}
    />
    {operaciones.length > 0 && (
      <div className="mt-6">
        <OperacionesMargen operaciones={operaciones} />
      </div>
    )}
    </>
  );
}
