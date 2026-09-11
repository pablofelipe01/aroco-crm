"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Trash2, Wallet } from "lucide-react";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatNumber, cn } from "@/lib/utils";
import { etiquetaPosicion } from "@/lib/mercado/posiciones";
import type { DatosMercado } from "./riesgo-data";
import { borrarMovimiento, registrarMovimiento } from "./actions";

/**
 * La posición de hoy, con lo anotado a mano encima del extracto.
 *
 * El extracto de StoneX es de cierre: quien abre dos contratos a media mañana
 * no los ve en el CRM hasta el día siguiente. Aquí se anotan y la posición
 * pasa a reflejarlos al momento.
 *
 * Lo anotado NO pisa al extracto. Vale mientras el extracto no haya llegado a
 * esa fecha; en cuanto llega, el movimiento se marca como superado y deja de
 * sumar. Los superados se siguen enseñando a propósito: son con lo que se
 * comprueba que el bróker de verdad los recogió.
 */

const HOY = () => new Date().toISOString().slice(0, 10);

export function PosicionesManuales({ manual }: { manual: DatosMercado["manual"] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [abierto, setAbierto] = React.useState(false);

  const { aplicados, superados, posiciones, fechaExtracto } = manual;
  const conAjuste = posiciones.filter(
    (p) => p.ajusteManual.long !== 0 || p.ajusteManual.short !== 0,
  );

  async function borrar(id: string) {
    if (!confirm("¿Borrar este movimiento anotado?")) return;
    const res = await borrarMovimiento(id);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo borrar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Movimiento borrado" });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Wallet className="h-4 w-4 text-fg-subtle" /> Movimientos del día
          </span>
        </CardTitle>
        <Button size="sm" variant="secondary" onClick={() => setAbierto(true)}>
          <Plus className="h-3.5 w-3.5" />
          Anotar
        </Button>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-xs text-fg-subtle">
          El extracto del bróker es de cierre —el último es del{" "}
          {fechaExtracto ? formatDate(fechaExtracto) : "—"}—, así que lo que se
          abre o se cierra durante el día no aparece solo. Anótalo aquí y la
          posición lo refleja al momento. Cuando llegue el extracto de ese día,
          el apunte deja de sumar por sí mismo.
        </p>

        {aplicados.length === 0 && superados.length === 0 && (
          <p className="text-sm text-fg-subtle">
            Nada anotado. La posición es la del extracto tal cual.
          </p>
        )}

        {aplicados.length > 0 && (
          <div>
            <h4 className="mb-2 text-[11px] uppercase tracking-wide text-fg-subtle">
              Aplicados ahora ({aplicados.length})
            </h4>
            <ul className="space-y-1.5">
              {aplicados.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-accent/40 bg-accent-soft/30 px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <Badge tone={m.accion === "abre" ? "success" : "warn"}>
                      {m.accion === "abre" ? "abrió" : "cerró"}
                    </Badge>{" "}
                    <span className="font-mono tnum text-fg">{m.contratos}</span>{" "}
                    <span className="text-fg">
                      {etiquetaPosicion({
                        option_type: m.tipo === "FUT" ? null : m.tipo,
                        contract_month: m.contrato,
                        strike: m.strike,
                      })}
                    </span>{" "}
                    <span className="text-fg-muted">
                      {m.lado === "largo" ? "comprado" : "vendido"}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-fg-subtle">
                    {formatDate(m.fecha)}
                    <button
                      onClick={() => borrar(m.id)}
                      className="rounded p-1 hover:bg-danger-soft hover:text-danger"
                      aria-label="Borrar movimiento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {conAjuste.length > 0 && (
          <div>
            <h4 className="mb-2 text-[11px] uppercase tracking-wide text-fg-subtle">
              Posición con los apuntes aplicados
            </h4>
            <ul className="space-y-1">
              {conAjuste.map((p) => {
                const ajuste = p.ajusteManual.long + p.ajusteManual.short;
                return (
                  <li
                    key={`${p.option_type}-${p.contract_month}-${p.strike}`}
                    className="flex items-center justify-between gap-2 border-b border-border/50 pb-1 text-sm last:border-0"
                  >
                    <span className="text-fg">{etiquetaPosicion(p)}</span>
                    <span className="font-mono tnum text-xs">
                      <span className="text-fg-subtle">
                        extracto {p.delExtracto.long > 0 ? "+" : ""}
                        {p.delExtracto.long - p.delExtracto.short}
                      </span>
                      <span className={cn("ml-2", ajuste > 0 ? "text-success" : "text-warn")}>
                        {ajuste > 0 ? "+" : ""}
                        {ajuste} a mano
                      </span>
                      <span className="ml-2 font-semibold text-fg">
                        = {p.long_qty - p.short_qty}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {superados.length > 0 && (
          <div className="rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 p-3">
            <p className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-fg-subtle">
              <AlertTriangle className="h-3.5 w-3.5" />
              Ya deberían estar en el extracto ({superados.length})
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              Estos apuntes son de fechas que el extracto ya cubre, así que
              dejaron de sumar. Compruébalos contra la posición del bróker: si
              alguno no aparece allí, hay una discrepancia que reclamar.
            </p>
            <ul className="mt-2 space-y-1">
              {superados.slice(0, 8).map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 text-xs text-fg-subtle"
                >
                  <span>
                    {formatDate(m.fecha)} · {m.accion === "abre" ? "abrió" : "cerró"}{" "}
                    {m.contratos}{" "}
                    {etiquetaPosicion({
                      option_type: m.tipo === "FUT" ? null : m.tipo,
                      contract_month: m.contrato,
                      strike: m.strike,
                    })}{" "}
                    {m.lado === "largo" ? "comprado" : "vendido"}
                  </span>
                  <button
                    onClick={() => borrar(m.id)}
                    className="shrink-0 rounded p-1 hover:bg-danger-soft hover:text-danger"
                    aria-label="Borrar movimiento"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>

      {abierto && (
        <ModalMovimiento
          onClose={() => setAbierto(false)}
          onHecho={() => {
            setAbierto(false);
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}

function ModalMovimiento({
  onClose,
  onHecho,
}: {
  onClose: () => void;
  onHecho: () => void;
}) {
  const { toast } = useToast();
  const [guardando, setGuardando] = React.useState(false);
  const [f, setF] = React.useState({
    fecha: HOY(),
    accion: "abre" as "abre" | "cierra",
    tipo: "FUT" as "FUT" | "CALL" | "PUT",
    lado: "corto" as "largo" | "corto",
    contrato: "DEC26",
    strike: "",
    contratos: "1",
    precio: "",
    nota: "",
  });

  const esOpcion = f.tipo !== "FUT";

  async function guardar() {
    setGuardando(true);
    const res = await registrarMovimiento({
      fecha: f.fecha,
      accion: f.accion,
      tipo: f.tipo,
      lado: f.lado,
      contrato: f.contrato,
      strike: esOpcion ? Number(f.strike.replace(",", ".")) || null : null,
      contratos: Number(f.contratos),
      precio: f.precio.trim() ? Number(f.precio.replace(",", ".")) : null,
      nota: f.nota,
    });
    setGuardando(false);
    if (!res.ok) {
      toast({ tone: "error", title: "No se pudo anotar", description: res.error });
      return;
    }
    toast({ tone: "success", title: "Movimiento anotado" });
    onHecho();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Anotar un movimiento"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" loading={guardando} onClick={guardar}>
            Anotar
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Qué hiciste">
          <Select
            value={f.accion}
            onChange={(e) => setF({ ...f, accion: e.target.value as "abre" | "cierra" })}
          >
            <option value="abre">Abrí</option>
            <option value="cierra">Cerré</option>
          </Select>
        </Field>
        <Field label="Cuándo" hint="El día en que operaste, no el de hoy si lo anotas después.">
          <Input
            type="date"
            value={f.fecha}
            onChange={(e) => setF({ ...f, fecha: e.target.value })}
          />
        </Field>

        <Field label="Instrumento">
          <Select
            value={f.tipo}
            onChange={(e) =>
              setF({ ...f, tipo: e.target.value as "FUT" | "CALL" | "PUT" })
            }
          >
            <option value="FUT">Futuro</option>
            <option value="PUT">Put</option>
            <option value="CALL">Call</option>
          </Select>
        </Field>
        <Field
          label="Lado"
          hint="El lado de la POSICIÓN: «cerré el vendido» baja el corto."
        >
          <Select
            value={f.lado}
            onChange={(e) => setF({ ...f, lado: e.target.value as "largo" | "corto" })}
          >
            <option value="corto">Vendido (corto)</option>
            <option value="largo">Comprado (largo)</option>
          </Select>
        </Field>

        <Field label="Contrato" hint="El mes, como en el tablero: DEC26.">
          <Input
            value={f.contrato}
            onChange={(e) => setF({ ...f, contrato: e.target.value.toUpperCase() })}
            placeholder="DEC26"
          />
        </Field>
        <Field label="Contratos">
          <Input
            type="number"
            min={1}
            step={1}
            value={f.contratos}
            onChange={(e) => setF({ ...f, contratos: e.target.value })}
          />
        </Field>

        {/* El strike solo existe para una opción. Dejarlo visible con un futuro
            invita a llenarlo, y la base lo rechazaría. */}
        {esOpcion && (
          <Field label="Strike">
            <Input
              value={f.strike}
              onChange={(e) => setF({ ...f, strike: e.target.value })}
              placeholder="6000"
            />
          </Field>
        )}
        <Field label="Precio" hint="Opcional. A cuánto se hizo.">
          <Input
            value={f.precio}
            onChange={(e) => setF({ ...f, precio: e.target.value })}
            placeholder="6194"
          />
        </Field>

        <Field label="Nota" className="sm:col-span-2" hint="Opcional.">
          <Input
            value={f.nota}
            onChange={(e) => setF({ ...f, nota: e.target.value })}
            placeholder="p. ej. rodé la cobertura de NOV a DEC"
          />
        </Field>
      </div>

      <p className="mt-4 rounded-[var(--radius-md)] border border-border bg-bg-subtle/40 px-3 py-2 text-xs text-fg-muted">
        {formatNumber(Number(f.contratos) || 0, 0)} {f.tipo === "FUT" ? "futuro" : f.tipo}
        {esOpcion && f.strike ? ` ${f.strike}` : ""} {f.contrato}{" "}
        {f.lado === "largo" ? "comprado" : "vendido"} · {f.accion === "abre" ? "se abre" : "se cierra"}.
        {" "}Vale hasta que llegue el extracto del {formatDate(f.fecha)}.
      </p>
    </Modal>
  );
}
