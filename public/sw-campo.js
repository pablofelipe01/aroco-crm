/*
 * Service worker de /campo (captura de labores de la finca sin conexión).
 *
 * Se registra con scope "/campo": solo controla esa pantalla, nunca el resto
 * del CRM. Hace tres cosas:
 *
 *  1. La página /campo: red primero (con límite de tiempo, porque en la
 *     plantación «hay señal» a veces significa una barra que no carga nada) y,
 *     sin red, la última copia buena. Esa copia trae el catálogo adentro.
 *  2. Los archivos de /_next/static (JS, CSS, fuentes): llevan hash en el
 *     nombre y no cambian nunca, así que caché primero.
 *  3. Al cargar, la página manda la lista de archivos que usó; se guardan (la
 *     primera visita ocurre antes de que este worker controle la página) y se
 *     borran los de versiones viejas.
 *
 * Los datos NO pasan por aquí: los registros van en IndexedDB y se suben
 * desde la página (src/lib/finca/cola.ts).
 */

const PAGINA = "campo-pagina-v1";
const ESTATICOS = "campo-estaticos-v1";
const URL_PAGINA = "/campo";
const ESPERA_RED_MS = 6000;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const vigentes = new Set([PAGINA, ESTATICOS]);
      for (const k of await caches.keys()) {
        if (k.startsWith("campo-") && !vigentes.has(k)) await caches.delete(k);
      }
      await self.clients.claim();
    })(),
  );
});

function esEstatico(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/");
}

async function conLimite(promesa, ms) {
  let t;
  const tiempo = new Promise((_, mal) => {
    t = setTimeout(() => mal(new Error("tiempo")), ms);
  });
  try {
    return await Promise.race([promesa, tiempo]);
  } finally {
    clearTimeout(t);
  }
}

async function pagina(request) {
  const cache = await caches.open(PAGINA);
  try {
    const res = await conLimite(fetch(request), ESPERA_RED_MS);
    // Solo se guarda la página de verdad. Si la sesión venció, la red
    // redirige al login: eso se muestra, pero no reemplaza la copia buena.
    if (res.ok && !res.redirected && new URL(res.url).pathname === URL_PAGINA) {
      await cache.put(URL_PAGINA, res.clone());
    }
    return res;
  } catch {
    const copia = await cache.match(URL_PAGINA);
    if (copia) return copia;
    return new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>" +
        "<body style='font-family:system-ui;padding:24px'><h1>Sin conexión</h1>" +
        "<p>Abra esta pantalla una vez con internet (en la oficina de la finca) para poder usarla sin señal.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function estatico(request) {
  const cache = await caches.open(ESTATICOS);
  const copia = await cache.match(request);
  if (copia) return copia;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && url.pathname === URL_PAGINA) {
    event.respondWith(pagina(request));
  } else if (esEstatico(url)) {
    event.respondWith(estatico(request));
  }
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.tipo !== "guardar-archivos" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(ESTATICOS);
      const usados = new Set();
      for (const u of data.urls) {
        let url;
        try {
          url = new URL(u, self.location.origin);
        } catch {
          continue;
        }
        if (url.origin !== self.location.origin || !esEstatico(url)) continue;
        usados.add(url.href);
        if (!(await cache.match(url.href))) {
          try {
            const res = await fetch(url.href);
            if (res.ok) await cache.put(url.href, res);
          } catch {
            /* sin red: se intenta en la próxima carga */
          }
        }
      }
      // Borrar lo de versiones anteriores, pero solo si la lista vino completa
      // de una carga con red (la página no la manda sin conexión).
      if (data.podar && usados.size > 0) {
        for (const req of await cache.keys()) {
          if (!usados.has(req.url)) await cache.delete(req);
        }
      }
    })(),
  );
});
