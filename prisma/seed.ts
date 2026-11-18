/**
 * Datos de prueba de CapitalOS (ficticios).
 * Correr:  npx prisma db seed
 *
 * Los saldos NO se escriben a mano: cada cuenta arranca con un saldo de
 * apertura y luego cada movimiento pasa por el libro mayor (ledger.ts),
 * igual que lo hará la app. Así el seed también prueba las reglas.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { paymentInput, transactionInput, type TransactionInput } from "../src/lib/validation";
import { createTransaction } from "../src/server/services/transactions";
import { recordPayment } from "../src/server/services/reimbursements";
import { createFund } from "../src/server/services/funds";
import { computeNetWorth } from "../src/lib/finance/networth";

const db = new PrismaClient();
const d = (iso: string) => new Date(`${iso}T12:00:00`); // solo para metas
const EUR_MXN = 21.5; // aproximado, editable en Ajustes

// ---------- Catálogo base (también para el modo vacío) ----------
const expenseCats: [string, number, boolean, "OWN_CAPITAL" | "ALLOWANCE_FAMILY"][] = [
  ["Renta", 9500, true, "OWN_CAPITAL"],
  ["Súper", 3000, false, "OWN_CAPITAL"],
  ["Salidas", 2000, false, "OWN_CAPITAL"],
  ["Transporte", 800, false, "OWN_CAPITAL"],
  ["Teléfono", 400, true, "OWN_CAPITAL"],
  ["Suscripciones", 650, true, "OWN_CAPITAL"],
  ["Suministros", 900, true, "OWN_CAPITAL"],
  ["Salud", 1500, false, "ALLOWANCE_FAMILY"],
  ["Educación", 0, false, "ALLOWANCE_FAMILY"],
  ["Viajes", 1500, false, "OWN_CAPITAL"],
  ["Regalos", 500, false, "OWN_CAPITAL"],
  ["Personal", 800, false, "OWN_CAPITAL"],
];
const incomeCats = ["Sueldo", "Freelance", "Apoyo familiar", "Intereses", "Reembolsos"];


async function createCategories() {
  for (const [name, budget, isFixed, fs] of expenseCats) {
    await db.category.create({ data: { name, kind: "EXPENSE", defaultBudget: budget, isFixed, defaultFundSource: fs } });
  }
  for (const name of incomeCats) {
    await db.category.create({
      data: { name, kind: "INCOME", defaultFundSource: name === "Apoyo familiar" ? "ALLOWANCE_FAMILY" : "OWN_CAPITAL" },
    });
  }
}

/**
 * Uso:
 *   npm run db:demo   → borra todo y carga datos de prueba (pide --force)
 *   npm run db:vacio  → borra todo y deja la app lista para tus datos reales
 *   (automático tras `prisma migrate reset`: solo carga si la base está vacía)
 */
const args = process.argv.slice(2);
const MODE = args.includes("--empty") ? "empty" : "demo";
const FORCE = args.includes("--force");

