"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Trash2,
  Send,
  Phone,
  Mail,
  MessageCircle,
  Users2,
  StickyNote,
  GitBranch,
  Building2,
} from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { LEAD_STAGE_TONE, type LeadStage } from "@/lib/status";
import { ACTIVITY_TYPES } from "@/lib/schemas/lead";
import { initials } from "@/lib/utils";
import { useT, useFormatos } from "@/lib/i18n/provider";
import type { TeamMember, LeadActivity, ActivityType } from "@/lib/types/database";
import type { LeadWithOwner } from "./page";
import { addActivity, deleteLead } from "./actions";

const ACTIVITY_ICON: Record<ActivityType, React.ElementType> = {
  Nota: StickyNote,
  Llamada: Phone,
  Correo: Mail,
  WhatsApp: MessageCircle,
  Reunión: Users2,
  "Cambio de estado": GitBranch,
};

export function LeadDetail({
  lead,
  team,
  canWrite,
  open,
  onClose,
  onEdit,
}: {
  lead: LeadWithOwner | null;
  team: TeamMember[];
  canWrite: boolean;
  open: boolean;
  onClose: () => void;
  onEdit: (l: LeadWithOwner) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const f = useFormatos();
  const [activities, setActivities] = React.useState<LeadActivity[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [type, setType] = React.useState<ActivityType>("Nota");
  const [desc, setDesc] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  void team;

  const loadActivities = React.useCallback(async (leadId: string) => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("lead_activities")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    setActivities(data ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    // Sync the drawer to the opened lead: fetch its activity and reset the
    // compose form. Legitimate external-system sync on open.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open && lead) {
      void loadActivities(lead.id);
      setDesc("");
      setType("Nota");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, lead, loadActivities]);

  if (!lead) return null;

  async function onAddActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!desc.trim() || !lead) return;
    setSaving(true);
    const res = await addActivity({ lead_id: lead.id, type, description: desc.trim() });
    setSaving(false);
    if (!res.ok) {
      toast({
        tone: "error",
        title: t.comercial.noSeGuardo,
        description: res.error,
      });
      return;
    }
    setDesc("");
    await loadActivities(lead.id);
    router.refresh();
  }

  async function onDelete() {
    if (!lead) return;
    if (!confirm(`¿Eliminar el lead "${lead.company}"? Esta acción no se puede deshacer.`))
      return;
    const res = await deleteLead(lead.id);
    if (!res.ok) {
      toast({
        tone: "error",
        title: t.comercial.noSeElimino,
        description: res.error,
      });
      return;
    }
    toast({ tone: "success", title: t.comercial.leadEliminado });
    onClose();
    router.refresh();
  }

  // El correo y el teléfono se muestran como enlaces: desde el celular abre
  // el marcador o el cliente de correo sin copiar y pegar.
  const detailRows: [string, React.ReactNode | null][] = [
    [t.comercial.contacto, lead.contact_name],
    [
      t.comercial.correo,
      lead.contact_email ? (
        <a
          href={`mailto:${lead.contact_email}`}
          className="break-all text-accent underline-offset-2 hover:underline"
        >
          {lead.contact_email}
        </a>
      ) : null,
    ],
    [
      t.comercial.telefono,
      lead.contact_phone ? (
        <a
          href={`tel:${lead.contact_phone}`}
          className="font-mono tnum text-accent underline-offset-2 hover:underline"
        >
          {lead.contact_phone}
        </a>
      ) : null,
    ],
    [
      t.comercial.ubicacion,
      [lead.country, lead.city].filter(Boolean).join(" · ") || null,
    ],
    [
      t.comercial.tipo,
      lead.type ? (t.tiposLead[lead.type as keyof typeof t.tiposLead] ?? lead.type) : null,
    ],
    [t.comercial.interes, lead.product_interest],
    [t.comercial.volumen, lead.volume],
    [
      t.comercial.toneladas,
      lead.toneladas != null ? `${f.numero(lead.toneladas, 1)} ${t.unidades.tm}` : null,
    ],
    [
      t.comercial.valorTotal,
      lead.potential_value_cop != null ? f.cop(lead.potential_value_cop) : null,
    ],
    [t.comercial.proximaAccion, lead.next_action],
    [
      t.comercial.fechaProximaAccion,
      lead.next_action_date ? f.fecha(lead.next_action_date) : null,
    ],
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={
        <span className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-fg-subtle" />
          {lead.company}
        </span>
      }
      subtitle={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={LEAD_STAGE_TONE[lead.status as LeadStage]} dot>
            {t.etapas[lead.status as LeadStage]}
          </Badge>
          {lead.market && (
            <Badge tone="neutral">
              {t.mercados[lead.market as keyof typeof t.mercados] ?? lead.market}
            </Badge>
          )}
          {lead.owner && (
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full font-mono text-[9px] text-white"
                style={{ backgroundColor: lead.owner.color ?? "var(--accent)" }}
              >
                {initials(lead.owner.name)}
              </span>
              {lead.owner.name}
            </span>
          )}
        </div>
      }
      footer={
        canWrite && (
          <>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-danger" />
              {t.comun.eliminar}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onEdit(lead)}>
              <Pencil className="h-4 w-4" />
              {t.comun.editar}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-6">
        {/* Detail fields */}
        <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          {detailRows
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                  {label}
                </dt>
                <dd className="mt-0.5 text-sm text-fg">{value}</dd>
              </div>
            ))}
        </dl>

        {lead.notes && (
          <div className="rounded-[var(--radius-md)] bg-bg-subtle/60 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
              {t.comercial.notas}
            </p>
            <p className="mt-1 text-sm text-fg-muted">{lead.notes}</p>
          </div>
        )}

        {/* Add activity */}
        {canWrite && (
          <form onSubmit={onAddActivity} className="space-y-2">
            <div className="flex items-center gap-2">
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as ActivityType)}
                className="w-40 shrink-0"
              >
                {ACTIVITY_TYPES.filter((a) => a !== "Cambio de estado").map((a) => (
                  <option key={a} value={a}>
                    {t.tiposActividad[a]}
                  </option>
                ))}
              </Select>
              <span className="text-xs text-fg-subtle">
                {t.comercial.registrarActividad}
              </span>
            </div>
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={t.comercial.quePaso}
              rows={2}
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" loading={saving} disabled={!desc.trim()}>
                <Send className="h-3.5 w-3.5" />
                {t.comercial.agregar}
              </Button>
            </div>
          </form>
        )}

        {/* Timeline */}
        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-fg-subtle">
            {t.comercial.bitacora}
          </h3>
          {loading ? (
            <p className="text-sm text-fg-subtle">{t.comun.cargando}</p>
          ) : activities.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t.comercial.sinActividad}</p>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-5">
              {activities.map((a) => {
                const Icon = ACTIVITY_ICON[a.type] ?? StickyNote;
                return (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-fg-subtle">
                      <Icon className="h-2.5 w-2.5" />
                    </span>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-fg">
                        {t.tiposActividad[a.type]}
                      </span>
                      <span className="font-mono text-[10px] text-fg-subtle">
                        {f.fecha(a.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-fg-muted">
                      {a.description}
                    </p>
                    {a.user_name && (
                      <p className="mt-0.5 text-[11px] text-fg-subtle">
                        {a.user_name}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </Drawer>
  );
}
