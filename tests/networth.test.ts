import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { computeNetWorth } from "@/lib/finance/networth";
import { computeDeltas, LedgerError } from "@/lib/finance/ledger";

const D = (v: number) => new Prisma.Decimal(v);
const rates = { MXN: D(1), USD: D(18.5), EUR: D(21.5) };

describe("computeNetWorth", () => {
  it("consolida en MXN y desglosa efectivo por moneda", () => {
    const nw = computeNetWorth(
      [
        { id: "1", name: "Banco", type: "DEBIT", currency: "MXN", currentBalance: D(10000) },
        { id: "2", name: "Dólares", type: "CASH", currency: "USD", currentBalance: D(200) },
        { id: "3", name: "Euros", type: "CASH", currency: "EUR", currentBalance: D(100) },
        { id: "4", name: "Pagaré", type: "INVESTMENT", currency: "MXN", currentBalance: D(12000), interestRate: D(0.12) },
        { id: "5", name: "Por cobrar", type: "RECEIVABLE", currency: "MXN", currentBalance: D(500) },
        { id: "6", name: "Vieja", type: "DEBIT", currency: "MXN", currentBalance: D(999), archived: true },
      ],
      [{ id: "c", name: "Tarjeta", currency: "MXN", currentBalance: D(3000) }],
      rates,
    );
    expect(nw.totalAssets.toNumber()).toBe(10000 + 3700 + 2150 + 12000 + 500);
    expect(nw.totalLiabilities.toNumber()).toBe(3000);
    expect(nw.netWorth.toNumber()).toBe(25350);
    expect(nw.cashMXN.toNumber()).toBe(5850);
    expect(nw.liquidity.toNumber()).toBe(15850);
    expect(nw.investmentMonthlyYield.toNumber()).toBe(120);
    expect(nw.receivables.toNumber()).toBe(500);
    expect(nw.byCurrency.map((b) => [b.currency, b.cash.toNumber()])).toEqual([["MXN", 0], ["USD", 200], ["EUR", 100]]);
  });
});

describe("computeDeltas", () => {
  it("rechaza montos en cero o negativos", () => {
    expect(() => computeDeltas({ type: "INCOME", amount: 0, accountId: "a" }, "r")).toThrow(LedgerError);
  });
});

import { money } from "@/lib/validation";
describe("validación de montos", () => {
  it("explica claramente los montos negativos o mal escritos", () => {
    expect(money.safeParse("-5").error?.issues[0].message).toBe("El monto debe ser mayor a 0.");
    expect(money.safeParse("1.234").success).toBe(false);
    expect(money.safeParse("1,250.50").data).toBe("1250.50");
  });
});
