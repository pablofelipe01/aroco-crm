"use client";

import * as React from "react";
import { Check, Copy, MailCheck, MailX } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export type EnlaceFirma = { firmanteId: string; nombre: string; enlace: string; enviado: boolean; error?: string };

/**
 * Los enlaces de firma en claro, una sola vez. En la base solo queda su hash:
 * si se cierra esto sin copiarlos, se genera uno nuevo desde el sobre. Sirven
 * para mandarlos por WhatsApp cuando el correo no llega o la persona no lo usa.
 */
export function EnlacesModal({ enlaces, onClose }: { enlaces: EnlaceFirma[]; onClose: () => void }) {
  return (
    <Modal
      open={enlaces.length > 0}
      onClose={onClose}
      title="Enlaces de firma"
      description="Cópialos ahora si los vas a mandar por WhatsApp: por seguridad no se vuelven a mostrar."
      footer={<Button onClick={onClose}>Listo</Button>}
    >
      <ul className="flex flex-col gap-3">
        {enlaces.map((e) => (
          <FilaEnlace key={e.firmanteId} e={e} />
        ))}
      </ul>
    </Modal>
  );
}

function FilaEnlace({ e }: { e: EnlaceFirma }) {
  const [copiado, setCopiado] = React.useState(false);
  return (
    <li className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-fg">{e.nombre}</span>
        {e.enviado ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <MailCheck className="h-3.5 w-3.5" /> Correo enviado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-danger" title={e.error}>
            <MailX className="h-3.5 w-3.5" /> Correo no enviado: compártelo a mano
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          readOnly
          value={e.enlace}
          aria-label={`Enlace de ${e.nombre}`}
          onFocus={(ev) => ev.currentTarget.select()}
          className="h-8 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-bg-subtle px-2 font-mono text-xs text-fg-muted"
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(e.enlace);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          }}
        >
          {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </li>
  );
}
