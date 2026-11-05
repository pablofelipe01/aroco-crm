import type { Metadata } from "next";
import { MarcoFirma } from "@/components/firma/marco-firma";
import { VerificarClient } from "./verificar-client";

export const metadata: Metadata = {
  title: "Verificar documento firmado",
  description: "Comprueba que un PDF firmado electrónicamente con AROCO no fue alterado.",
};

export default function VerificarPage() {
  return (
    <MarcoFirma etiqueta="Verificar documento · Verify document" pie="AROCO S.A.S · NIT 830.007.327-6 · info@aroco.co">
      <VerificarClient />
    </MarcoFirma>
  );
}
