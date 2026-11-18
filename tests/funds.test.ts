import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTransaction, deleteTransaction } from "@/server/services/transactions";
import { closeFund, createFund, fundSummaries } from "@/server/services/funds";
import { currentNetWorth, monthStats } from "@/server/services/reports";
import { balance, db, debt, fixture, tx } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
let tec: { id: string };
beforeEach(async () => {
  f = await fixture();
  tec = await createFund(db, { name: "Colegiatura Tec", counterpartyId: f.papa.id, expectedAmount: "34268.58", counterpartyName: null, notes: null });
});
afterAll(() => db.$disconnect());

const summary = async () => (await fundSummaries(db, { id: tec.id }))[0];
const nw = async () => (await currentNetWorth(db)).netWorth.toNumber();

describe("bolsas de dinero de terceros", () => {
  it("el depósito de Papá entra al banco pero no sube mi patrimonio ni mis ingresos", async () => {
    const before = await nw();
    await createTransaction(db, tx({ type: "FUND_DEPOSIT", amount: 33300, accountId: f.banco.id, fundId: tec.id }));
    expect(await balance(f.banco.id)).toBe(43300);
    expect(await nw()).toBe(before);
    const s = await monthStats(db, 2026, 11);
    expect(s.income.toNumber()).toBe(0);
    expect(s.fundsIn.toNumber()).toBe(33300);
    const n = await currentNetWorth(db);
    expect(n.thirdPartyHeld.toNumber()).toBe(33300);
    expect(n.ownLiquidity.toNumber()).toBe(n.liquidity.toNumber() - 33300);
  });

  it("detecta cuando pagué de más y cuánto falta que deposite", async () => {
    await createTransaction(db, tx({ type: "FUND_DEPOSIT", amount: 33300, accountId: f.banco.id, fundId: tec.id }));
    const before = await nw();
    await createTransaction(db, tx({ type: "FUND_PAYMENT", amount: "34268.58", creditCardId: f.card.id, fundId: tec.id }));
    expect(await debt(f.card.id)).toBe(34268.58);
    expect(await nw()).toBe(before); // pagar con su dinero no me empobrece
    const s = await summary();
    expect(s.state).toBe("OVERPAID");
    expect(s.balance.toNumber()).toBe(-968.58);
    expect(s.missingDeposit!.toNumber()).toBe(968.58);
    expect(s.message).toMatch(/de más/);
    expect((await monthStats(db, 2026, 11)).expenses.toNumber()).toBe(0);
  });

  it("cuadra cuando deposita la diferencia, y se cierra sin ajustes", async () => {
    await createTransaction(db, tx({ type: "FUND_DEPOSIT", amount: 33300, accountId: f.banco.id, fundId: tec.id }));
    await createTransaction(db, tx({ type: "FUND_PAYMENT", amount: "34268.58", accountId: f.banco.id, fundId: tec.id }));
    await createTransaction(db, tx({ type: "FUND_DEPOSIT", amount: "968.58", accountId: f.banco.id, fundId: tec.id }));
    expect((await summary()).state).toBe("BALANCED");
    await closeFund(db, { id: tec.id, date: "2026-11-20", settle: null });
    expect(await db.transaction.count({ where: { fundId: tec.id } })).toBe(3);
    await expect(createTransaction(db, tx({ type: "FUND_DEPOSIT", amount: 1, accountId: f.banco.id, fundId: tec.id }))).rejects.toThrow(/cerrada/);
  });

  it("no cierra con diferencia sin decidir; absorberla la cuenta como mi gasto", async () => {
    await createTransaction(db, tx({ type: "FUND_DEPOSIT", amount: 1000, accountId: f.banco.id, fundId: tec.id }));
    await createTransaction(db, tx({ type: "FUND_PAYMENT", amount: 1200, accountId: f.banco.id, fundId: tec.id }));
    await expect(closeFund(db, { id: tec.id, date: "2026-11-20", settle: null })).rejects.toThrow(/de más/);
    const before = await nw();
    await closeFund(db, { id: tec.id, date: "2026-11-20", settle: "ABSORB" });
    expect(await nw()).toBe(before - 200);
    expect((await summary()).state).toBe("BALANCED");
    expect((await monthStats(db, 2026, 11)).expenses.toNumber()).toBe(200);
    expect(await balance(f.banco.id)).toBe(9800); // el ajuste no mueve dinero, solo de dueño
  });

  it("quedarme el sobrante lo cuenta como apoyo familiar", async () => {
    await createTransaction(db, tx({ type: "FUND_DEPOSIT", amount: 1000, accountId: f.banco.id, fundId: tec.id }));
    await createTransaction(db, tx({ type: "FUND_PAYMENT", amount: 900, accountId: f.banco.id, fundId: tec.id }));
    await closeFund(db, { id: tec.id, date: "2026-11-20", settle: "KEEP" });
    const s = await monthStats(db, 2026, 11);
    expect(s.incomeFamily.toNumber()).toBe(100);
    expect((await currentNetWorth(db)).thirdPartyHeld.toNumber()).toBe(0);
  });

  it("exige la bolsa y deja borrar y revertir", async () => {
    await expect(createTransaction(db, tx({ type: "FUND_DEPOSIT", amount: 10, accountId: f.banco.id }))).rejects.toThrow(/bolsa/);
    const t = await createTransaction(db, tx({ type: "FUND_DEPOSIT", amount: 500, accountId: f.banco.id, fundId: tec.id }));
    await deleteTransaction(db, t.id);
    expect(await balance(f.banco.id)).toBe(10000);
    expect((await summary()).balance.toNumber()).toBe(0);
  });
});
