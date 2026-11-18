"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { checkPassword, createSessionToken, passwordConfigured, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";
import { clientIp } from "@/server/auth";

const WINDOW_MS = 15 * 60_000;
const MAX_FAILS_PER_IP = 8;
const MAX_FAILS_GLOBAL = 40; // contra intentos desde muchas IPs

export type LoginState = { error?: string };

export async function loginAction(_: LoginState, fd: FormData): Promise<LoginState> {
  if (!passwordConfigured()) return { error: "Falta configurar APP_PASSWORD (mínimo 12 caracteres) en el servidor." };

  const ip = await clientIp();
  const since = new Date(Date.now() - WINDOW_MS);
  const [ipFails, allFails] = await Promise.all([
    db.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { success: false, createdAt: { gte: since } } }),
  ]);
  if (ipFails >= MAX_FAILS_PER_IP || allFails >= MAX_FAILS_GLOBAL) {
    return { error: "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." };
  }

  const ok = checkPassword(String(fd.get("password") ?? ""));
  await db.loginAttempt.create({ data: { ip, success: ok } });
  // Limpieza: no guardar intentos viejos para siempre.
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
  if (!ok) return { error: "Contraseña incorrecta." };

  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  redirect("/");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
