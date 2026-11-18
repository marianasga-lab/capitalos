import { PrismaClient } from "@prisma/client";
import { transactionInput, type TransactionInput } from "@/lib/validation";

export const db = new PrismaClient();

/** Borra todo y crea un escenario mínimo. */
export async function fixture() {
  await db.$transaction([
    db.reimbursementPayment.deleteMany(), db.transaction.deleteMany(), db.fund.deleteMany(), db.budget.deleteMany(),
    db.category.deleteMany(), db.savingsGoal.deleteMany(), db.monthlySnapshot.deleteMany(),
    db.counterparty.deleteMany(), db.creditCard.deleteMany(), db.account.deleteMany(), db.exchangeRate.deleteMany(),
  ]);
  await db.exchangeRate.createMany({ data: [{ currency: "MXN", rateToMXN: 1 }, { currency: "USD", rateToMXN: 18.5 }, { currency: "EUR", rateToMXN: 21.5 }] });
  const banco = await db.account.create({ data: { name: "Banco", type: "DEBIT", currentBalance: 10000 } });
  const ahorro = await db.account.create({ data: { name: "Ahorro", type: "INVESTMENT", currentBalance: 0, interestRate: 0.12 } });
  const usd = await db.account.create({ data: { name: "Dólares", type: "CASH", currency: "USD", currentBalance: 500 } });
  const eur = await db.account.create({ data: { name: "Euros", type: "DEBIT", currency: "EUR", currentBalance: 300 } });
  const receivable = await db.account.create({ data: { name: "Cuentas por Cobrar", type: "RECEIVABLE", isSystem: true } });
  const card = await db.creditCard.create({ data: { name: "Tarjeta", limit: 20000, cutoffDay: 5, paymentDueDay: 25, interestRate: 0.6 } });
  const papa = await db.counterparty.create({ data: { name: "Papá", isFamily: true } });
  return { banco, ahorro, usd, eur, receivable, card, papa };
}

export const balance = async (id: string) => (await db.account.findUniqueOrThrow({ where: { id } })).currentBalance.toNumber();
export const debt = async (id: string) => (await db.creditCard.findUniqueOrThrow({ where: { id } })).currentBalance.toNumber();

export const tx = (t: Partial<TransactionInput> & Pick<TransactionInput, "type" | "amount">) =>
  transactionInput.parse({ date: "2026-11-10", description: "Prueba", category: "Varios", ...t });