async function main() {
  const existing = (await db.transaction.count()) + (await db.account.count({ where: { isSystem: false } }));
  if (existing > 0 && !FORCE) {
    console.log("La base ya tiene datos: no se cargó nada (para protegerlos).");
    console.log("Si de verdad quieres borrar todo, usa: npm run db:demo  o  npm run db:vacio");
    return;
  }

  // Limpieza (orden por dependencias) para que el seed sea repetible.
  await db.$transaction([
    db.reimbursementPayment.deleteMany(),
    db.transaction.deleteMany(),
    db.budget.deleteMany(),
    db.category.deleteMany(),
    db.savingsGoal.deleteMany(),
    db.monthlySnapshot.deleteMany(),
    db.fund.deleteMany(),
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

  if (MODE === "empty") {
    await db.account.create({ data: { name: "Cuentas por Cobrar", type: "RECEIVABLE", currency: "MXN", isSystem: true } });
    await createCategories();
    console.log("Base vacía y lista. Crea tus cuentas y tarjetas en Ajustes.");
    return;
  }

  // ---------- Cuentas (saldo de apertura al 31 oct 2026) ----------
  const acc = (data: Prisma.AccountCreateInput) => db.account.create({ data });
  const banco = await acc({ name: "Banco Principal", type: "DEBIT", currency: "MXN", currentBalance: 15000 });
  const euros = await acc({ name: "Cuenta en Euros", type: "DEBIT", currency: "EUR", currentBalance: 450 });
  const pagare = await acc({ name: "Pagaré 28 días", type: "INVESTMENT", currency: "MXN", currentBalance: 45000, interestRate: 0.102 });
  const efectivo = await acc({ name: "Efectivo pesos", type: "CASH", currency: "MXN", currentBalance: 1500 });
  const efectivoUSD = await acc({ name: "Efectivo dólares", type: "CASH", currency: "USD", currentBalance: 300 });
  await acc({ name: "Efectivo euros", type: "CASH", currency: "EUR", currentBalance: 120 });
  await acc({ name: "Cuentas por Cobrar", type: "RECEIVABLE", currency: "MXN", currentBalance: 0, isSystem: true });

  // ---------- Tarjetas (cortes distintos) ----------
  const oro = await db.creditCard.create({
    data: { name: "Tarjeta Oro", limit: 45000, cutoffDay: 15, paymentDueDay: 23, interestRate: 0.58, currentBalance: 2400 },
  });
  const digital = await db.creditCard.create({
    data: { name: "Tarjeta Digital", limit: 25000, cutoffDay: 12, paymentDueDay: 2, interestRate: 0.72, currentBalance: 0 },
  });

  // ---------- Personas ----------
  const papa = await db.counterparty.create({ data: { name: "Papá", isFamily: true } });
  const padi = await db.counterparty.create({ data: { name: "Padi" } });

  // ---------- Bolsas: dinero de Papá para fines concretos ----------
  const colegiatura = await createFund(db, { name: "Colegiatura noviembre", counterpartyId: papa.id, expectedAmount: "34268.58", counterpartyName: null, notes: "Pago al Tec" });
  const pension = await createFund(db, { name: "Pensión noviembre", counterpartyId: papa.id, expectedAmount: "4040", counterpartyName: null, notes: null });

  // ---------- Categorías + presupuesto (Previsto vs Real) ----------
  await createCategories();
  for (const c of await db.category.findMany({ where: { kind: "EXPENSE" } })) {
    await db.budget.create({ data: { categoryId: c.id, year: 2026, month: 11, plannedAmount: c.defaultBudget ?? 0 } });
  }

  // ---------- Movimientos (pasan por el mismo servicio que usa la app) ----------
  const txs: TransactionInput[] = [
    { date: "2026-11-01", amount: 9500, description: "Renta noviembre", category: "Renta", type: "EXPENSE", accountId: banco.id, isFixedExpense: true },
    { date: "2026-11-02", amount: 649, description: "Suscripciones (streaming y nube)", category: "Suscripciones", type: "EXPENSE", creditCardId: oro.id, isFixedExpense: true },
    { date: "2026-11-03", amount: 12, description: "App con cobro en euros", category: "Suscripciones", type: "EXPENSE", accountId: euros.id, fxToMXN: String(EUR_MXN), isFixedExpense: true },
    { date: "2026-11-03", amount: 399, description: "Plan de celular", category: "Teléfono", type: "EXPENSE", accountId: banco.id, isFixedExpense: true },
    { date: "2026-11-04", amount: 8000, description: "Pago proyecto web (cliente freelance)", category: "Freelance", type: "INCOME", accountId: banco.id },
    { date: "2026-11-05", amount: 4000, description: "Sueldo fijo", category: "Sueldo", type: "INCOME", accountId: banco.id },
    { date: "2026-11-06", amount: 3000, description: "Mesada noviembre", category: "Apoyo familiar", type: "INCOME", accountId: banco.id, fundSource: "ALLOWANCE_FAMILY", counterpartyId: papa.id },
    { date: "2026-11-06", amount: 5000, description: "Aportación a pagaré", category: "Ahorro", type: "TRANSFER", accountId: banco.id, toAccountId: pagare.id },
    { date: "2026-11-07", amount: 1200, description: "Cena de cumpleaños (con mesada)", category: "Salidas", type: "EXPENSE", accountId: banco.id, fundSource: "ALLOWANCE_FAMILY", counterpartyId: papa.id },
    { date: "2026-11-05", amount: 33300, description: "Papá: depósito colegiatura", category: "Educación", type: "FUND_DEPOSIT", accountId: banco.id, fundId: colegiatura.id },
    { date: "2026-11-08", amount: 4040, description: "Pensión noviembre", category: "Vivienda", type: "FUND_PAYMENT", accountId: banco.id, fundId: pension.id },
    { date: "2026-11-09", amount: 4040, description: "Papá: depósito pensión", category: "Vivienda", type: "FUND_DEPOSIT", accountId: banco.id, fundId: pension.id },
    { date: "2026-11-10", amount: "34268.58", description: "Colegiatura Tec noviembre", category: "Educación", type: "FUND_PAYMENT", creditCardId: oro.id, fundId: colegiatura.id },
    { date: "2026-11-09", amount: 1537, description: "Medicinas de Papá", category: "Salud", type: "REIMBURSABLE_EXPENSE", creditCardId: digital.id, counterpartyId: papa.id, fundSource: "ALLOWANCE_FAMILY" },
    { date: "2026-11-10", amount: 890, description: "Súper", category: "Súper", type: "EXPENSE", creditCardId: oro.id },
    { date: "2026-11-11", amount: 100, toAmount: 1830, description: "Cambié dólares a pesos", category: "Cambio de divisa", type: "TRANSFER", accountId: efectivoUSD.id, toAccountId: efectivo.id, fxToMXN: "18.3" },
    { date: "2026-11-12", amount: 560, description: "Uber al aeropuerto", category: "Transporte", type: "EXPENSE", creditCardId: digital.id },
    { date: "2026-11-13", amount: 350, description: "Tacos con amigas", category: "Salidas", type: "EXPENSE", accountId: efectivo.id },
    { date: "2026-11-14", amount: 2400, description: "Hospedaje fin de semana (compartido con Padi)", category: "Viajes", type: "EXPENSE", creditCardId: digital.id, fundSource: "SHARED_SPLIT", counterpartyId: padi.id, myShareAmount: 1200 },
    { date: "2026-11-15", amount: 750, description: "Boletos de concierto de Padi", category: "Salidas", type: "REIMBURSABLE_EXPENSE", creditCardId: oro.id, counterpartyId: padi.id },
    { date: "2026-11-16", amount: 2400, description: "Pago Tarjeta Oro", category: "Pago de tarjeta", type: "TRANSFER", accountId: banco.id, creditCardId: oro.id },
    { date: "2026-11-17", amount: 640, description: "Mercado del domingo", category: "Súper", type: "EXPENSE", accountId: efectivo.id },
  ];

  const created: Record<string, string> = {};
  for (const t of txs) {
    const row = await createTransaction(db, transactionInput.parse(t));
    created[t.description] = row.id;
  }

  // ---------- Abonos (incluye uno parcial) ----------
  const payments = [
    { date: "2026-11-11", amount: 1537, counterpartyId: papa.id, accountId: banco.id, tx: "Medicinas de Papá" },
    { date: "2026-11-16", amount: 1200, counterpartyId: padi.id, accountId: banco.id, tx: "Hospedaje fin de semana (compartido con Padi)", notes: "Transferencia de Padi" },
  ];
  for (const { tx, ...p } of payments) {
    await recordPayment(db, paymentInput.parse({ ...p, transactionId: created[tx] }));
  }

  // ---------- Metas ----------
  await db.savingsGoal.createMany({
    data: [
      { name: "Fondo de emergencia (6 meses)", targetAmount: 90000, currentAmount: 50000, deadline: d("2027-06-30"), accountId: pagare.id },
      { name: "Viaje 2027", targetAmount: 35000, currentAmount: 8000, deadline: d("2027-07-15") },
    ],
  });

  // El historial mensual (MonthlySnapshot) se genera al cerrar cada mes.
  // Arrancamos en noviembre 2026; los meses anteriores se importarán aparte.

  // Resumen en consola
  const accounts = await db.account.findMany({ orderBy: { name: "asc" } });
  const cards = await db.creditCard.findMany();
  console.log("\nSaldos tras el seed:");
  for (const a of accounts) console.log(`  ${a.name.padEnd(22)} ${a.currency} ${a.currentBalance.toFixed(2)}`);
  for (const c of cards) console.log(`  ${c.name.padEnd(22)} deuda ${c.currentBalance.toFixed(2)}`);
  const rates = Object.fromEntries((await db.exchangeRate.findMany()).map((r) => [r.currency, r.rateToMXN])) as Parameters<typeof computeNetWorth>[2];
  const nw = computeNetWorth(accounts, cards, rates, await db.fund.findMany());
  const f = (x: Prisma.Decimal) => x.toNumber().toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  console.log(`\nPatrimonio: ${f(nw.netWorth)}  (activos ${f(nw.totalAssets)} − deudas ${f(nw.totalLiabilities)})`);
  console.log(`Efectivo total: ${f(nw.cashMXN)} · Liquidez: ${f(nw.liquidity)} · Por cobrar: ${f(nw.receivables)}`);
  for (const b of nw.byCurrency) console.log(`  ${b.currency}: efectivo ${b.cash.toFixed(2)} · banco ${b.bank.toFixed(2)} · inversión ${b.investments.toFixed(2)} → ${f(b.totalMXN)}`);
  console.log(`Dinero de terceros en tus cuentas: ${f(nw.thirdPartyHeld)} · Te deben por bolsas: ${f(nw.fundsOwedToMe)}`);
  console.log(`  Movimientos: ${await db.transaction.count()} · Abonos: ${await db.reimbursementPayment.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
