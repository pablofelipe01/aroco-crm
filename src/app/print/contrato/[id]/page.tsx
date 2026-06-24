import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import type { Contrato, Proveedor } from "@/lib/types/database";
import { PrintTrigger } from "./print-trigger";

export const dynamic = "force-dynamic";

const AROCO = {
  rep: "ÁLVARO ACOSTA ESPINOSA",
  cedula: "79.946.333 de Bogotá",
  nit: "830.007.327-6",
  direccion: "Carrera 90 # 81 a 14, Barrio La Primavera, Engativá",
  tel: "+57 310 212 8520",
  correo: "info@aroco.co",
  ciudad: "Bogotá D.C.",
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export default async function ContratoPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const [{ data: prov }, { data: cont }] = await Promise.all([
    supabase.from("proveedores").select("*").eq("id", id).maybeSingle(),
    supabase.from("contratos").select("*").eq("proveedor_id", id).maybeSingle(),
  ]);
  if (!prov) notFound();

  const p = prov as Proveedor;
  const c = (cont ?? {}) as Partial<Contrato>;

  const repLegal = (p.representante_legal || p.nombre || "").toUpperCase();
  const repDoc = p.documento_representante || p.numero_documento || "______________";
  const nit = p.numero_documento || "______________";
  const codigo = c.numero_contrato || "CTO-AROCM-____";
  const hoy = new Date();
  const fecha = `${hoy.getDate()} de ${MESES[hoy.getMonth()]} del año ${hoy.getFullYear()}`;
  const humedadMax = c.humedad_maxima != null ? `${(c.humedad_maxima * 100).toFixed(c.humedad_maxima < 1 ? 0 : 2)}%` : "7%";

  return (
    <div className="mx-auto max-w-[800px] bg-white px-10 py-12 font-serif text-[12.5px] leading-relaxed text-black">
      <PrintTrigger />

      <p className="text-center text-xs font-semibold tracking-wide">{codigo} · AROCO SAS – {p.nombre}</p>
      <h1 className="mt-4 text-center text-base font-bold">
        CONTRATO DE COMPRA DE CACAO — AROCO SAS y {p.nombre.toUpperCase()}
      </h1>

      <p className="mt-5 text-justify">
        Entre los suscritos <b>{repLegal}</b>, mayor de edad, identificado(a) con documento No.{" "}
        <b>{repDoc}</b>, quien actúa en nombre y representación de <b>{p.nombre}</b>
        {nit ? <> con NIT/documento <b>{nit}</b></> : null}, parte que en adelante se denominará{" "}
        <b>EL PROVEEDOR</b>, y <b>{AROCO.rep}</b>, mayor de edad, vecino de la ciudad de Bogotá,
        identificado con la cédula de ciudadanía {AROCO.cedula}, quien obra en nombre y representación
        legal de <b>AROCO SAS</b> con NIT {AROCO.nit}, quien en adelante se llamará <b>AROCO SAS</b>,
        quienes en conjunto, en adelante <b>LAS PARTES</b>, han convenido celebrar el presente contrato
        de suministro que se regirá por las siguientes cláusulas.
      </p>

      <Clausula t="PRIMERA. Objeto:">
        El presente contrato tiene por objeto la compra y venta de cacao en grano seco acopiado por EL
        PROVEEDOR, en calidad de vendedor, a AROCO SAS, en calidad de comprador. EL PROVEEDOR se obliga
        a suministrar a AROCO SAS el cacao en las cantidades, calidades y condiciones pactadas, conforme
        a los estándares de producción y certificación aplicables; mientras que AROCO SAS se compromete
        a adquirir dicho producto y a realizar el pago correspondiente en los términos de este contrato.
      </Clausula>

      <Clausula t="SEGUNDA. Compromiso de oferta y limitación de compra:">
        EL PROVEEDOR se compromete a ofrecer a AROCO SAS la mayor cantidad de cacao en grano disponible,
        garantizando prioridad de suministro conforme a las condiciones de calidad pactadas. AROCO SAS se
        reserva el derecho de determinar las cantidades efectivamente compradas en cada operación, de
        acuerdo con sus necesidades de abastecimiento, capacidad financiera y condiciones de mercado. En
        ningún caso se interpretará este contrato como obligación de compra de la totalidad de la
        producción. Cada operación de compraventa se perfeccionará únicamente mediante la emisión y
        aceptación de una orden de compra específica (cantidades, precios, condiciones de entrega y pago).
      </Clausula>

      <Clausula t="TERCERA. Ubicación:">
        La sede de EL PROVEEDOR ({p.nombre}) se encuentra ubicada en {p.municipio || "____"}
        {p.direccion ? <>, dirección: {p.direccion}</> : null}.
      </Clausula>

      <Clausula t="CUARTA. Establecimiento del precio:">
        El precio será fijado en el momento de la operación de compraventa y será estimado semanalmente:
        precio promedio de la bolsa de Nueva York en la semana respectiva, indexado a pesos con la TRM
        promedio de la semana; se sumará o descontará la prima obtenida con los clientes de AROCO y la
        prima por condiciones de calidad (Cláusula Séptima); se restarán los costos logísticos y de
        preparación hasta puerto y el margen de comercialización de AROCO; y se descontará el 3% de la
        cuota de fomento cacaotero o el valor determinado por las entidades correspondientes.
      </Clausula>

      <Clausula t="QUINTA. Forma de pago:">
        El pago se efectuará con base en el peso neto determinado en báscula certificada por AROCO SAS en
        el lugar de recepción acordado, aplicando los descuentos, bonificaciones o ajustes pactados
        (humedad, impurezas, calidad). El pago se realizará dentro de los dos (2) días hábiles siguientes
        a la recepción y pesaje, mediante transferencia bancaria u otro mecanismo acordado, previa
        presentación de las facturas o cuentas de cobro. <i>Parágrafo:</i> EL PROVEEDOR podrá solicitar un
        anticipo no superior al 50% del monto total de la orden; AROCO SAS comunicará su aceptación o
        rechazo dentro de un (1) día hábil.
      </Clausula>

      <Clausula t="SEXTA. Sitio de entrega:">
        El cacao será entregado por EL PROVEEDOR a AROCO SAS en su planta ubicada en la ciudad de Bogotá
        o en el sitio que de común acuerdo se defina entre las partes.
      </Clausula>

      <Clausula t="SÉPTIMA. Condiciones técnicas del cacao:">
        El cacao deberá cumplir con las exigencias de calidad de la Norma Icontec 1252, verificadas por
        AROCO SAS. Humedad máxima pactada: <b>{humedadMax}</b>.
        {c.granos_enteros_minimo != null && <> Granos enteros mínimo: <b>{(c.granos_enteros_minimo * 100).toFixed(c.granos_enteros_minimo < 1 ? 0 : 2)}%</b>.</>}
        {c.fermentacion_minima != null && <> Fermentación mínima: <b>{(c.fermentacion_minima * 100).toFixed(c.fermentacion_minima < 1 ? 0 : 2)}%</b>.</>}
      </Clausula>

      <table className="mt-2 w-full border-collapse text-[11px]">
        <thead>
          <tr>
            {["Requisito", "Premium", "Corriente", "Pasilla"].map((h) => (
              <th key={h} className="border border-black px-1.5 py-1 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ["Humedad, % máx.", "7", "7,5", "7,5"],
            ["Impurezas, % máx.", "0", "0,3", "0,5"],
            ["Granos mohosos internos /100, máx.", "2", "2", "3"],
            ["Dañados por insectos/germinados /100, máx.", "1", "2", "—"],
            ["Bien fermentados /100, mín.", "70", "65", "60"],
            ["Insuf. fermentados /100, máx.", "25", "35", "40"],
            ["Pizarrosos /100, máx.", "1", "3", "3"],
          ].map((r) => (
            <tr key={r[0]}>
              {r.map((cell, i) => (
                <td key={i} className="border border-black px-1.5 py-0.5">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <Clausula t="OCTAVA. Diferencias de calidad:">
        En caso de incumplimiento de los parámetros, el precio se ajustará proporcionalmente: por cada
        punto porcentual de humedad sobre el máximo se descuenta 1% del valor; por cada 0,1% de impurezas
        adicional, 0,5%; por cada grano adicional de mohosos/dañados/pizarrosos, 0,25%; por cada 5 granos
        adicionales de insuficientemente fermentados, 0,5%. Los descuentos son acumulativos y se reflejan
        en la liquidación final.
        {c.sanciones_calidad && <><br /><b>Sanciones por calidad pactadas:</b> {c.sanciones_calidad}</>}
        {c.bonificaciones_calidad && <><br /><b>Bonificaciones por calidad pactadas:</b> {c.bonificaciones_calidad}</>}
      </Clausula>

      <Clausula t="NOVENA. Duración:">
        Duración inicial de un (1) año contado a partir de la firma, prorrogable automáticamente si no
        media solicitud escrita de alguna de las partes para su finalización.
      </Clausula>

      <Clausula t="DÉCIMA a DÉCIMO PRIMERA. Vigilancia, control e inspección:">
        AROCO SAS podrá ejercer vigilancia sobre cualquier aspecto de la ejecución del contrato y efectuar
        en cualquier tiempo visitas de inspección a los cultivos a través de su Departamento de Asistencia
        Técnica, sin que ello exonere a EL PROVEEDOR del cumplimiento de sus obligaciones.
      </Clausula>

      <Clausula t="DÉCIMO SEGUNDA y TERCERA. Obligaciones de las partes:">
        EL PROVEEDOR asume los costos de siembra, mantenimiento, recolección, acopio, arreglo y selección
        del cacao hasta su entrega, y venderá dentro de los parámetros y volúmenes fijados. AROCO SAS
        recibirá y pesará en básculas certificadas, verificará la calidad por su inspector, podrá tomar
        muestras para análisis y reportará oportunamente el estado y calidad del cacao recibido.
      </Clausula>

      <Clausula t="DÉCIMO CUARTA. Terminación anticipada:">
        Por incumplimiento de cualquiera de las partes, insolvencia, cierre de la planta de AROCO SAS,
        desastres naturales o problemas fitosanitarios certificados, o por mutuo acuerdo. Las diferencias
        se resolverán de forma directa y amigable y, de fracasar, ante el Centro de Conciliación y
        Arbitraje competente.
      </Clausula>

      <Clausula t="DÉCIMO QUINTA a DÉCIMO SÉPTIMA. Cesión, modificaciones e impuesto de timbre:">
        El contrato no podrá cederse sin autorización escrita de las partes. Toda modificación deberá
        constar por escrito. El impuesto de timbre, si aplica, estará a cargo de ambas partes por
        partes iguales.
      </Clausula>

      <Clausula t="DÉCIMO OCTAVA. Comunicaciones:">
        <div className="mt-1 grid grid-cols-2 gap-4">
          <div>
            <p className="font-bold">EL CONTRATANTE: AROCO SAS</p>
            <p>{AROCO.rep} — Gerente General</p>
            <p>Dirección: {AROCO.direccion}</p>
            <p>Teléfono: {AROCO.tel}</p>
            <p>Correo: {AROCO.correo}</p>
            <p>Ciudad: {AROCO.ciudad}</p>
          </div>
          <div>
            <p className="font-bold">EL PROVEEDOR: {p.nombre}</p>
            <p>{p.representante_legal || p.nombre} — Representante Legal</p>
            <p>Dirección: {p.direccion || "—"}</p>
            <p>Teléfono: {p.celular || "—"}</p>
            <p>Correo: {p.email || "—"}</p>
            <p>Ciudad: {p.municipio || "—"}</p>
          </div>
        </div>
      </Clausula>

      <p className="mt-6 text-justify">
        Se firma en dos originales, el día {fecha}.
      </p>

      <div className="mt-16 grid grid-cols-2 gap-10 text-center text-[11px]">
        <div>
          <div className="border-t border-black pt-1">{AROCO.rep}</div>
          <p>AROCO SAS — Gerente General</p>
        </div>
        <div>
          <div className="border-t border-black pt-1">{p.representante_legal || p.nombre}</div>
          <p>{p.nombre} — Representante Legal</p>
        </div>
      </div>
    </div>
  );
}

function Clausula({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="font-bold">{t}</p>
      <p className="text-justify">{children}</p>
    </div>
  );
}
