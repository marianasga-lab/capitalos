import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTransaction, deleteTransaction, updateTransaction } from "@/server/services/transactions";
import { collectTransaction, counterpartyBalances, deletePayment, recordPayment } from "@/server/services/reimbursements";
import { deleteAccount, reconcileAccount, updateAccount } from "@/server/services/accounts";
import { closeMonth, currentNetWorth, monthStats } from "@/server/services/reports";
import { balance, db, debt, fixture, tx } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => { f = await fixture(); });
afterAll(() => db.$disconnect());

const netWorth = async () => (await currentNetWorth(db)).netWorth.toNumber();

describe("gastos e ingresos", () => {
  it("un gasto con débito baja el saldo; con tarjeta sube la deuda", async () => {
    await createTransaction(db, tx({ type: "EXPENSE", amount: 250, accountId: f.banco.id }));
    await createTransaction(db, tx({ type: "EXPENSE", amount: 400, creditCardId: f.card.id }));
    expect(await balance(f.banco.id)).toBe(9750);
    expect(await debt(f.card.id)).toBe(400);
  });

  it("un ingreso sube el saldo", async () => {
    await createTransaction(db, tx({ type: "INCOME", amount: 4000, accountId: f.banco.id }));
    expect(await balance(f.banco.id)).toBe(14000);
  });

  it("rechaza gastos sin origen, con dos orígenes o en la cuenta del sistema", async () => {
    await expect(createTransaction(db, tx({ type: "EXPENSE", amount: 10 }))).rejects.toThrow(/con qué pagaste/);
    await expect(createTransaction(db, tx({ type: "EXPENSE", amount: 10, accountId: f.banco.id, creditCardId: f.card.id }))).rejects.toThrow(/no ambas/);
    await expect(createTransaction(db, tx({ type: "INCOME", amount: 10, accountId: f.receivable.id }))).rejects.toThrow(/sistema/);
  });
});

describe("traspasos", () => {
  it("mueven saldo sin cambiar el patrimonio", async () => {
    const before = await netWorth();
    await createTransaction(db, tx({ type: "TRANSFER", amount: 3000, accountId: f.banco.id, toAccountId: f.ahorro.id }));
    expect(await balance(f.banco.id)).toBe(7000);
    expect(await balance(f.ahorro.id)).toBe(3000);
    expect(await netWorth()).toBe(before);
  });

  it("entre monedas exige el monto recibido", async () => {
    await expect(createTransaction(db, tx({ type: "TRANSFER", amount: 100, accountId: f.usd.id, toAccountId: f.banco.id }))).rejects.toThrow(/cuánto llegó/);
    await createTransaction(db, tx({ type: "TRANSFER", amount: 100, toAmount: 1830, accountId: f.usd.id, toAccountId: f.banco.id }));
    expect(await balance(f.usd.id)).toBe(400);
    expect(await balance(f.banco.id)).toBe(11830);
  });

  it("pagar la tarjeta baja la deuda y no cambia el patrimonio", async () => {
    await createTransaction(db, tx({ type: "EXPENSE", amount: 1000, creditCardId: f.card.id }));
    const before = await netWorth();
    await createTransaction(db, tx({ type: "TRANSFER", amount: 1000, accountId: f.banco.id, creditCardId: f.card.id }));
    expect(await debt(f.card.id)).toBe(0);
    expect(await netWorth()).toBe(before);
  });
});

