"use client";

import * as React from "react";
import { CheckCircle2, Clock, MessageCircle, PhoneOff, Trash2, UserPlus } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollFijo } from "@/components/ui/scroll-fijo";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate } from "@/lib/utils";
import { guardarUsuarioTelegram, quitarUsuarioTelegram } from "./actions";

export type UsuarioTelegramVista = {
  id: string;
  nombre: string;
  telefono: string;
  empleadoId: string | null;
  rol: "trabajador" | "supervisor";
  recibeAvisos: boolean;
  vinculadoEn: string | null;
};

export type MensajeTelegramVista = {
  id: string;
  en: string;
  quien: string | null;
  tipo: "voz" | "texto";
  texto: string | null;
  estado: string;
  error: string | null;
  fechaLabor: string | null;
  labores: string[];
  preguntas: string[];
  guardados: number;
  audioUrl: string | null;
  duracion: number | null;
};

const ESTADOS: Record<string, { label: string; tone: BadgeTone }> = {
  recibido: { label: "Procesando", tone: "info" },
  por_confirmar: { label: "Sin confirmar", tone: "warn" },
  confirmado: { label: "Guardado", tone: "success" },
  reemplazado: { label: "Corregido después", tone: "neutral" },
  descartado: { label: "Borrado", tone: "neutral" },
  ignorado: { label: "No era reporte", tone: "neutral" },
  error: { label: "Error", tone: "danger" },
};

/** «573174304429» → «317 430 4429». */
function telefonoBonito(t: string) {
  const d = t.startsWith("57") && t.length === 12 ? t.slice(2) : t;
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : t;
}

