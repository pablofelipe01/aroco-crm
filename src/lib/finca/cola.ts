"use client";

/**
 * Cola de registros en el teléfono (IndexedDB) para /campo.
 *
 * En la plantación no hay señal: el registro se guarda aquí y se sube al
 * volver a la oficina. Reglas:
 *
 * - El `id` lo pone el teléfono. Si una subida se corta después de que la
 *   base guardó, el reintento manda el mismo id y la base lo da por recibido
 *   sin duplicar (`finca_subir_registros`, 0118).
 * - Se borra de la cola SOLO lo que la base confirma. Lo rechazado se queda,
 *   con su motivo, hasta que el trabajador lo corrija o lo borre.
 * - Cada registro lleva la cuenta que lo anotó y solo esa cuenta lo sube: en
 *   un celular compartido, nadie sube lo de otro con su sesión.
 */

import type { RegistroCampo } from "./captura";

export type EstadoCola = "pendiente" | "rechazado";

export interface ItemCola extends RegistroCampo {
  usuario: string;
  estado: EstadoCola;
  motivo?: string;
  /** Registros que salieron del mismo formulario (una cuadrilla). */
  grupo: string;
}

export interface ItemEnviado extends RegistroCampo {
  usuario: string;
  grupo: string;
  subido_en: string;
}

const DB = "aroco-campo";
const VERSION = 1;
const COLA = "cola";
const ENVIADOS = "enviados";
/** Lo subido se muestra unos días como «ya llegó» y después se olvida. */
const DIAS_ENVIADOS = 7;

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(COLA)) db.createObjectStore(COLA, { keyPath: "id" });
      if (!db.objectStoreNames.contains(ENVIADOS)) db.createObjectStore(ENVIADOS, { keyPath: "id" });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
  });
}

async function tx<T>(
  stores: string[],
  modo: IDBTransactionMode,
  fn: (t: IDBTransaction) => T,
): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((ok, mal) => {
      const t = db.transaction(stores, modo);
      const r = fn(t);
      t.oncomplete = () => ok(r);
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error);
    });
  } finally {
    db.close();
  }
}

function todos<T>(store: IDBObjectStore): Promise<T[]> {
  return new Promise((ok, mal) => {
    const req = store.getAll();
    req.onsuccess = () => ok(req.result as T[]);
    req.onerror = () => mal(req.error);
  });
}

export async function agregar(items: ItemCola[]): Promise<void> {
  await tx([COLA], "readwrite", (t) => {
    const s = t.objectStore(COLA);
    for (const it of items) s.put(it);
  });
}

export async function quitar(ids: string[]): Promise<void> {
  await tx([COLA], "readwrite", (t) => {
    const s = t.objectStore(COLA);
    for (const id of ids) s.delete(id);
  });
}

export async function leer(): Promise<{ cola: ItemCola[]; enviados: ItemEnviado[] }> {
  const db = await abrir();
  try {
    const t = db.transaction([COLA, ENVIADOS], "readonly");
    const [cola, enviados] = await Promise.all([
      todos<ItemCola>(t.objectStore(COLA)),
      todos<ItemEnviado>(t.objectStore(ENVIADOS)),
    ]);
    const orden = (a: RegistroCampo, b: RegistroCampo) =>
      b.registrado_en.localeCompare(a.registrado_en);
    return { cola: cola.sort(orden), enviados: enviados.sort(orden) };
  } finally {
    db.close();
  }
}

/**
 * Marca el resultado de una subida en UNA transacción: lo aceptado pasa de la
 * cola a «enviados»; lo rechazado se queda con su motivo. Si el teléfono se
 * apaga a la mitad, la transacción no queda a medias — y en el peor caso lo
 * aceptado se vuelve a mandar y la base lo confirma sin duplicar.
 */
async function anotarResultado(
  aceptados: Set<string>,
  rechazados: Map<string, string>,
  ahora: string,
): Promise<void> {
  const limite = new Date(Date.now() - DIAS_ENVIADOS * 86400_000).toISOString();
  const db = await abrir();
  try {
    const t = db.transaction([COLA, ENVIADOS], "readwrite");
    const cola = t.objectStore(COLA);
    const env = t.objectStore(ENVIADOS);
    const items = await todos<ItemCola>(cola);
    for (const it of items) {
      if (aceptados.has(it.id)) {
        const { estado: _e, motivo: _m, ...resto } = it;
        void _e;
        void _m;
        env.put({ ...resto, subido_en: ahora } satisfies ItemEnviado);
        cola.delete(it.id);
      } else if (rechazados.has(it.id)) {
        cola.put({ ...it, estado: "rechazado", motivo: rechazados.get(it.id) });
      }
    }
    const viejos = await todos<ItemEnviado>(env);
    for (const v of viejos) if (v.subido_en < limite) env.delete(v.id);
    await new Promise<void>((ok, mal) => {
      t.oncomplete = () => ok();
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error);
    });
  } finally {
    db.close();
  }
}

export type ResultadoSubida =
  | { tipo: "nada" }
  | { tipo: "ok"; subidos: number; rechazados: number }
  | { tipo: "sin-red" }
  | { tipo: "sin-sesion" }
  | { tipo: "error"; mensaje: string };

type Rpc = (
  fn: "finca_subir_registros",
  args: { p_registros: RegistroCampo[] },
) => PromiseLike<{
  data: unknown;
  error: { message: string; code?: string; status?: number } | null;
}>;

const LOTE = 200;

/** Sube lo pendiente de `usuario`. Lo rechazado no se reintenta solo. */
export async function subir(rpc: Rpc, usuario: string): Promise<ResultadoSubida> {
  const { cola } = await leer();
  const mios = cola.filter((x) => x.usuario === usuario && x.estado === "pendiente");
  if (mios.length === 0) return { tipo: "nada" };

  let subidos = 0;
  let rech = 0;
  for (let i = 0; i < mios.length; i += LOTE) {
    const lote = mios.slice(i, i + LOTE).map(
      ({ usuario: _u, estado: _e, motivo: _m, grupo: _g, ...r }) => {
        void _u;
        void _e;
        void _m;
        void _g;
        return r;
      },
    );
    let res: Awaited<ReturnType<Rpc>>;
    try {
      res = await rpc("finca_subir_registros", { p_registros: lote });
    } catch {
      return subidos ? { tipo: "ok", subidos, rechazados: rech } : { tipo: "sin-red" };
    }
    if (res.error) {
      const m = res.error.message ?? "";
      if (/fetch|network|Load failed/i.test(m)) return { tipo: "sin-red" };
      if (res.error.code === "PGRST301" || res.error.status === 401 || /JWT/i.test(m))
        return { tipo: "sin-sesion" };
      return { tipo: "error", mensaje: m };
    }
    const data = res.data as {
      aceptados: string[];
      rechazados: { id: string; motivo: string }[];
    };
    const ok = new Set(data.aceptados);
    const no = new Map(data.rechazados.map((x) => [x.id, x.motivo]));
    await anotarResultado(ok, no, new Date().toISOString());
    subidos += ok.size;
    rech += no.size;
  }
  return { tipo: "ok", subidos, rechazados: rech };
}
