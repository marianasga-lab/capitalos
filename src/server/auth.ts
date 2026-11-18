import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export class UnauthorizedError extends Error {
  constructor() {
    super("Tu sesión expiró. Vuelve a entrar.");
    this.name = "UnauthorizedError";
  }
}

export async function isAuthenticated() {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Para Server Actions y rutas: lanza si no hay sesión válida. */
export async function requireSession() {
  if (!(await isAuthenticated())) throw new UnauthorizedError();
}

/** Para páginas: manda al inicio de sesión si no hay sesión válida. */
export async function requirePageSession() {
  if (!(await isAuthenticated())) redirect("/login");
}

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}
