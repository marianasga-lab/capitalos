import "server-only";
/**
 * Lecturas para las pantallas. Devuelven números simples (no Decimal) para
 * poder pasarlos a componentes cliente.
 */
import { db } from "@/lib/db";
import { computeNetWorth } from "@/lib/finance/networth";
import { getRates } from "./services/common";
import { monthStats } from "./services/reports";
import { counterpartyBalances } from "./services/reimbursements";
import { fundSummaries } from "./services/funds";
import { listTransactions } from "./services/transactions";

const num = (d: { toNumber(): number } | null | undefined) => (d ? d.toNumber() : 0);

export function currentPeriod(now = new Date()) {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}
const prevPeriod = (y: number, m: number) => (m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 });

async function netWorthNow() {
  const [accounts, cards, rates, funds] = await Promise.all([
    db.account.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] }),
    db.creditCard.findMany({ where: { archived: false }, orderBy: { name: "asc" } }),
    getRates(db),
    db.fund.findMany(),
  ]);
  return { nw: computeNetWorth(accounts, cards, rates, funds), accounts, cards, rates };
}

function plainStats(s: Awaited<ReturnType<typeof monthStats>>) {
  return {
    income: num(s.income), incomeOwn: num(s.incomeOwn), incomeFamily: num(s.incomeFamily),
    expenses: num(s.expenses), expensesOwn: num(s.expensesOwn), expensesFamily: num(s.expensesFamily),
    fixedExpenses: num(s.fixedExpenses), reimbursable: num(s.reimbursable),
    fundsIn: num(s.fundsIn), fundsOut: num(s.fundsOut),
    savings: num(s.savings), savingsRate: num(s.savingsRate),
    hasData: !s.income.isZero() || !s.expenses.isZero(),
  };
}

export async function getDashboard() {
  const { year, month } = currentPeriod();
  const prev = prevPeriod(year, month);
  const [{ nw }, cur, last, snapshots, people, funds, recent] = await Promise.all([
    netWorthNow(),
    monthStats(db, year, month),
    monthStats(db, prev.year, prev.month),
    db.monthlySnapshot.findMany({ orderBy: [{ year: "asc" }, { month: "asc" }], take: 24 }),
    counterpartyBalances(db),
    fundSummaries(db, { status: "OPEN" }),
    listTransactions(db, { take: 8 }),
  ]);

  // ----- Runway -----
  // Liquidez neta propia: efectivo + débito − dinero de terceros − deuda de tarjetas.
  const cardDebt = nw.totalLiabilities.minus(nw.thirdPartyHeld); // ya en MXN
  const netLiquidity = nw.ownLiquidity.minus(cardDebt);
  // Gasto fijo mensual: promedio de los últimos 3 meses con datos (incluye el actual).
  const fixedHistory = [num(cur.fixedExpenses)];
  if (!last.fixedExpenses.isZero()) fixedHistory.push(num(last.fixedExpenses));
  const p2 = prevPeriod(prev.year, prev.month);
  const before = await monthStats(db, p2.year, p2.month);
  if (!before.fixedExpenses.isZero()) fixedHistory.push(num(before.fixedExpenses));
  const monthlyFixed = fixedHistory.reduce((a, b) => a + b, 0) / fixedHistory.length;

  // ----- Evolución: meses cerrados + el mes en curso (en vivo) -----
  const evolution = snapshots
    .filter((s) => !(s.year === year && s.month === month))
    .map((s) => ({ year: s.year, month: s.month, netWorth: num(s.netWorth), savingsRate: num(s.savingsRate), expenses: num(s.totalExpenses), live: false }));
  evolution.push({ year, month, netWorth: num(nw.netWorth), savingsRate: num(cur.savingsRate), expenses: num(cur.expenses), live: true });

  return {
    period: { year, month },
    kpis: {
      netWorth: num(nw.netWorth),
      totalAssets: num(nw.totalAssets),
      totalLiabilities: num(nw.totalLiabilities),
      liquidity: num(nw.liquidity),
      ownLiquidity: num(nw.ownLiquidity),
      thirdPartyHeld: num(nw.thirdPartyHeld),
      investments: num(nw.investments),
      investmentMonthlyYield: num(nw.investmentMonthlyYield),
      receivables: num(nw.receivables),
      cardDebt: num(cardDebt),
    },
    month: plainStats(cur),
    previousMonth: plainStats(last),
    runway: {
      netLiquidity: num(netLiquidity),
      monthlyFixed,
      months: monthlyFixed > 0 ? Math.max(0, num(netLiquidity) / monthlyFixed) : null,
      basedOnMonths: fixedHistory.length,
    },
    evolution,
    receivables: people
      .filter((p) => p.owedMXN.gt(0))
      .map((p) => ({
        id: p.person.id,
        name: p.person.name,
        owed: num(p.owedMXN),
        items: p.pending.map((x) => ({
          id: x.transaction.id,
          description: x.transaction.description,
          date: x.transaction.date.toISOString(),
          remaining: num(x.remainingMXN),
          partial: !x.transaction.amountReimbursed.isZero(),
        })),
      })),
    funds: funds.map(plainFund),
    recent: recent.rows.map(plainTx),
  };
}