describe("reembolsos", () => {
  it("un gasto reembolsable no baja el patrimonio: pasa a por cobrar", async () => {
    const before = await netWorth();
    await createTransaction(db, tx({ type: "REIMBURSABLE_EXPENSE", amount: 1500, accountId: f.banco.id, counterpartyId: f.papa.id }));
    expect(await balance(f.banco.id)).toBe(8500);
    expect(await balance(f.receivable.id)).toBe(1500);
    expect(await netWorth()).toBe(before);
  });

  it("exige a quién se le cobra; acepta un nombre nuevo y lo crea", async () => {
    await expect(createTransaction(db, tx({ type: "REIMBURSABLE_EXPENSE", amount: 10, accountId: f.banco.id }))).rejects.toThrow(/quién/);
    const t = await createTransaction(db, tx({ type: "REIMBURSABLE_EXPENSE", amount: 10, accountId: f.banco.id, counterpartyName: "Roommate" }));
    expect((await db.counterparty.findUniqueOrThrow({ where: { id: t.counterpartyId! } })).name).toBe("Roommate");
  });

  it("'Cobrado' con un clic devuelve el dinero a débito y marca PAID", async () => {
    const t = await createTransaction(db, tx({ type: "REIMBURSABLE_EXPENSE", amount: 800, creditCardId: f.card.id, counterpartyId: f.papa.id }));
    await collectTransaction(db, { transactionId: t.id });
    expect(await balance(f.receivable.id)).toBe(0);
    expect(await balance(f.banco.id)).toBe(10800); // pagué con tarjeta; me depositaron al banco
    expect((await db.transaction.findUniqueOrThrow({ where: { id: t.id } })).reimbursementStatus).toBe("PAID");
  });

  it("abonos parciales se reparten del gasto más antiguo al más nuevo", async () => {
    const a = await createTransaction(db, tx({ type: "REIMBURSABLE_EXPENSE", amount: 1000, accountId: f.banco.id, counterpartyId: f.papa.id, date: "2026-11-01" }));
    const b = await createTransaction(db, tx({ type: "REIMBURSABLE_EXPENSE", amount: 600, accountId: f.banco.id, counterpartyId: f.papa.id, date: "2026-11-05" }));
    await recordPayment(db, { counterpartyId: f.papa.id, amount: "1300", accountId: f.banco.id, date: "2026-11-10" });
    const [ra, rb] = await Promise.all([a, b].map((t) => db.transaction.findUniqueOrThrow({ where: { id: t.id } })));
    expect(ra.reimbursementStatus).toBe("PAID");
    expect(rb.reimbursementStatus).toBe("PENDING");
    expect(rb.amountReimbursed.toNumber()).toBe(300);
    const [papa] = await counterpartyBalances(db);
    expect(papa.owedMXN.toNumber()).toBe(300);
    expect(await balance(f.receivable.id)).toBe(300);
  });

  it("no acepta abonos mayores a la deuda", async () => {
    await createTransaction(db, tx({ type: "REIMBURSABLE_EXPENSE", amount: 100, accountId: f.banco.id, counterpartyId: f.papa.id }));
    await expect(recordPayment(db, { counterpartyId: f.papa.id, amount: "150", accountId: f.banco.id, date: "2026-11-10" })).rejects.toThrow(/mayor a lo que te debe/);
    expect(await balance(f.banco.id)).toBe(9900); // no se movió nada
  });

  it("un reembolsable en euros entra a por cobrar convertido a MXN", async () => {
    await createTransaction(db, tx({ type: "REIMBURSABLE_EXPENSE", amount: 20, accountId: f.eur.id, counterpartyId: f.papa.id }));
    expect(await balance(f.eur.id)).toBe(280);
    expect(await balance(f.receivable.id)).toBe(430); // 20 × 21.5
  });

  it("borrar un abono lo revierte y regresa el gasto a PENDING", async () => {
    const t = await createTransaction(db, tx({ type: "REIMBURSABLE_EXPENSE", amount: 500, accountId: f.banco.id, counterpartyId: f.papa.id }));
    const [p] = await collectTransaction(db, { transactionId: t.id });
    await deletePayment(db, p.id);
    expect(await balance(f.banco.id)).toBe(9500);
    expect(await balance(f.receivable.id)).toBe(500);
    expect((await db.transaction.findUniqueOrThrow({ where: { id: t.id } })).reimbursementStatus).toBe("PENDING");
  });
});

describe("gastos compartidos", () => {
  it("solo mi parte cuenta como gasto; la otra queda por cobrar", async () => {
    await createTransaction(db, tx({ type: "EXPENSE", amount: 2400, myShareAmount: 1200, creditCardId: f.card.id, counterpartyName: "Padi" }));
    expect(await debt(f.card.id)).toBe(2400);
    expect(await balance(f.receivable.id)).toBe(1200);
    const s = await monthStats(db, 2026, 11);
    expect(s.expenses.toNumber()).toBe(1200);
  });

  it("tu parte no puede superar el total", async () => {
    await expect(createTransaction(db, tx({ type: "EXPENSE", amount: 100, myShareAmount: 150, accountId: f.banco.id, counterpartyName: "Padi" }))).rejects.toThrow(/mayor al total/);
  });
});

