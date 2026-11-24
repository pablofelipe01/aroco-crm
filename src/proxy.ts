import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 renamed the `middleware` convention to `proxy`.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image, favicon
     * - common static asset extensions
     * - el service worker y el manifest de /campo: el navegador los pide sin
     *   cookie de sesión (el manifest) o para actualizarlos en segundo plano,
     *   y una redirección al login rompe la instalación de la app.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw-campo\\.js|campo\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
