/**
 * Sesión de un solo usuario, firmada con HMAC (sin dependencias).
 * La llave de firma se deriva de APP_PASSWORD + DATABASE_URL: cambiar la
 * contraseña cierra todas las sesiones abiertas.
 * Funciona en proxy.ts y en el servidor (runtime Node).
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "capitalos_session";
export const SESSION_DAYS = 30;
export const MIN_PASSWORD_LENGTH = 12;

export function passwordConfigured() {
  return (process.env.APP_PASSWORD ?? "").length >= MIN_PASSWORD_LENGTH;
}

function key() {
  if (!passwordConfigured()) throw new Error("APP_PASSWORD no está configurada (mínimo 12 caracteres).");
  return createHash("sha256").update(`capitalos-session-v1\0${process.env.APP_PASSWORD}\0${process.env.DATABASE_URL ?? ""}`).digest();
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function createSessionToken(now = Date.now()) {
  const payload = b64(JSON.stringify({ exp: now + SESSION_DAYS * 86_400_000 }));
  const sig = b64(createHmac("sha256", key()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || !passwordConfigured()) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = createHmac("sha256", key()).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && exp > now;
  } catch {
    return false;
  }
}

/** Compara en tiempo constante (no revela cuántas letras coinciden). */
export function checkPassword(input: string) {
  if (!passwordConfigured()) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(process.env.APP_PASSWORD!).digest();
  return timingSafeEqual(a, b);
}
