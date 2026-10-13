import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { cotizar } from "@/lib/calc/cotizador";
import { formatUSD, formatCOP, formatNumber, formatDate } from "@/lib/utils";
import type { Quote } from "@/lib/types/database";
import { PrintTrigger } from "../print-trigger";
import { rowToInput } from "../../cotizacion-input";

export const dynamic = "force-dynamic";

/**
 * PDF de la cotización para el cliente (revisión del CRM del 2026-10-09).
 *
 * Solo lo que el cliente puede ver: producto, incoterm, volumen, precio y
 * validez. Nada de costos, comisión, TRM ni utilidad: esos quedan en el PDF
 * interno (`../page.tsx`). El precio sale del mismo cálculo que el interno.
 *
 * Exportación (FOB/CIF) en USD; nacional en COP. `?lang=en` para clientes de
 * afuera.
 */

const AROCO = {
  nombre: "AROCO S.A.S",
  nit: "830.007.327-6",
  direccion: "Carrera 90 # 81 a 14, Barrio La Primavera, Engativá — Bogotá D.C., Colombia",
  tel: "+57 310 212 8520",
  correo: "info@aroco.co",
};

const TEXTOS = {
  es: {
    lema: "Exportación y comercialización de cacao colombiano",
    cotizacion: "Cotización",
    fecha: "Fecha",
    para: "Para",
    producto: "Producto",
    descripcion: "Cacao en grano seco (Theobroma cacao L.) — origen Colombia",
    condicion: "Condición de entrega",
    volumen: "Volumen",
    puertoOrigen: "Puerto de origen",
    puertoDestino: "Puerto de destino",
    precio: "Precio",
    porTm: "por tonelada métrica",
    porKg: "por kg",
    total: "Valor total",
    validaHasta: "Oferta válida hasta",
    condiciones: "Condiciones",
    condExport: (inc: string) =>
      `Precio por tonelada métrica (1.000 kg) en condición ${inc} (Incoterms® 2020).`,
    condNacional: "Precio por tonelada métrica (1.000 kg) para venta en el mercado nacional.",
    condDisponibilidad: "Oferta sujeta a disponibilidad del producto al momento de la confirmación.",
    condPago: "Forma de pago y fecha de entrega o embarque a convenir.",
    gracias: "Gracias por su interés en el cacao de AROCO.",
    otroIdioma: "English version",
    locale: "es-CO",
  },
  en: {
    lema: "Colombian cocoa beans — export and trading",
    cotizacion: "Quotation",
    fecha: "Date",
    para: "To",
    producto: "Product",
    descripcion: "Dried cocoa beans (Theobroma cacao L.) — origin Colombia",
    condicion: "Delivery terms",
    volumen: "Volume",
    puertoOrigen: "Port of loading",
    puertoDestino: "Port of destination",
    precio: "Price",
    porTm: "per metric ton",
    porKg: "per kg",
    total: "Total value",
    validaHasta: "Offer valid until",
    condiciones: "Terms",
    condExport: (inc: string) => `Price per metric ton (1,000 kg), ${inc} (Incoterms® 2020).`,
    condNacional: "Price per metric ton (1,000 kg) for sale in the Colombian market.",
    condDisponibilidad: "Offer subject to product availability at the time of confirmation.",
    condPago: "Payment terms and delivery or shipment date to be agreed.",
    gracias: "Thank you for your interest in AROCO cocoa.",
    otroIdioma: "Versión en español",
    locale: "en-US",
  },
};

