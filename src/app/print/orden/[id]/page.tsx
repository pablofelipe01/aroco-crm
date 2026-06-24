import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { COP, OC_CASO_LABEL } from "@/lib/procesos/oc-opts";
import type { OrdenCompra, Proveedor } from "@/lib/types/database";
import { PrintTrigger } from "./print-trigger";

export const dynamic = "force-dynamic";

const AROCO = {
  nombre: "AROCO SAS",
  nit: "830.007.327-6",
  direccion: "Carrera 90 # 81 a 14, Barrio La Primavera, Engativá — Bogotá D.C.",
  tel: "+57 310 212 8520",
  correo: "info@aroco.co",
  rep: "ÁLVARO ACOSTA ESPINOSA",
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function fechaLarga(d: Date) {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export default async function OrdenPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: oc } = await supabase.from("ordenes_compra").select("*").eq("id", id).maybeSingle();
  if (!oc) notFound();
  const o = oc as OrdenCompra;

  const { data: prov } = await supabase
    .from("proveedores")
    .select("*")
    .eq("id", o.proveedor_id)
    .maybeSingle();
  const p = (prov ?? {}) as Partial<Proveedor>;

  const emitida = o.estado === "Emitida";
  const enFirme = o.estado === "Aprobada" || o.estado === "Emitida";
  const fechaDoc = o.emitida_en ?? o.aprobada_en ?? o.created_at;
  const dash = "—";

  const filaProveedor: [string, string][] = [
    ["Proveedor", p.nombre ?? dash],
    ["Documento / NIT", p.numero_documento ?? dash],
    ["Ubicación", [p.municipio, p.departamento].filter(Boolean).join(", ") || dash],
    ["Contacto", [p.contacto, p.celular].filter(Boolean).join(" · ") || dash],
  ];

  const filaPago: [string, string][] = [
    ["Banco", p.banco ?? dash],
    ["Tipo de cuenta", p.tipo_cuenta ?? dash],
    ["No. de cuenta", p.numero_cuenta ?? dash],
    ["Titular", p.nombre_titular ?? p.nombre ?? dash],
  ];

  return (
    <div className="mx-auto max-w-[800px] bg-white px-10 py-12 font-sans text-[12.5px] leading-relaxed text-black">
      <PrintTrigger />

      {!enFirme && (
        <p className="mb-4 rounded border border-amber-500 bg-amber-50 px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-amber-700">
          Documento preliminar — la orden aún no está aprobada en firme
        </p>
      )}

      {/* Encabezado */}
      <div className="flex items-start justify-between border-b-2 border-[#1B4332] pb-4">
        <div>
          <h1 className="text-lg font-bold text-[#1B4332]">{AROCO.nombre}</h1>
          <p className="text-[11px] text-gray-600">NIT {AROCO.nit}</p>
          <p className="max-w-[280px] text-[11px] text-gray-600">{AROCO.direccion}</p>
          <p className="text-[11px] text-gray-600">{AROCO.tel} · {AROCO.correo}</p>
        </div>
        <div className="text-right">
          <h2 className="text-base font-bold tracking-wide text-[#1B4332]">ORDEN DE COMPRA</h2>
          <p className="mt-1 font-mono text-sm font-semibold">{o.consecutivo ?? "BORRADOR"}</p>
          <p className="text-[11px] text-gray-600">Fecha: {fechaLarga(new Date(fechaDoc))}</p>
          <p className="text-[11px] text-gray-600">Estado: {o.estado}</p>
          <p className="text-[11px] text-gray-600">Caso: {OC_CASO_LABEL[o.tipo_caso]}</p>
        </div>
      </div>

      {/* Proveedor */}
      <section className="mt-5">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#1B4332]">Proveedor</h3>
        <table className="w-full text-[12px]">
          <tbody>
            {filaProveedor.map(([k, v]) => (
              <tr key={k}>
                <td className="w-40 py-0.5 text-gray-500">{k}</td>
                <td className="py-0.5 font-medium">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Detalle del producto */}
      <section className="mt-5">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#1B4332]">Detalle</h3>
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-[#1B4332] text-white">
              <th className="border border-[#1B4332] px-2 py-1.5 text-left">Descripción</th>
              <th className="border border-[#1B4332] px-2 py-1.5 text-right">Volumen (kg)</th>
              <th className="border border-[#1B4332] px-2 py-1.5 text-right">Precio/kg</th>
              <th className="border border-[#1B4332] px-2 py-1.5 text-right">Valor total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 px-2 py-1.5">Cacao en grano seco</td>
              <td className="border border-gray-300 px-2 py-1.5 text-right">
                {o.volumen_kg != null ? o.volumen_kg.toLocaleString("es-CO") : dash}
              </td>
              <td className="border border-gray-300 px-2 py-1.5 text-right">
                {o.precio_kg != null ? COP.format(o.precio_kg) : dash}
              </td>
              <td className="border border-gray-300 px-2 py-1.5 text-right">
                {o.valor_total ? COP.format(o.valor_total) : dash}
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="border border-gray-300 px-2 py-1.5 text-right font-bold">
                TOTAL
              </td>
              <td className="border border-gray-300 px-2 py-1.5 text-right font-bold">
                {o.valor_total ? COP.format(o.valor_total) : dash}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Entrega y pago */}
      <section className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#1B4332]">Entrega</h3>
          <p className="text-[12px]">
            <span className="text-gray-500">Fecha: </span>
            {o.fecha_entrega ? new Date(o.fecha_entrega).toLocaleDateString("es-CO") : dash}
          </p>
          <p className="text-[12px]">
            <span className="text-gray-500">Lugar: </span>
            {o.lugar_entrega ?? dash}
          </p>
        </div>
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#1B4332]">
            Forma de pago
          </h3>
          <table className="w-full text-[12px]">
            <tbody>
              {filaPago.map(([k, v]) => (
                <tr key={k}>
                  <td className="w-28 py-0.5 text-gray-500">{k}</td>
                  <td className="py-0.5">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {o.observaciones && (
        <section className="mt-5">
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#1B4332]">
            Observaciones
          </h3>
          <p className="text-[12px] text-gray-700">{o.observaciones}</p>
        </section>
      )}

      <p className="mt-5 text-justify text-[10.5px] leading-snug text-gray-500">
        Esta orden de compra se rige por el contrato de suministro suscrito entre AROCO SAS y el
        proveedor. El pago se realizará una vez recibida y verificada la calidad del cacao en bodega,
        conforme a las sanciones y bonificaciones contractuales aplicables.
      </p>

      {/* Firmas */}
      <div className="mt-12 grid grid-cols-2 gap-10 text-center text-[12px]">
        <div>
          <div className="mx-auto w-56 border-t border-black pt-1">{AROCO.rep}</div>
          <p className="text-[11px] text-gray-600">Por AROCO SAS</p>
        </div>
        <div>
          <div className="mx-auto w-56 border-t border-black pt-1">{p.nombre ?? "EL PROVEEDOR"}</div>
          <p className="text-[11px] text-gray-600">Recibido — El Proveedor</p>
        </div>
      </div>

      {emitida && (
        <p className="mt-8 text-center text-[10px] text-gray-400">
          Orden emitida en firme el {new Date(o.emitida_en!).toLocaleString("es-CO")}.
        </p>
      )}
    </div>
  );
}
