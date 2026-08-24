/**
 * Cliente MCP mínimo sobre streamable-http.
 *
 * CacaoQ usa `fastmcp` en Python. Aquí no hace falta la librería: el transporte
 * es JSON-RPC sobre POST y lo único que hay que respetar es el saludo inicial
 * —initialize, luego notifications/initialized— y devolver el `Mcp-Session-Id`
 * que el servidor asigna.
 *
 * La respuesta puede llegar como JSON o como SSE, según lo que el servidor
 * decida; se aceptan las dos porque negociar solo JSON hace que algunos
 * servidores respondan 406.
 */

export class McpError extends Error {}

export type McpConfig = {
  url: string;
  clientId?: string;
  clientSecret?: string;
  token?: string;
};

/** Cloudflare Access y/o Bearer. Pueden convivir: Access valida en el borde y
 *  el servidor de atrás valida el bearer si lo usa. */
function cabeceras(cfg: McpConfig): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (cfg.clientId && cfg.clientSecret) {
    h["CF-Access-Client-Id"] = cfg.clientId;
    h["CF-Access-Client-Secret"] = cfg.clientSecret;
  }
  if (cfg.token) h["Authorization"] = `Bearer ${cfg.token}`;
  return h;
}

/** El cuerpo puede venir como SSE (`data: {...}`) o como JSON pelado. */
function leerCuerpo(texto: string): unknown {
  const t = texto.trim();
  if (!t) return null;
  if (t.startsWith("{") || t.startsWith("[")) return JSON.parse(t);

  // SSE: se toma el último `data:`, que es el que trae la respuesta final.
  const datos = t
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .filter(Boolean);
  if (datos.length === 0) {
    throw new McpError(`Respuesta MCP ilegible: ${t.slice(0, 200)}`);
  }
  return JSON.parse(datos[datos.length - 1]);
}

type Rpc = { result?: unknown; error?: { code: number; message: string } };

/**
 * Abre sesión, llama una herramienta y devuelve su payload.
 *
 * Se abre una sesión por llamada en vez de mantenerla viva: esto corre en
 * funciones serverless, donde el proceso muere entre peticiones y una sesión
 * guardada en memoria no sobrevive de todos modos.
 */
export async function llamarHerramienta(
  cfg: McpConfig,
  herramienta: string,
  args: Record<string, unknown> = {},
  timeoutMs = 120_000,
): Promise<unknown> {
  if (!cfg.url) throw new McpError("MCP sin URL configurada.");

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), timeoutMs);
  const base = cabeceras(cfg);

  try {
    const pedir = async (cuerpo: unknown, extra: Record<string, string> = {}) =>
      fetch(cfg.url, {
        method: "POST",
        headers: { ...base, ...extra },
        body: JSON.stringify(cuerpo),
        signal: control.signal,
        cache: "no-store",
      });

    // 1) Saludo. El servidor devuelve el id de sesión en una cabecera.
    const ini = await pedir({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "crm-aroco", version: "1.0" },
      },
    });
    if (!ini.ok) {
      throw new McpError(`initialize devolvió HTTP ${ini.status} — ${await ini.text()}`);
    }
    const sesion = ini.headers.get("mcp-session-id");
    const conSesion: Record<string, string> = sesion ? { "Mcp-Session-Id": sesion } : {};
    leerCuerpo(await ini.text());

    // 2) El servidor no atiende herramientas hasta recibir esta notificación.
    await pedir({ jsonrpc: "2.0", method: "notifications/initialized" }, conSesion);

    // 3) La herramienta.
    const res = await pedir(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: herramienta, arguments: args } },
      conSesion,
    );
    if (!res.ok) {
      throw new McpError(`${herramienta} devolvió HTTP ${res.status} — ${await res.text()}`);
    }

    const rpc = leerCuerpo(await res.text()) as Rpc;
    if (rpc?.error) throw new McpError(`${herramienta}: ${rpc.error.message}`);
    return extraerPayload(rpc?.result);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new McpError(`${herramienta} no respondió en ${timeoutMs / 1000}s.`);
    }
    throw e;
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Un resultado MCP puede traer el dato en `structuredContent` o serializado
 * como texto dentro de `content`. Se prefiere el estructurado; el texto se
 * intenta parsear y, si no es JSON, se devuelve tal cual — devolver null
 * escondería una respuesta que sí llegó.
 */
function extraerPayload(result: unknown): unknown {
  if (result === null || result === undefined) return null;
  const r = result as Record<string, unknown>;

  if (r.structuredContent !== undefined && r.structuredContent !== null) {
    return r.structuredContent;
  }
  const content = r.content;
  if (Array.isArray(content)) {
    const textos = content
      .filter((c): c is { type: string; text: string } => (c as { type?: string })?.type === "text")
      .map((c) => c.text);
    if (textos.length === 1) {
      try {
        return JSON.parse(textos[0]);
      } catch {
        return textos[0];
      }
    }
    if (textos.length > 1) return textos;
  }
  return result;
}

/** Lista las herramientas que expone un MCP. Sirve para diagnosticar. */
export async function listarHerramientas(cfg: McpConfig): Promise<string[]> {
  const base = cabeceras(cfg);
  const ini = await fetch(cfg.url, {
    method: "POST",
    headers: base,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "crm-aroco", version: "1.0" },
      },
    }),
  });
  const sesion = ini.headers.get("mcp-session-id");
  const conSesion: Record<string, string> = sesion ? { "Mcp-Session-Id": sesion } : {};
  await ini.text();

  await fetch(cfg.url, {
    method: "POST",
    headers: { ...base, ...conSesion },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { ...base, ...conSesion },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  });
  const rpc = leerCuerpo(await res.text()) as Rpc;
  const tools = (rpc?.result as { tools?: { name: string }[] })?.tools ?? [];
  return tools.map((t) => t.name);
}
