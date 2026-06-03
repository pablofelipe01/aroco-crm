import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { cotizar, type CotizadorInput } from "@/lib/calc/cotizador";
import { formatUSD, formatCOP, formatNumber, formatDate } from "@/lib/utils";
import type { Quote } from "@/lib/types/database";
import { PrintTrigger } from "./print-trigger";

export const dynamic = "force-dynamic";

function rowToInput(q: Quote): CotizadorInput {
  return {
    incoterm: q.incoterm,
    trm: q.trm,
    precioCompraKg: q.purchase_price_cop_kg,
    cocoaUsdT: q.cocoa_usd_t,
    diferencial: q.differential,
    volumenTM: q.volume_tm,
    comisionPct: q.commission_pct,
    transporteBodega: q.transporte_bodega,
    seleccion: q.seleccion,
    fumigacion: q.fumigacion,
    estibas: q.estibas,
    costales: q.costales,
    coberturas: q.coberturas,
    costosExportacion: q.costos_exportacion,
    targetUtilityPct: q.target_utility_pct,
    bonifCalidad: q.bonif_calidad,
    bonifCadmio: q.bonif_cadmio,
    bonifTrazabilidad: q.bonif_trazabilidad,
    bonifTransporte: q.bonif_transporte,
  };
}

export default async function QuotePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("*, lead:leads!quotes_lead_id_fkey(company)")
    .eq("id", id)
    .maybeSingle();

  if (!quote) notFound();

  const calc = cotizar(rowToInput(quote as Quote));
  const client =
    quote.client_name ??
    (quote.lead as { company?: string } | null)?.company ??
    "—";

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

      {/* Header */}
      <div className="flex items-start justify-between border-b-2 border-[#1B4332] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1B4332]">
            AROCO S.A.S
          </h1>
          <p className="text-sm text-[#6B6760]">
            Exportación y comercialización de cacao colombiano
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-[#9B9790]">
            Cotización
          </p>
          <p className="font-mono text-lg font-bold">{quote.quote_number ?? "—"}</p>
          <p className="text-xs text-[#6B6760]">{formatDate(quote.created_at)}</p>
        </div>
      </div>

      {/* Meta */}
      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <Meta label="Cliente" value={client} />
        <Meta label="Incoterm" value={quote.incoterm} />
        <Meta label="Mercado" value={quote.market ?? "—"} />
        <Meta label="Volumen" value={`${formatNumber(quote.volume_tm)} TM`} />
        {quote.port_origin && <Meta label="Puerto origen" value={quote.port_origin} />}
        {quote.port_destination && (
          <Meta label="Puerto destino" value={quote.port_destination} />
        )}
        <Meta label="TRM" value={formatNumber(quote.trm, 2)} />
        <Meta label="Validez" value={`${quote.validity_days ?? 0} días`} />
      </div>

      {/* Cost breakdown */}
      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b border-[#E0DCCF] text-left text-xs uppercase tracking-wide text-[#9B9790]">
            <th className="py-2">Concepto</th>
            <th className="py-2 text-right">USD/TM</th>
            <th className="py-2 text-right">COP/TM</th>
          </tr>
        </thead>
        <tbody>
          {calc.lines
            .filter((l) => l.usdPerTm !== 0)
            .map((l) => (
              <tr key={l.key} className="border-b border-[#EDEAE3]">
                <td className="py-1.5">{l.label}</td>
                <td className="py-1.5 text-right font-mono">{formatUSD(l.usdPerTm)}</td>
                <td className="py-1.5 text-right font-mono">{formatCOP(l.copPerTm)}</td>
              </tr>
            ))}
          {quote.costos_exportacion > 0 && (
            <tr className="border-b border-[#EDEAE3]">
              <td className="py-1.5">{calc.costosExportacion.label}</td>
              <td className="py-1.5 text-right font-mono">
                {formatUSD(calc.costosExportacion.usdPerTm)}
              </td>
              <td className="py-1.5 text-right font-mono">
                {formatCOP(calc.costosExportacion.copPerTm)}
              </td>
            </tr>
          )}
          <tr className="border-b border-[#EDEAE3]">
            <td className="py-1.5">Comisión</td>
            <td className="py-1.5 text-right font-mono">{formatUSD(calc.comisionUsdTm)}</td>
            <td className="py-1.5 text-right font-mono">
              {formatCOP(calc.comisionUsdTm * quote.trm)}
            </td>
          </tr>
          <tr className="border-b border-[#E0DCCF] font-semibold">
            <td className="py-2">Costo total</td>
            <td className="py-2 text-right font-mono">{formatUSD(calc.costoTotalUsdTm)}</td>
            <td className="py-2 text-right font-mono">
              {formatCOP(calc.costoTotalUsdTm * quote.trm)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Final price */}
      <div className="mt-8 rounded-lg bg-[#D8F3DC] p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#1B4332]">
              Precio final ({quote.incoterm})
            </p>
            <p className="font-mono text-3xl font-bold text-[#1B4332]">
              {formatUSD(calc.precioFinalUsdTm)}
              <span className="text-base font-normal"> /TM</span>
            </p>
            <p className="font-mono text-sm text-[#2D6A4F]">
              {formatCOP(calc.precioFinalCopTm)} /TM
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-[#1B4332]">Utilidad</p>
            <p className="font-mono text-xl font-bold text-[#1B4332]">
              {(calc.utilidadPct * 100).toFixed(2)}%
            </p>
          </div>
        </div>
        <div className="mt-3 border-t border-[#95D5B2] pt-3 text-sm">
          <span className="text-[#2D6A4F]">
            Total operación ({formatNumber(quote.volume_tm)} TM):
          </span>{" "}
          <span className="font-mono font-semibold text-[#1B4332]">
            {formatUSD(calc.totalOperacionUsd)} · {formatCOP(calc.totalOperacionCop)}
          </span>
        </div>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-[#9B9790]">
        Cotización generada por la plataforma AROCO. Precios sujetos a confirmación
        y a la validez indicada. Valores de referencia; verificar condiciones
        comerciales antes de cerrar la operación.
      </p>

      <PrintTrigger />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-[#EDEAE3] py-1">
      <span className="text-[#9B9790]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
