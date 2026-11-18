"use client";

import * as React from "react";
import { Input, Select } from "@/components/ui/input";
import {
  NOMBRE_DOCUMENTO,
  TIPOS_DOCUMENTO,
  partirDocumento,
  unirDocumento,
  type IdiomaFirma,
  type TipoDocumento,
} from "@/lib/firmas/tipos";

/**
 * Tipo de documento (menú) + número. Pedido de Nicolás (2026-11-17): antes era
 * un solo campo libre «Cédula / NIT / pasaporte». Hacia afuera sigue siendo un
 * texto («C.C. 1.234.567»), que es lo que guarda la base y sale en el
 * certificado.
 */
export function CampoDocumento({
  valor,
  onCambio,
  idioma = "es",
  etiquetaTipo,
  etiquetaNumero,
  placeholder,
}: {
  valor: string;
  onCambio: (texto: string) => void;
  idioma?: IdiomaFirma;
  etiquetaTipo: string;
  etiquetaNumero: string;
  placeholder?: string;
}) {
  // El tipo vive aquí: con el número vacío el texto es "" y no lo recordaría.
  const inicial = React.useMemo(() => partirDocumento(valor), [valor]);
  const [tipo, setTipo] = React.useState<TipoDocumento>(inicial.tipo);
  const numero = valor ? inicial.numero : "";

  return (
    <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-2">
      <Select
        aria-label={etiquetaTipo}
        value={tipo}
        onChange={(e) => {
          const t = e.target.value as TipoDocumento;
          setTipo(t);
          onCambio(unirDocumento(t, numero, idioma));
        }}
      >
        {TIPOS_DOCUMENTO.map((t) => (
          <option key={t} value={t}>
            {NOMBRE_DOCUMENTO[t][idioma]}
          </option>
        ))}
      </Select>
      <Input
        aria-label={etiquetaNumero}
        placeholder={placeholder}
        inputMode={tipo === "CC" ? "numeric" : "text"}
        className="font-mono tnum"
        value={numero}
        onChange={(e) => onCambio(unirDocumento(tipo, e.target.value, idioma))}
      />
    </div>
  );
}