export function plainFund(f: Awaited<ReturnType<typeof fundSummaries>>[number]) {
  return {
    id: f.fund.id,
    name: f.fund.name,
    owner: f.owner,
    status: f.fund.status,
    expected: f.fund.expectedAmount ? num(f.fund.expectedAmount) : null,
    deposited: num(f.deposited),
    paid: num(f.paid),
    balance: num(f.balance),
    state: f.state,
    missingDeposit: f.missingDeposit ? num(f.missingDeposit) : null,
    message: f.message,
  };
}

export function plainTx(t: Awaited<ReturnType<typeof listTransactions>>["rows"][number]) {
  return {
    id: t.id,
    date: t.date.toISOString(),
    type: t.type,
    amount: num(t.amount),
    currency: t.currency,
    amountMXN: num(t.amount.mul(t.fxToMXN)),
    myShare: t.myShareAmount ? num(t.myShareAmount) : null,
    toAmount: t.toAmount ? num(t.toAmount) : null,
    description: t.description,
    category: t.category,
    fundSource: t.fundSource,
    isFixedExpense: t.isFixedExpense,
    status: t.reimbursementStatus,
    accountId: t.accountId,
    toAccountId: t.toAccountId,
    creditCardId: t.creditCardId,
    counterpartyId: t.counterpartyId,
    fundId: t.fundId,
    fxToMXN: num(t.fxToMXN),
    notes: t.notes,
    source: t.creditCard?.name ?? t.account?.name ?? null,
    destination: t.toAccount?.name ?? null,
    person: t.counterparty?.name ?? null,
  };
}
export type PlainTx = ReturnType<typeof plainTx>;
export type PlainFund = ReturnType<typeof plainFund>;
export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

/** Patrimonio con desglose por moneda y lista de cuentas. */
export async function getNetWorthDetail() {
  const { nw, accounts, cards, rates } = await netWorthNow();
  const funds = await fundSummaries(db, { status: "OPEN" });
  return {
    netWorth: num(nw.netWorth),
    totalAssets: num(nw.totalAssets),
    totalLiabilities: num(nw.totalLiabilities),
    cashMXN: num(nw.cashMXN),
    liquidity: num(nw.liquidity),
    investments: num(nw.investments),
    receivables: num(nw.receivables),
    thirdPartyHeld: num(nw.thirdPartyHeld),
    fundsOwedToMe: num(nw.fundsOwedToMe),
    rates: { USD: num(rates.USD), EUR: num(rates.EUR) },
    byCurrency: nw.byCurrency.map((b) => ({
      currency: b.currency,
      cash: num(b.cash), bank: num(b.bank), investments: num(b.investments),
      total: num(b.total), totalMXN: num(b.totalMXN), rate: num(b.rate),
    })),
    accounts: accounts
      .filter((a) => !a.archived)
      .map((a) => ({
        id: a.id, name: a.name, type: a.type, currency: a.currency, isSystem: a.isSystem,
        balance: num(a.currentBalance),
        balanceMXN: num(a.currentBalance.mul(rates[a.currency])),
        interestRate: a.interestRate ? num(a.interestRate) : null,
      })),
    cards: cards.map((c) => ({ id: c.id, name: c.name, debt: num(c.currentBalance), limit: num(c.limit) })),
    funds: funds.map(plainFund),
  };
}

/** Opciones para el registro rápido. */
export async function getEntryOptions() {
  const [accounts, cards, categories, people, funds, rates] = await Promise.all([
    db.account.findMany({ where: { archived: false, isSystem: false }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    db.creditCard.findMany({ where: { archived: false }, orderBy: { name: "asc" } }),
    db.category.findMany({ where: { archived: false }, orderBy: { name: "asc" } }),
    db.counterparty.findMany({ orderBy: { name: "asc" } }),
    db.fund.findMany({ where: { status: "OPEN" }, include: { counterparty: true }, orderBy: { createdAt: "desc" } }),
    getRates(db),
  ]);
  return {
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, currency: a.currency })),
    cards: cards.map((c) => ({ id: c.id, name: c.name, currency: c.currency })),
    categories: categories.map((c) => ({ name: c.name, kind: c.kind, isFixed: c.isFixed, defaultFundSource: c.defaultFundSource })),
    people: people.map((p) => ({ id: p.id, name: p.name, isFamily: p.isFamily })),
    funds: funds.map((f) => ({ id: f.id, name: f.name, owner: f.counterparty.name })),
    rates: { MXN: 1, USD: num(rates.USD), EUR: num(rates.EUR) },
  };
}
export type EntryOptions = Awaited<ReturnType<typeof getEntryOptions>>;

export async function getTransactionsPage(params: { year: number; month: number; type?: string; q?: string }) {
  const from = `${params.year}-${String(params.month).padStart(2, "0")}-01`;
  const lastDay = new Date(params.year, params.month, 0).getDate();
  const to = `${params.year}-${String(params.month).padStart(2, "0")}-${lastDay}`;
  const type = ["INCOME", "EXPENSE", "TRANSFER", "REIMBURSABLE_EXPENSE", "FUND_DEPOSIT", "FUND_PAYMENT"].includes(params.type ?? "")
    ? (params.type as "INCOME")
    : undefined;
  const { rows, total } = await listTransactions(db, { from, to, type, search: params.q || undefined, take: 500 });
  return { rows: rows.map(plainTx), total };
}

export async function getFundsPage() {
  const [all, people] = await Promise.all([fundSummaries(db), db.counterparty.findMany({ orderBy: { name: "asc" } })]);
  return { funds: all.map(plainFund), people: people.map((p) => ({ id: p.id, name: p.name })) };
}
