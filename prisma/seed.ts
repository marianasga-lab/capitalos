/**
 * Datos de prueba de CapitalOS (ficticios).
 * Correr:  npx prisma db seed
 *
 * Los saldos NO se escriben a mano: cada cuenta arranca con un saldo de
 * apertura y luego cada movimiento pasa por el libro mayor (ledger.ts),
 * igual que lo hará la app. Así el seed también prueba las reglas.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { applyDeltas, computeDeltas, paymentDeltas } from "../src/lib/finance/ledger";

const db = new PrismaClient();
const d = (iso: string) => new Date(`${iso}T12:00:00`);
const EUR_MXN = 21.5; // aproximado, editable en Ajustes

async function main() {
  // Limpieza (orden por dependencias) para que el seed sea repetible.
  await db.$transaction([
    db.reimbursementPayment.deleteMany(),
    db.transaction.deleteMany(),
    db.budget.deleteMany(),
    db.category.deleteMany(),
    db.savingsGoal.deleteMany(),
    db.monthlySnapshot.deleteMany(),
    db.counterparty.deleteMany(),
    db.creditCard.deleteMany(),
    db.account.deleteMany(),
    db.exchangeRate.deleteMany(),
  ]);

  await db.exchangeRate.createMany({
    data: [
      { currency: "MXN", rateToMXN: 1 },
      { currency: "USD", rateToMXN: 18.5 },
      { currency: "EUR", rateToMXN: EUR_MXN },
    ],
  });

  // ---------- Cuentas (saldo de apertura al 30 sep 2026) ----------
  const [banco, euros, pagare, efectivo, porCobrar] = await Promise.all([
    db.account.create({ data: { name: "Banco Principal", type: "DEBIT", currency: "MXN", currentBalance: 18000 } }),
    db.account.create({ data: { name: "Cuenta en Euros", type: "DEBIT", currency: "EUR", currentBalance: 450 } }),
    db.account.create({
      data: { name: "Pagaré 28 días", type: "INVESTMENT", currency: "MXN", currentBalance: 40000, interestRate: 0.102 },
    }),
    db.account.create({ data: { name: "Efectivo", type: "CASH", currency: "MXN", currentBalance: 1500 } }),
    db.account.create({
      data: { name: "Cuentas por Cobrar", type: "RECEIVABLE", currency: "MXN", currentBalance: 0, isSystem: true },
    }),
  ]);

  // ---------- Tarjetas (cortes distintos) ----------
  const oro = await db.creditCard.create({
    data: { name: "Tarjeta Oro", limit: 45000, cutoffDay: 3, paymentDueDay: 21, interestRate: 0.58, currentBalance: 2400 },
  });
  const digital = await db.creditCard.create({
    data: { name: "Tarjeta Digital", limit: 25000, cutoffDay: 20, paymentDueDay: 10, interestRate: 0.72, currentBalance: 0 },
  });

  // ---------- Personas ----------
  const papa = await db.counterparty.create({ data: { name: "Papá", isFamily: true } });
  const padi = await db.counterparty.create({ data: { name: "Padi" } });

  // ---------- Categorías + presupuesto (Previsto vs Real) ----------
  const expenseCats: [string, number, boolean, "OWN_CAPITAL" | "ALLOWANCE_FAMILY"][] = [
    ["Renta", 9500, true, "OWN_CAPITAL"],
    ["Súper", 3000, false, "OWN_CAPITAL"],
    ["Salidas", 2000, false, "OWN_CAPITAL"],
    ["Transporte", 800, false, "OWN_CAPITAL"],
    ["Teléfono", 700, true, "OWN_CAPITAL"],
    ["Suscripciones", 650, true, "OWN_CAPITAL"],
    ["Suministros", 900, true, "OWN_CAPITAL"],
    ["Salud", 1500, false, "ALLOWANCE_FAMILY"],
    ["Educación", 0, false, "ALLOWANCE_FAMILY"],
    ["Viajes", 1500, false, "OWN_CAPITAL"],
    ["Regalos", 500, false, "OWN_CAPITAL"],
    ["Personal", 800, false, "OWN_CAPITAL"],
  ];
  const incomeCats = ["Sueldo", "Freelance", "Apoyo familiar", "Intereses", "Reembolsos"];

  for (const [name, budget, isFixed, fs] of expenseCats) {
    const cat = await db.category.create({
      data: { name, kind: "EXPENSE", defaultBudget: budget, isFixed, defaultFundSource: fs },
    });
    for (const month of [10, 11]) {
      await db.budget.create({ data: { categoryId: cat.id, year: 2026, month, plannedAmount: budget } });
    }
  }
  for (const name of incomeCats) {
    await db.category.create({
      data: { name, kind: "INCOME", defaultFundSource: name === "Apoyo familiar" ? "ALLOWANCE_FAMILY" : "OWN_CAPITAL" },
    });
  }

  // ---------- Movimientos ----------
  type Tx = Omit<Prisma.TransactionUncheckedCreateInput, "amount" | "myShareAmount"> & { amount: number; myShareAmount?: number };
  const txs: Tx[] = [
    // Octubre
    { date: d("2026-10-01"), amount: 9500, description: "Renta octubre", category: "Renta", type: "EXPENSE", accountId: banco.id, isFixedExpense: true },
    { date: d("2026-10-04"), amount: 8000, description: "Pago proyecto web (cliente freelance)", category: "Freelance", type: "INCOME", accountId: banco.id },
    { date: d("2026-10-05"), amount: 4000, description: "Sueldo fijo", category: "Sueldo", type: "INCOME", accountId: banco.id },
    { date: d("2026-10-07"), amount: 2000, description: "Mesada octubre", category: "Apoyo familiar", type: "INCOME", accountId: banco.id, fundSource: "ALLOWANCE_FAMILY", counterpartyId: papa.id },
    { date: d("2026-10-10"), amount: 1850, description: "Súper quincenal", category: "Súper", type: "EXPENSE", accountId: banco.id },
    { date: d("2026-10-12"), amount: 649, description: "Suscripciones (streaming y nube)", category: "Suscripciones", type: "EXPENSE", creditCardId: oro.id, isFixedExpense: true },
    { date: d("2026-10-15"), amount: 10000, description: "Aportación a pagaré", category: "Ahorro", type: "TRANSFER", accountId: banco.id, toAccountId: pagare.id },
    { date: d("2026-10-18"), amount: 1537, description: "Medicinas de Papá", category: "Salud", type: "REIMBURSABLE_EXPENSE", creditCardId: digital.id, counterpartyId: papa.id, fundSource: "ALLOWANCE_FAMILY", reimbursementStatus: "PENDING" },
    { date: d("2026-10-22"), amount: 1200, description: "Albergue y tren (compartido con Padi)", category: "Viajes", type: "EXPENSE", creditCardId: digital.id, fundSource: "SHARED_SPLIT", counterpartyId: padi.id, myShareAmount: 600 },
    { date: d("2026-10-28"), amount: 3200, description: "Pago Tarjeta Oro", category: "Pago de tarjeta", type: "TRANSFER", accountId: banco.id, creditCardId: oro.id },
    // Noviembre
    { date: d("2026-11-01"), amount: 9500, description: "Renta noviembre", category: "Renta", type: "EXPENSE", accountId: banco.id, isFixedExpense: true },
    { date: d("2026-11-03"), amount: 32, description: "Plan móvil", category: "Teléfono", type: "EXPENSE", accountId: euros.id, currency: "EUR", fxToMXN: EUR_MXN, isFixedExpense: true },
    { date: d("2026-11-05"), amount: 4000, description: "Sueldo fijo", category: "Sueldo", type: "INCOME", accountId: banco.id },
    { date: d("2026-11-06"), amount: 3000, description: "Mesada noviembre", category: "Apoyo familiar", type: "INCOME", accountId: banco.id, fundSource: "ALLOWANCE_FAMILY", counterpartyId: papa.id },
    { date: d("2026-11-07"), amount: 1200, description: "Cena de cumpleaños (con mesada)", category: "Salidas", type: "EXPENSE", accountId: banco.id, fundSource: "ALLOWANCE_FAMILY", counterpartyId: papa.id },
    { date: d("2026-11-08"), amount: 4040, description: "Pensión noviembre (la adelanté yo)", category: "Educación", type: "REIMBURSABLE_EXPENSE", accountId: banco.id, counterpartyId: papa.id, fundSource: "ALLOWANCE_FAMILY", reimbursementStatus: "PENDING" },
    { date: d("2026-11-10"), amount: 890, description: "Súper", category: "Súper", type: "EXPENSE", creditCardId: oro.id },
    { date: d("2026-11-12"), amount: 560, description: "Uber al aeropuerto", category: "Transporte", type: "EXPENSE", creditCardId: digital.id },
    { date: d("2026-11-13"), amount: 350, description: "Tacos con amigas", category: "Salidas", type: "EXPENSE", accountId: efectivo.id },
    { date: d("2026-11-15"), amount: 750, description: "Boletos de concierto de Padi", category: "Salidas", type: "REIMBURSABLE_EXPENSE", creditCardId: oro.id, counterpartyId: padi.id, reimbursementStatus: "PENDING" },
  ];

  const created: Record<string, string> = {};
  for (const t of txs) {
    await db.$transaction(async (tx) => {
      const row = await tx.transaction.create({ data: t });
      await applyDeltas(tx, computeDeltas(t, porCobrar.id));
      created[t.description] = row.id;
    });
  }

  // ---------- Abonos (incluye uno parcial) ----------
  const payments = [
    { date: d("2026-10-30"), amount: 600, counterpartyId: padi.id, accountId: banco.id, txKey: "Albergue y tren (compartido con Padi)", notes: "Transferencia de Padi" },
    { date: d("2026-11-02"), amount: 1537, counterpartyId: papa.id, accountId: banco.id, txKey: "Medicinas de Papá" },
    { date: d("2026-11-14"), amount: 2500, counterpartyId: papa.id, accountId: banco.id, txKey: "Pensión noviembre (la adelanté yo)", notes: "Abono parcial" },
  ];
  for (const p of payments) {
    await db.$transaction(async (tx) => {
      const transactionId = created[p.txKey];
      await tx.reimbursementPayment.create({
        data: { date: p.date, amount: p.amount, counterpartyId: p.counterpartyId, accountId: p.accountId, transactionId, notes: p.notes },
      });
      const parent = await tx.transaction.update({
        where: { id: transactionId },
        data: { amountReimbursed: { increment: p.amount } },
      });
      const owed = parent.myShareAmount ? parent.amount.minus(parent.myShareAmount) : parent.amount;
      if (parent.type === "REIMBURSABLE_EXPENSE" && parent.amountReimbursed.gte(owed)) {
        await tx.transaction.update({ where: { id: transactionId }, data: { reimbursementStatus: "PAID", reimbursedAt: p.date, reimbursedToId: p.accountId } });
      }
      await applyDeltas(tx, paymentDeltas(p.amount, p.accountId, porCobrar.id));
    });
  }

  // ---------- Metas ----------
  await db.savingsGoal.createMany({
    data: [
      { name: "Fondo de emergencia (6 meses)", targetAmount: 90000, currentAmount: 50000, deadline: d("2027-06-30"), accountId: pagare.id },
      { name: "Viaje 2027", targetAmount: 35000, currentAmount: 8000, deadline: d("2027-07-15") },
    ],
  });

  // ---------- Historial (ilustrativo) ----------
  const history = [
    [5, 61200, 3100, 0.18],
    [6, 63900, 2800, 0.21],
    [7, 62500, 4500, 0.09],
    [8, 66800, 3900, 0.24],
    [9, 70400, 2400, 0.27],
  ] as const;
  for (const [month, assets, liab, rate] of history) {
    await db.monthlySnapshot.create({
      data: { year: 2026, month, totalAssets: assets, totalLiabilities: liab, netWorth: assets - liab, savingsRate: rate },
    });
  }

  // Resumen en consola
  const accounts = await db.account.findMany({ orderBy: { name: "asc" } });
  const cards = await db.creditCard.findMany();
  console.log("\nSaldos tras el seed:");
  for (const a of accounts) console.log(`  ${a.name.padEnd(22)} ${a.currency} ${a.currentBalance.toFixed(2)}`);
  for (const c of cards) console.log(`  ${c.name.padEnd(22)} deuda ${c.currentBalance.toFixed(2)}`);
  console.log(`  Movimientos: ${await db.transaction.count()} · Abonos: ${await db.reimbursementPayment.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
