import { Prisma, PrismaClient, type Currency } from "@prisma/client";

/** Cliente normal o transaccional: los servicios aceptan ambos. */
export type Db = PrismaClient | Prisma.TransactionClient;

/** Error de negocio con mensaje para mostrar al usuario. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export const RECEIVABLE_NAME = "Cuentas por Cobrar";
/** Categoría de ajustes de conciliación: no cuenta como ingreso ni gasto. */
export const ADJUSTMENT_CATEGORY = "Ajuste de saldo";

export const dec = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export const ZERO = new Prisma.Decimal(0);
/** Tolerancia para comparar dinero (medio centavo). */
export const EPS = new Prisma.Decimal("0.005");

/** Fecha "AAAA-MM-DD" a mediodía local: evita que la zona horaria la mueva de día. */
export const parseDate = (iso: string) => new Date(`${iso}T12:00:00`);

/** Hoy en formato "AAAA-MM-DD" según la hora local (no UTC). */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthRange(year: number, month: number) {
  return { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
}

/** Obtiene (o crea si falta) la cuenta del sistema "Cuentas por Cobrar". */
export async function getReceivableAccount(db: Db) {
  const found = await db.account.findFirst({ where: { type: "RECEIVABLE", isSystem: true } });
  if (found) return found;
  return db.account.create({
    data: { name: RECEIVABLE_NAME, type: "RECEIVABLE", currency: "MXN", isSystem: true },
  });
}

/** Tipo de cambio guardado para una moneda (MXN = 1). */
export async function getRate(db: Db, currency: Currency) {
  if (currency === "MXN") return dec(1);
  const r = await db.exchangeRate.findUnique({ where: { currency } });
  if (!r) throw new DomainError(`Falta el tipo de cambio de ${currency}. Agrégalo en Ajustes.`);
  return r.rateToMXN;
}

export async function getRates(db: Db): Promise<Record<Currency, Prisma.Decimal>> {
  const rows = await db.exchangeRate.findMany();
  const map = { MXN: dec(1), USD: dec(0), EUR: dec(0) } as Record<Currency, Prisma.Decimal>;
  for (const r of rows) map[r.currency] = r.rateToMXN;
  return map;
}

/** Porcentaje "10.5" → fracción 0.105. */
export const pctToFraction = (v: string | null | undefined) => (v == null ? null : dec(v).div(100));
