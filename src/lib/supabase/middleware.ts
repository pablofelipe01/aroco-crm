import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/database";
import { hasSupabaseEnv } from "@/lib/env";

/** Routes reachable without a session. */
// /api/cron has its own Bearer-token auth (CRON_SECRET); it's hit by Vercel Cron
// without a user session, so it must bypass the login redirect.
// /api/posicion igual: lo consume CacaoQ con su propio token y sin sesión. Sin
// esta excepción el middleware le devuelve un 307 a /login, que para un cliente
// que espera JSON se ve como una respuesta vacía y no como «no autorizado».
// `/portal` es el sitio de los proveedores: tiene su propio registro y su
// propio inicio de sesión, y quien llega ahí normalmente no tiene cuenta
// todavía. Mandarlo al login del CRM sería mandarlo a una puerta que no es la
// suya.
// `/firmar` y `/verificar` son las páginas de firma electrónica para gente de
// fuera de AROCO: entran con un enlace único, nunca con cuenta.
const PUBLIC_PREFIXES = [
  "/firmar",
  "/verificar",
  "/login",
  "/auth",
  "/onboarding",
  "/portal",
  "/registro",
  "/proveedor",
  "/api/cron",
  "/api/posicion",
];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

function esDominioFirma(host: string): boolean {
  if (host.startsWith("firma.")) return true;
  const url = process.env.NEXT_PUBLIC_FIRMA_URL;
  if (!url) return false;
  try {
    const propio = new URL(url).host.toLowerCase();
    // Si apunta al mismo dominio del CRM (sin subdominio aparte), no es exclusivo.
    const sitio = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host.toLowerCase() : "";
    return propio !== sitio && host === propio;
  } catch {
    return false;
  }
}

/**
 * Refresh the Supabase session cookie and gate access. Runs in middleware on
 * every matched request. If Supabase isn't configured yet, it lets requests
 * through (so the app boots before keys are provided).
 */
export async function updateSession(request: NextRequest) {
  // El dominio de firma (firma.aroco.co, o el que diga NEXT_PUBLIC_FIRMA_URL)
  // sirve solo la firma y la verificación. Cualquier otra ruta (el login, el
  // CRM) se manda a /verificar: el dominio que reciben los de afuera no puede
  // ser una puerta al CRM.
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").toLowerCase();
  if (esDominioFirma(host)) {
    const { pathname } = request.nextUrl;
    const esFirma = ["/firmar", "/verificar", "/brand"].some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    );
    if (!esFirma) {
      const url = request.nextUrl.clone();
      url.pathname = "/verificar";
      url.search = "";
      return NextResponse.redirect(url);
    }
    // Sin sesión del CRM que refrescar aquí.
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  if (!hasSupabaseEnv()) return response;

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated users hitting /login go to the dashboard.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