export default async function QuoteClientPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { id } = await params;
  const { lang } = await searchParams;
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("*, lead:leads!quotes_lead_id_fkey(company)")
    .eq("id", id)
    .maybeSingle();

  if (!quote) notFound();

  const en = lang === "en";
  const t = en ? TEXTOS.en : TEXTOS.es;
  const calc = cotizar(rowToInput(quote as Quote));
  const client =
    quote.client_name ??
    (quote.lead as { company?: string } | null)?.company ??
    "—";
  const nacional = quote.incoterm === "NACIONAL";
  const condicion = nacional ? (en ? "Colombian market" : "Mercado nacional") : quote.incoterm;

  const validaHasta =
    quote.validity_days != null && quote.validity_days > 0
      ? new Date(new Date(quote.created_at).getTime() + quote.validity_days * 86_400_000)
      : null;

  // Exportación en USD; nacional en COP (el comprador nacional paga en pesos).
  const precioTm = nacional
    ? formatCOP(calc.precioFinalCopTm, t.locale)
    : formatUSD(calc.precioFinalUsdTm);
  const precioKg = nacional
    ? formatCOP(calc.precioFinalCopTm / 1000, t.locale)
    : formatUSD(calc.precioFinalUsdTm / 1000, 3);
  const total = nacional
    ? formatCOP(calc.precioFinalCopTm * quote.volume_tm, t.locale)
    : formatUSD(calc.precioFinalUsdTm * quote.volume_tm);

  return (
    <div className="mx-auto max-w-3xl bg-white px-10 py-12 text-[#1A1814]">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 16mm; }
          body { background: #fff; }
        }
        body { background: #f5f3ee; }
      `}</style>

      <a
        href={en ? "?" : "?lang=en"}
        className="no-print fixed right-6 top-6 z-50 rounded-full border border-[#1B4332] bg-white px-4 py-2 text-sm font-medium text-[#1B4332] shadow hover:bg-[#D8F3DC]"
      >
        {t.otroIdioma}
      </a>

      {/* Encabezado */}
      <div className="flex items-start justify-between border-b-2 border-[#1B4332] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1B4332]">{AROCO.nombre}</h1>
          <p className="text-sm text-[#6B6760]">{t.lema}</p>
          <p className="mt-1 text-xs text-[#6B6760]">NIT {AROCO.nit}</p>
          <p className="max-w-[320px] text-xs text-[#6B6760]">{AROCO.direccion}</p>
          <p className="text-xs text-[#6B6760]">
            {AROCO.tel} · {AROCO.correo}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-[#9B9790]">{t.cotizacion}</p>
          <p className="font-mono text-lg font-bold">{quote.quote_number ?? "—"}</p>
          <p className="text-xs text-[#6B6760]">
            {t.fecha}: {formatDate(quote.created_at, t.locale)}
          </p>
        </div>
      </div>

      <p className="mt-6 text-sm">
        <span className="text-[#9B9790]">{t.para}:</span>{" "}
        <span className="font-semibold">{client}</span>
      </p>

      <div className="mt-4 grid grid-cols-1 gap-y-1 text-sm">
        <Meta label={t.producto} value={t.descripcion} />
        <Meta label={t.condicion} value={condicion} />
        <Meta label={t.volumen} value={`${formatNumber(quote.volume_tm, 2, t.locale)} TM`} />
        {quote.port_origin && <Meta label={t.puertoOrigen} value={quote.port_origin} />}
        {quote.port_destination && <Meta label={t.puertoDestino} value={quote.port_destination} />}
      </div>

      {/* Precio */}
      <div className="mt-8 rounded-lg bg-[#D8F3DC] p-5">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#1B4332]">
              {t.precio} ({condicion})
            </p>
            <p className="font-mono text-3xl font-bold text-[#1B4332]">
              {precioTm}
              <span className="text-base font-normal"> /TM</span>
            </p>
            <p className="font-mono text-sm text-[#2D6A4F]">
              {precioKg} {t.porKg}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-[#1B4332]">
              {t.total} ({formatNumber(quote.volume_tm, 2, t.locale)} TM)
            </p>
            <p className="font-mono text-xl font-bold text-[#1B4332]">{total}</p>
          </div>
        </div>
        {validaHasta && (
          <p className="mt-3 border-t border-[#95D5B2] pt-3 text-sm text-[#2D6A4F]">
            {t.validaHasta}:{" "}
            <span className="font-semibold text-[#1B4332]">{formatDate(validaHasta, t.locale)}</span>
          </p>
        )}
      </div>

      <section className="mt-8">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#1B4332]">
          {t.condiciones}
        </h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-[#3D3A34]">
          <li>{nacional ? t.condNacional : t.condExport(quote.incoterm)}</li>
          <li>{t.condDisponibilidad}</li>
          <li>{t.condPago}</li>
        </ul>
      </section>

      <p className="mt-10 text-sm text-[#6B6760]">{t.gracias}</p>

      <PrintTrigger />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 border-b border-[#EDEAE3] py-1">
      <span className="text-[#9B9790]">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
