/**
 * Primer filtro: sin sesión válida no se ve nada (páginas → /login, API → 401).
 * Las Server Actions, descargas y lecturas de datos verifican la sesión otra vez.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export function proxy(request: NextRequest) {
  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  // Server Actions: cada una verifica la sesión (runAction) y responde
  // "Tu sesión expiró" en vez de una redirección que el formulario no entiende.
  if (request.method === "POST" && request.headers.has("next-action")) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  return NextResponse.redirect(url);
}

export const config = {
  // Todo menos: login, archivos de Next, ícono y manifiesto de la app.
  matcher: ["/((?!login|_next/static|_next/image|icon|apple-icon|manifest.webmanifest|robots.txt).*)"],
};