describe("editar y borrar", () => {
  it("editar el monto y la cuenta reacomoda los saldos", async () => {
    const t = await createTransaction(db, tx({ type: "EXPENSE", amount: 300, accountId: f.banco.id }));
    await updateTransaction(db, t.id, tx({ type: "EXPENSE", amount: 50, accountId: f.eur.id }));
    expect(await balance(f.banco.id)).toBe(10000);
    expect(await balance(f.eur.id)).toBe(250);
    expect((await db.transaction.findUniqueOrThrow({ where: { id: t.id } })).currency).toBe("EUR");
  });

  it("borrar restaura los saldos", async () => {
    const t = await createTransaction(db, tx({ type: "TRANSFER", amount: 2000, accountId: f.banco.id, toAccountId: f.ahorro.id }));
    await deleteTransaction(db, t.id);
    expect(await balance(f.banco.id)).toBe(10000);
    expect(await balance(f.ahorro.id)).toBe(0);
  });

  it("no deja borrar un gasto con abonos ni bajar lo adeudado por debajo de lo abonado", async () => {
    const t = await createTransaction(db, tx({ type: "REIMBURSABLE_EXPENSE", amount: 1000, accountId: f.banco.id, counterpartyId: f.papa.id }));
    await recordPayment(db, { counterpartyId: f.papa.id, amount: "600", accountId: f.banco.id, date: "2026-11-11", transactionId: t.id });
    await expect(deleteTransaction(db, t.id)).rejects.toThrow(/abonos/);
    await expect(updateTransaction(db, t.id, tx({ type: "REIMBURSABLE_EXPENSE", amount: 500, accountId: f.banco.id, counterpartyId: f.papa.id }))).rejects.toThrow(/abonaron más/);
    await updateTransaction(db, t.id, tx({ type: "REIMBURSABLE_EXPENSE", amount: 600, accountId: f.banco.id, counterpartyId: f.papa.id }));
    expect((await db.transaction.findUniqueOrThrow({ where: { id: t.id } })).reimbursementStatus).toBe("PAID");
    expect(await balance(f.receivable.id)).toBe(0);
  });

  it("una falla a la mitad no deja saldos a medias", async () => {
    // Tarjeta inexistente: debe fallar sin tocar el banco.
    await expect(createTransaction(db, tx({ type: "TRANSFER", amount: 500, accountId: f.banco.id, creditCardId: "no-existe" }))).rejects.toThrow();
    expect(await balance(f.banco.id)).toBe(10000);
  });
});

describe("cuentas", () => {
  it("conciliar registra la diferencia como ajuste, fuera de ingresos y gastos", async () => {
    await reconcileAccount(db, { accountId: f.usd.id, actualBalance: "480", date: "2026-11-12" });
    expect(await balance(f.usd.id)).toBe(480);
    const s = await monthStats(db, 2026, 11);
    expect(s.expenses.toNumber()).toBe(0);
  });

  it("no archiva con saldo ni borra con movimientos", async () => {
    await expect(updateAccount(db, { id: f.banco.id, archived: true })).rejects.toThrow(/saldo/);
    await createTransaction(db, tx({ type: "EXPENSE", amount: 1, accountId: f.banco.id }));
    await expect(deleteAccount(db, f.banco.id)).rejects.toThrow(/Archívala/);
    await expect(deleteAccount(db, f.receivable.id)).rejects.toThrow(/sistema/);
  });
});

describe("reportes", () => {
  it("separa capital propio de apoyo familiar y calcula el ahorro", async () => {
    await createTransaction(db, tx({ type: "INCOME", amount: 8000, accountId: f.banco.id }));
    await createTransaction(db, tx({ type: "INCOME", amount: 2000, accountId: f.banco.id, fundSource: "ALLOWANCE_FAMILY", counterpartyId: f.papa.id }));
    await createTransaction(db, tx({ type: "EXPENSE", amount: 3000, accountId: f.banco.id, isFixedExpense: true }));
    await createTransaction(db, tx({ type: "EXPENSE", amount: 1000, accountId: f.banco.id, fundSource: "ALLOWANCE_FAMILY" }));
    await createTransaction(db, tx({ type: "REIMBURSABLE_EXPENSE", amount: 500, accountId: f.banco.id, counterpartyId: f.papa.id }));
    const s = await monthStats(db, 2026, 11);
    expect(s.income.toNumber()).toBe(10000);
    expect(s.incomeFamily.toNumber()).toBe(2000);
    expect(s.expensesOwn.toNumber()).toBe(3000);
    expect(s.expensesFamily.toNumber()).toBe(1000);
    expect(s.fixedExpenses.toNumber()).toBe(3000);
    expect(s.reimbursable.toNumber()).toBe(500);
    expect(s.savingsRate.toNumber()).toBe(0.6);

    const snap = await closeMonth(db, 2026, 11);
    expect(snap.netWorth.toNumber()).toBe(await netWorth());
    await closeMonth(db, 2026, 11); // repetir no duplica
    expect(await db.monthlySnapshot.count()).toBe(1);
  });
});
