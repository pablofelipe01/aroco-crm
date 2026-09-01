"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  GitBranch,
  StickyNote,
  ListChecks,
  Boxes,
  Users,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/provider";
import type { Diccionario } from "@/lib/i18n/es";
import { executeAgentAction, type AgentProposal } from "./actions";

function describir(
  p: AgentProposal,
  t: Diccionario,
): { Icon: React.ElementType; title: string; detail: string } {
  switch (p.kind) {
    case "lead_status":
      return {
        Icon: GitBranch,
        title: `${t.asistente.cambiarEstado} · ${p.company}`,
        detail: `${p.from ?? "—"} → ${p.status}`,
      };
    case "lead_note":
      return {
        Icon: StickyNote,
        title: `${t.asistente.agregarNota} · ${p.company}`,
        detail: `“${p.note}”`,
      };
    case "create_task":
      return {
        Icon: ListChecks,
        title: t.asistente.crearTarea,
        detail: `${p.name}${p.person_name ? ` · ${p.person_name}` : ""}${
          p.due_date ? ` · ${t.asistente.vence} ${p.due_date}` : ""
        }`,
      };
    case "inventory_movement":
      return {
        Icon: Boxes,
        title: `${
          p.movement === "salida" ? t.asistente.salida : t.asistente.entrada
        } · ${p.code}`,
        detail: `${p.qty_kg} kg${
          p.available != null ? ` (${t.asistente.disp} ${p.available})` : ""
        }`,
      };
    case "create_lead":
      return {
        Icon: Users,
        title: t.asistente.crearLead,
        detail: `${p.company}${p.owner_name ? ` · ${p.owner_name}` : ""}${
          p.market ? ` · ${p.market}` : ""
        }`,
      };
    case "create_quote":
      return {
        Icon: FileText,
        title: t.asistente.crearCotizacion,
        detail: `${p.incoterm} · ${p.company}${
          p.preview_usd_tm != null ? ` · ≈ $${p.preview_usd_tm}/TM` : ""
        }`,
      };
  }
}

/**
 * Una acción propuesta por el modelo, con su botón de confirmar.
 *
 * Nada de lo que propone el asistente se ejecuta solo: la tarjeta es el paso
 * donde una persona mira lo que se va a hacer y lo aprueba. Vive aparte porque
 * la usan los dos chats —el asistente general y el analista de Mercado— y dos
 * copias del mismo botón acabarían aplicando criterios distintos.
 */
export function TarjetaPropuesta({ propuesta }: { propuesta: AgentProposal }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [estado, setEstado] = React.useState<
    "pendiente" | "aplicada" | "descartada"
  >("pendiente");
  const [aplicando, setAplicando] = React.useState(false);
  const { Icon, title, detail } = describir(propuesta, t);

  async function confirmar() {
    setAplicando(true);
    const res = await executeAgentAction(propuesta);
    setAplicando(false);
    if (!res.ok) {
      toast({
        tone: "error",
        title: t.asistente.noSeAplico,
        description: res.error,
      });
      return;
    }
    setEstado("aplicada");
    toast({
      tone: "success",
      title: t.asistente.accionAplicada,
      description: res.message,
    });
    router.refresh();
  }

  return (
    <div className="border-accent/40 bg-accent-soft/30 max-w-[88%] self-start rounded-[var(--radius-md)] border p-3">
      <div className="flex items-start gap-2">
        <Icon className="text-accent mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 text-sm">
          <p className="text-fg font-medium">{title}</p>
          <p className="text-fg-muted text-xs">{detail}</p>
        </div>
      </div>

      {estado === "aplicada" ? (
        <p className="text-success mt-2 flex items-center gap-1 text-xs font-medium">
          <Check className="h-3.5 w-3.5" /> {t.asistente.aplicado}
        </p>
      ) : estado === "descartada" ? (
        <p className="text-fg-subtle mt-2 text-xs">{t.asistente.descartado}</p>
      ) : (
        <div className="mt-2.5 flex items-center gap-2">
          <Button size="sm" loading={aplicando} onClick={confirmar}>
            <Check className="h-3.5 w-3.5" />
            {t.asistente.confirmar}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEstado("descartada")}
          >
            <X className="h-3.5 w-3.5" />
            {t.asistente.descartar}
          </Button>
        </div>
      )}
    </div>
  );
}
