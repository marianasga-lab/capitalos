import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import { exportAll, exportTransactionsCsv, importTransactionsCsv, restoreAll } from "@/server/services/backup";
import { createTransaction } from "@/server/services/transactions";
import { recordPayment } from "@/server/services/reimbursements";
import { createFund } from "@/server/services/funds";
import { currentNetWorth } from "@/server/services/reports";
import { balance, db, debt, fixture, tx } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => { f = await fixture(); });
afterAll(() => db.$disconnect());

async function scenario() {
  const fund = await createFund(db, { name: "Colegiatura", counterpartyId: f.papa.id, expectedAmount: "1000", counterpartyName: null, notes: null });
  await createTransaction(db, tx({ type: "INCOME", amount: 5000, accountId: f.banco.id, description: "Sueldo, quincena" }));
  await createTransaction(db, tx({ type: "EXPENSE", amount: "123.45", creditCardId: f.card.id, description: 'Cena "especial"' }));
  await createTransaction(db, tx({ type: "TRANSFER", amount: 50, toAmount: 900, accountId: f.usd.id, toAccountId: f.banco.id }));
  await createTransaction(db, tx({ type: "EXPENSE", amount: 600, myShareAmount: 300, accountId: f.banco.id, counterpartyName: "Padi" }));
  const r = await createTransaction(db, tx({ type: "REIMBURSABLE_EXPENSE", amount: 20, accountId: f.eur.id, counterpartyId: f.papa.id }));
  await recordPayment(db, { counterpartyId: f.papa.id, amount: "200", accountId: f.banco.id, date: "2026-11-12", transactionId: r.id });
  await createTransaction(db, tx({ type: "FUND_DEPOSIT", amount: 1000, accountId: f.banco.id, fundId: fund.id }));
  await createTransaction(db, tx({ type: "FUND_PAYMENT", amount: 1100, creditCardId: f.card.id, fundId: fund.id }));
}

const snapshot = async () => ({
  accounts: (await db.account.findMany({ orderBy: { name: "asc" } })).map((a) => `${a.name}:${a.currentBalance}`),
  cards: (await db.creditCard.findMany()).map((c) => `${c.name}:${c.currentBalance}`),
  funds: (await db.fund.findMany()).map((x) => `${x.name}:${x.balance}`),
  netWorth: (await currentNetWorth(db)).netWorth.toString(),
  tx: await db.transaction.count(),
  payments: await db.reimbursementPayment.count(),
});

describe("CSV", () => {
  it("lee comillas, comas internas, BOM y separador ;", () => {
    expect(parseCsv('﻿a,b\n"1,5","dijo ""hola"""\n')).toEqual([["a", "b"], ["1,5", 'dijo "hola"']]);
    expect(parseCsv("fecha;monto\r\n05/11/2026;120\r\n")).toEqual([["fecha", "monto"], ["05/11/2026", "120"]]);
  });
});

describe("respaldo JSON", () => {
  it("exportar → borrar todo → restaurar deja todo idéntico", async () => {
    await scenario();
    const before = await snapshot();
    const backup = JSON.parse(JSON.stringify(await exportAll(db))); // como si viniera de un archivo
    await db.$transaction([db.reimbursementPayment.deleteMany(), db.transaction.deleteMany(), db.fund.deleteMany()]);
    await db.account.updateMany({ data: { currentBalance: 0 } });
    expect((await snapshot()).tx).toBe(0);

    const counts = await restoreAll(db, backup);
    expect(counts.transaction).toBe(before.tx);
    expect(await snapshot()).toEqual(before);
  });

  it("rechaza archivos que no son respaldos sin borrar nada", async () => {
    await scenario();
    const before = await snapshot();
    await expect(restoreAll(db, { hola: 1 })).rejects.toThrow(/no es un respaldo/);
    const bad = await exportAll(db);
    (bad.data.transaction[0] as Record<string, unknown>).date = "no-es-fecha";
    await expect(restoreAll(db, JSON.parse(JSON.stringify(bad)))).rejects.toThrow(/Fecha inválida/);
    expect(await snapshot()).toEqual(before); // la transacción se revirtió
  });
});

describe("CSV de movimientos", () => {
  it("se puede exportar y volver a importar con los mismos saldos (sin abonos)", async () => {
    await scenario();
    await db.reimbursementPayment.deleteMany(); // el CSV no lleva abonos: comparamos sin ellos
    const csv = await exportTransactionsCsv(db);

    // Vuelve al punto de partida: mismos saldos iniciales, sin movimientos
    f = await fixture();
    await createFund(db, { name: "Colegiatura", counterpartyId: f.papa.id, counterpartyName: null, expectedAmount: null, notes: null });

    const dry = await importTransactionsCsv(db, csv, { commit: false });
    expect(dry.errors).toEqual([]);
    expect(await db.transaction.count()).toBe(0); // la vista previa no guarda

    const done = await importTransactionsCsv(db, csv, { commit: true });
    expect(done.imported).toBe(7);
    expect(await balance(f.banco.id)).toBe(10000 + 5000 + 900 - 600 + 1000);
    expect(await debt(f.card.id)).toBe(123.45 + 1100);
    expect(await balance(f.receivable.id)).toBe(300 + 20 * 21.5); // split + reembolsable en euros, sin abonos
    expect((await db.fund.findFirstOrThrow()).balance.toNumber()).toBe(-100);
  });

  it("reporta errores por línea y no importa nada si hay uno", async () => {
    const csv = [
      "Fecha,Tipo,Monto,Descripción,Cuenta,Tarjeta",
      "05/11/2026,gasto,100,Súper,Banco,",
      "06/11/2026,gasto,abc,Error de monto,Banco,",
      "07/11/2026,gasto,50,Tarjeta fantasma,,Inexistente",
      "08/11/2026,regalo,50,Tipo raro,Banco,",
    ].join("\n");
    const r = await importTransactionsCsv(db, csv, { commit: true });
    expect(r.valid).toBe(1);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5]);
    expect(r.errors[1].message).toMatch(/Inexistente/);
    expect(r.imported).toBe(0);
    expect(await db.transaction.count()).toBe(0);
  });

  it("si una regla de negocio falla en la línea N, se revierte todo", async () => {
    const csv = ["fecha,tipo,monto,descripcion,cuenta", "2026-11-05,gasto,100,Uno,Banco", "2026-11-06,me_deben,50,Sin persona,Banco"].join("\n");
    await expect(importTransactionsCsv(db, csv, { commit: true })).rejects.toThrow(/Línea 3/);
    expect(await db.transaction.count()).toBe(0);
    expect(await balance(f.banco.id)).toBe(10000);
  });
});