function hora(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TelegramBot({
  activo,
  usuarioBot,
  empleados,
  usuarios,
  mensajes,
}: {
  activo: boolean;
  usuarioBot: string | null;
  empleados: { id: string; nombre: string }[];
  usuarios: UsuarioTelegramVista[];
  mensajes: MensajeTelegramVista[];
}) {
  const porEmpleado = new Map(usuarios.filter((u) => u.empleadoId).map((u) => [u.empleadoId!, u]));
  const supervisores = usuarios.filter((u) => u.rol === "supervisor");
  const vinculados = usuarios.filter((u) => u.vinculadoEn).length;

  return (
    <div className="space-y-5">
      {!activo && (
        <Card>
          <CardBody className="text-sm text-fg-muted">
            <b className="text-fg">El bot está apagado.</b> Falta configurar en Vercel{" "}
            <code className="font-mono">TELEGRAM_BOT_TOKEN</code>,{" "}
            <code className="font-mono">TELEGRAM_WEBHOOK_SECRET</code> y{" "}
            <code className="font-mono">OPENAI_API_KEY</code>. Mientras tanto puede dejar los números listos.
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Quién le habla al bot</CardTitle>
          <span className="text-xs text-fg-muted">
            <span className="tnum font-mono">{vinculados}</span> de{" "}
            <span className="tnum font-mono">{usuarios.length}</span> ya lo abrieron
          </span>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-fg-muted">
            Anote el celular de cada uno. La persona abre{" "}
            {usuarioBot ? (
              <a
                className="font-medium text-accent underline"
                href={`https://t.me/${usuarioBot}`}
                target="_blank"
                rel="noreferrer"
              >
                t.me/{usuarioBot}
              </a>
            ) : (
              "el bot"
            )}{" "}
            en Telegram, toca <b>Compartir mi número</b> y queda vinculada. A las 6:00 a. m. le llega el
            recordatorio a cada trabajador; a las 5:00 p. m., la lista de quién falta a quienes reciben avisos.
          </p>

          <ScrollFijo>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-fg-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Persona</th>
                  <th className="px-3 py-2 font-medium">Celular</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Avisos 5 p. m.</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {empleados.map((e) => (
                  <FilaUsuario
                    key={e.id}
                    nombre={e.nombre}
                    empleadoId={e.id}
                    rol="trabajador"
                    usuario={porEmpleado.get(e.id) ?? null}
                  />
                ))}
                {supervisores.map((s) => (
                  <FilaUsuario
                    key={s.id}
                    nombre={s.nombre}
                    empleadoId={s.empleadoId}
                    rol="supervisor"
                    usuario={s}
                  />
                ))}
              </tbody>
            </table>
          </ScrollFijo>
          <NuevoSupervisor />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mensajes recientes</CardTitle>
          <span className="text-xs text-fg-muted">últimos {mensajes.length}</span>
        </CardHeader>
        <CardBody className="p-0">
          {mensajes.length === 0 ? (
            <EmptyState
              icon={<MessageCircle className="h-6 w-6" />}
              title="Todavía no llegan mensajes"
              description="Aquí aparece cada audio con lo que se entendió y en qué terminó."
            />
          ) : (
            <ul className="divide-y divide-border">
              {mensajes.map((m) => {
                const e = ESTADOS[m.estado] ?? { label: m.estado, tone: "neutral" as BadgeTone };
                return (
                  <li key={m.id} className="space-y-1.5 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="tnum font-mono text-fg-muted">{hora(m.en)}</span>
                      <span className="font-medium text-fg">{m.quien ?? "—"}</span>
                      <Badge tone={e.tone}>{e.label}</Badge>
                      {m.fechaLabor && (
                        <span className="text-fg-muted">
                          labores del <span className="tnum font-mono">{formatDate(m.fechaLabor)}</span>
                        </span>
                      )}
                      {m.guardados > 0 && (
                        <span className="text-fg-muted">
                          · <span className="tnum font-mono">{m.guardados}</span> fila
                          {m.guardados === 1 ? "" : "s"} guardada{m.guardados === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    {m.texto && (
                      <p className="text-sm text-fg">
                        {m.tipo === "voz" ? "🎙 " : ""}
                        <span className="italic">«{m.texto}»</span>
                      </p>
                    )}
                    {m.labores.length > 0 && (
                      <p className="text-xs text-fg-muted">Entendido: {m.labores.join(" · ")}</p>
                    )}
                    {m.preguntas.length > 0 && m.estado !== "confirmado" && (
                      <p className="text-xs text-warn">Le faltó: {m.preguntas.join(" / ")}</p>
                    )}
                    {m.error && <p className="text-xs text-danger">{m.error}</p>}
                    {m.audioUrl && (
                      <audio controls preload="none" src={m.audioUrl} className="h-8 w-full max-w-sm">
                        Su navegador no reproduce el audio.
                      </audio>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function FilaUsuario({
  nombre,
  empleadoId,
  rol,
  usuario,
}: {
  nombre: string;
  empleadoId: string | null;
  rol: "trabajador" | "supervisor";
  usuario: UsuarioTelegramVista | null;
}) {
  const { toast } = useToast();
  const [tel, setTel] = React.useState(usuario ? telefonoBonito(usuario.telefono) : "");
  const [avisos, setAvisos] = React.useState(usuario?.recibeAvisos ?? false);
  const [pendiente, start] = React.useTransition();
  const cambiado =
    tel.replace(/\D/g, "") !== (usuario ? telefonoBonito(usuario.telefono).replace(/\D/g, "") : "") ||
    avisos !== (usuario?.recibeAvisos ?? false);

  const guardar = () =>
    start(async () => {
      const r = await guardarUsuarioTelegram({
        id: usuario?.id ?? null,
        nombre,
        telefono: tel,
        empleadoId,
        rol,
        recibeAvisos: avisos,
      });
      if (!r.ok) toast({ tone: "error", title: "No se guardó", description: r.error });
      else toast({ tone: "success", title: "Guardado", description: nombre });
    });
  const quitar = () =>
    start(async () => {
      if (!usuario) return;
      const r = await quitarUsuarioTelegram(usuario.id);
      if (!r.ok) toast({ tone: "error", title: "No se quitó", description: r.error });
      else setTel("");
    });

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 whitespace-nowrap">
        {nombre}
        {rol === "supervisor" && (
          <Badge tone="info" className="ml-2">
            Supervisora
          </Badge>
        )}
      </td>
      <td className="px-3 py-2">
        <Input
          aria-label={`Celular de ${nombre}`}
          inputMode="tel"
          placeholder="317 430 4429"
          value={tel}
          onChange={(e) => setTel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && cambiado && tel.trim()) guardar();
          }}
          className="tnum h-8 w-36 font-mono"
        />
      </td>
      <td className="px-3 py-2 text-xs whitespace-nowrap">
        {!usuario ? (
          <span className="inline-flex items-center gap-1 text-fg-subtle">
            <PhoneOff className="h-3.5 w-3.5" /> Sin número
          </span>
        ) : usuario.vinculadoEn ? (
          <span className="inline-flex items-center gap-1 text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Vinculado {formatDate(usuario.vinculadoEn)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-warn">
            <Clock className="h-3.5 w-3.5" /> No ha abierto el bot
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          aria-label={`${nombre} recibe la lista de las 5 p. m.`}
          checked={avisos}
          onChange={(e) => setAvisos(e.target.checked)}
          className="h-4 w-4 accent-[var(--color-accent)]"
        />
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <Button size="sm" variant="secondary" disabled={!cambiado || !tel.trim() || pendiente} onClick={guardar}>
          Guardar
        </Button>
        {usuario && (
          <Button
            size="sm"
            variant="ghost"
            className={cn("ml-1")}
            aria-label={`Quitar a ${nombre} del bot`}
            disabled={pendiente}
            onClick={quitar}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </td>
    </tr>
  );
}

/** Alguien que no es trabajador de la finca y anota por otros (como Angela). */
function NuevoSupervisor() {
  const { toast } = useToast();
  const [abierto, setAbierto] = React.useState(false);
  const [nombre, setNombre] = React.useState("");
  const [tel, setTel] = React.useState("");
  const [pendiente, start] = React.useTransition();

  if (!abierto)
    return (
      <Button size="sm" variant="ghost" onClick={() => setAbierto(true)}>
        <UserPlus className="h-3.5 w-3.5" /> Agregar supervisor
      </Button>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await guardarUsuarioTelegram({
            id: null,
            nombre,
            telefono: tel,
            empleadoId: null,
            rol: "supervisor",
            recibeAvisos: true,
          });
          if (!r.ok) toast({ tone: "error", title: "No se guardó", description: r.error });
          else {
            setAbierto(false);
            setNombre("");
            setTel("");
          }
        });
      }}
    >
      <Input
        aria-label="Nombre"
        placeholder="Nombre"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="h-8 w-48"
        required
      />
      <Input
        aria-label="Celular"
        inputMode="tel"
        placeholder="Celular"
        value={tel}
        onChange={(e) => setTel(e.target.value)}
        className="tnum h-8 w-36 font-mono"
        required
      />
      <Button size="sm" type="submit" disabled={pendiente}>
        Agregar
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setAbierto(false)}>
        Cancelar
      </Button>
    </form>
  );
}
