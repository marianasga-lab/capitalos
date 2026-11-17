/**
 * Patrimonio (Net Worth) consolidado en MXN, con desglose por moneda.
 * Función pura: recibe cuentas, tarjetas y tipos de cambio; no toca la BD.
 *
 *   Net Worth = Activos (todas las cuentas, incluida "por cobrar")
 *             − Pasivos (deuda de tarjetas)
 */
import { Prisma } from "@prisma/client";

type D = Prisma.Decimal;
const ZERO = new Prisma.Decimal(0);

export type Currency = "MXN" | "USD" | "EUR";
export type AccountLike = {
  id: string;
  name: string;
  type: "CASH" | "DEBIT" | "INVESTMENT" | "RECEIVABLE";
  currency: Currency;
  currentBalance: D;
  interestRate?: D | null;
  archived?: boolean;
};
export type CardLike = { id: string; name: string; currency: Currency; currentBalance: D; archived?: boolean };
export type Rates = Record<Currency, D>;

export type CurrencyBucket = {
  currency: Currency;
  /** Monto en su moneda original. */
  cash: D;
  bank: D;
  investments: D;
  total: D;
  /** Equivalente en MXN al tipo de cambio actual. */
  totalMXN: D;
  rate: D;
};

export type NetWorth = {
  totalAssets: D;
  totalLiabilities: D;
  netWorth: D;
  /** Efectivo físico + débito (MXN). */
  liquidity: D;
  /** Solo efectivo físico, todas las monedas (MXN). */
  cashMXN: D;
  investments: D;
  /** Rendimiento mensual estimado de inversiones (MXN). */
  investmentMonthlyYield: D;
  receivables: D;
  byCurrency: CurrencyBucket[];
};

export function toMXN(amount: D, currency: Currency, rates: Rates): D {
  const r = rates[currency];
  if (!r) throw new Error(`Falta tipo de cambio para ${currency}`);
  return amount.mul(r);
}

export function computeNetWorth(accounts: AccountLike[], cards: CardLike[], rates: Rates): NetWorth {
  const buckets = new Map<Currency, CurrencyBucket>();
  const bucket = (c: Currency) => {
    if (!buckets.has(c)) {
      buckets.set(c, { currency: c, cash: ZERO, bank: ZERO, investments: ZERO, total: ZERO, totalMXN: ZERO, rate: rates[c] });
    }
    return buckets.get(c)!;
  };

  let totalAssets = ZERO, liquidity = ZERO, cashMXN = ZERO, investments = ZERO, yieldM = ZERO, receivables = ZERO;

  for (const a of accounts) {
    if (a.archived) continue;
    const mxn = toMXN(a.currentBalance, a.currency, rates);
    totalAssets = totalAssets.plus(mxn);

    if (a.type === "RECEIVABLE") {
      receivables = receivables.plus(mxn);
      continue; // no es dinero que tengas en mano: no entra al desglose por moneda
    }
    const b = bucket(a.currency);
    b.total = b.total.plus(a.currentBalance);
    b.totalMXN = b.totalMXN.plus(mxn);

    if (a.type === "CASH") {
      b.cash = b.cash.plus(a.currentBalance);
      cashMXN = cashMXN.plus(mxn);
      liquidity = liquidity.plus(mxn);
    } else if (a.type === "DEBIT") {
      b.bank = b.bank.plus(a.currentBalance);
      liquidity = liquidity.plus(mxn);
    } else {
      b.investments = b.investments.plus(a.currentBalance);
      investments = investments.plus(mxn);
      if (a.interestRate) yieldM = yieldM.plus(mxn.mul(a.interestRate).div(12));
    }
  }

  const totalLiabilities = cards
    .filter((c) => !c.archived)
    .reduce((s, c) => s.plus(toMXN(c.currentBalance, c.currency, rates)), ZERO);

  const order: Currency[] = ["MXN", "USD", "EUR"];
  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets.minus(totalLiabilities),
    liquidity,
    cashMXN,
    investments,
    investmentMonthlyYield: yieldM,
    receivables,
    byCurrency: order.filter((c) => buckets.has(c)).map((c) => buckets.get(c)!),
  };
}
