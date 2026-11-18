/** Formatos de dinero, porcentajes y fechas (es-MX). Funciona en servidor y cliente. */

type Num = number | string | { toNumber(): number };
const n = (v: Num) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : v.toNumber());

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(key: string, make: () => Intl.NumberFormat) {
  if (!fmtCache.has(key)) fmtCache.set(key, make());
  return fmtCache.get(key)!;
}

export type CurrencyCode = "MXN" | "USD" | "EUR";
const SYMBOL: Record<CurrencyCode, string> = { MXN: "$", USD: "US$", EUR: "€" };

/** $12,345.67 · US$200.00 · €120.00 */
export function money(v: Num, currency: CurrencyCode = "MXN", opts: { decimals?: boolean; sign?: boolean } = {}) {
  const value = n(v);
  const d = opts.decimals === false ? 0 : 2;
  const body = nf(`m${d}`, () => new Intl.NumberFormat("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d })).format(Math.abs(value));
  const sign = value < 0 ? "−" : opts.sign && value > 0 ? "+" : "";
  return `${sign}${SYMBOL[currency]}${body}`;
}

/** Cifra corta para ejes: $12.3 k, $1.2 M */
export function compactMoney(v: Num) {
  const value = n(v);
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)} M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)} k`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** 0.256 → "25.6 %" */
export function percent(v: Num, digits = 1, opts: { sign?: boolean } = {}) {
  const value = n(v) * 100;
  const sign = value < 0 ? "−" : opts.sign && value > 0 ? "+" : "";
  return `${sign}${Math.abs(value).toFixed(digits)} %`;
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const monthName = (m: number) => MONTHS[m - 1];
export const monthShort = (m: number) => MONTHS[m - 1].slice(0, 3);
export const monthLabel = (year: number, month: number) => `${monthName(month)} ${year}`;

/** "17 nov" */
export function shortDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getDate()} ${monthShort(date.getMonth() + 1)}`;
}

/** Fecha local "AAAA-MM-DD" para inputs. */
export function isoLocal(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
