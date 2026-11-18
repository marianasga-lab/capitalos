import "server-only";
/**
 * Lecturas para las pantallas. Devuelven números simples (no Decimal) para
 * poder pasarlos a componentes cliente.
 */
import { db } from "@/lib/db";
import { requirePageSession } from "./auth";
import { computeNetWorth } from "@/lib/finance/networth";
import { cardCycle, type CardMovement } from "@/lib/finance/cards";
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
  await requirePageSession();
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
  const cardAlerts = (await getCardsOverview())
    .filter((c) => c.cycle.status === "DUE_SOON" || c.cycle.status === "OVERDUE")
    .map((c) => ({ id: c.id, name: c.name, amount: c.cycle.remainingNoInterest, dueDate: c.cycle.dueDate, daysUntilDue: c.cycle.daysUntilDue, overdue: c.cycle.status === "OVERDUE" }));

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
    cardAlerts,
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
  await requirePageSession();
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
  await requirePageSession();
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
  await requirePageSession();
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
  await requirePageSession();
  const [all, people] = await Promise.all([fundSummaries(db), db.counterparty.findMany({ orderBy: { name: "asc" } })]);
  return { funds: all.map(plainFund), people: people.map((p) => ({ id: p.id, name: p.name })) };
}

// ---------- Tarjetas ----------

export async function getCardsOverview(today = new Date()) {
  await requirePageSession();
  const cards = await db.creditCard.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
    include: { transactions: { select: { date: true, amount: true, type: true } } },
  });
  return cards.map((c) => {
    const moves: CardMovement[] = c.transactions.map((t) => ({
      date: t.date,
      amount: num(t.amount),
      kind: t.type === "TRANSFER" ? "payment" : "charge",
    }));
    const cycle = cardCycle(c, moves, today, num(c.currentBalance));
    return {
      id: c.id,
      name: c.name,
      currency: c.currency,
      limit: num(c.limit),
      debt: num(c.currentBalance),
      available: num(c.limit.minus(c.currentBalance)),
      annualRate: num(c.interestRate),
      cutoffDay: c.cutoffDay,
      paymentDueDay: c.paymentDueDay,
      cycle: {
        ...cycle,
        statementStart: cycle.statementStart.toISOString(),
        statementEnd: cycle.statementEnd.toISOString(),
        dueDate: cycle.dueDate.toISOString(),
        nextCutoff: cycle.nextCutoff.toISOString(),
      },
    };
  });
}
export type CardOverview = Awaited<ReturnType<typeof getCardsOverview>>[number];

// ---------- Metas ----------
export async function getGoalsPage(today = new Date()) {
  await requirePageSession();
  const [goals, snapshots] = await Promise.all([
    db.savingsGoal.findMany({ orderBy: [{ deadline: "asc" }, { createdAt: "asc" }], include: { account: true } }),
    db.monthlySnapshot.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }], take: 3 }),
  ]);
  // Ritmo de ahorro: promedio de los últimos 3 meses cerrados; si no hay, el mes en curso.
  let pace: number;
  let paceSource: string;
  if (snapshots.length) {
    pace = snapshots.reduce((s, x) => s + num(x.totalIncome) - num(x.totalExpenses), 0) / snapshots.length;
    paceSource = `promedio de ${snapshots.length} ${snapshots.length === 1 ? "mes cerrado" : "meses cerrados"}`;
  } else {
    const { year, month } = currentPeriod(today);
    const s = await monthStats(db, year, month);
    pace = num(s.savings);
    paceSource = "lo ahorrado este mes (aún no hay meses cerrados)";
  }
  const monthsUntil = (d: Date) => Math.max(0, (d.getFullYear() - today.getFullYear()) * 12 + d.getMonth() - today.getMonth() + (d.getDate() >= today.getDate() ? 0 : -1));

  return {
    pace,
    paceSource,
    goals: goals.map((g) => {
      const target = num(g.targetAmount);
      const current = num(g.currentAmount);
      const remaining = Math.max(0, target - current);
      const monthsLeft = g.deadline ? monthsUntil(g.deadline) : null;
      const neededPerMonth = monthsLeft != null ? (monthsLeft > 0 ? remaining / monthsLeft : remaining) : null;
      const projectedMonths = remaining === 0 ? 0 : pace > 0 ? Math.ceil(remaining / pace) : null;
      const projectedDate = projectedMonths != null ? new Date(today.getFullYear(), today.getMonth() + projectedMonths, 1).toISOString() : null;
      return {
        id: g.id,
        name: g.name,
        target,
        current,
        remaining,
        progress: target > 0 ? Math.min(1, current / target) : 0,
        deadline: g.deadline?.toISOString() ?? null,
        monthsLeft,
        neededPerMonth,
        projectedMonths,
        projectedDate,
        // Sin fecha no hay "a tiempo"; con ahorro ≤ 0 y fecha, va atrasada.
        onTrack: remaining === 0 ? true : monthsLeft == null ? null : projectedMonths == null ? false : projectedMonths <= monthsLeft,
        account: g.account ? { id: g.account.id, name: g.account.name, balance: num(g.account.currentBalance), currency: g.account.currency } : null,
      };
    }),
    accounts: (await db.account.findMany({ where: { archived: false, isSystem: false }, orderBy: { name: "asc" } })).map((a) => ({ id: a.id, name: a.name })),
  };
}
export type GoalsPage = Awaited<ReturnType<typeof getGoalsPage>>;

// ---------- Ajustes ----------
export async function getSettings() {
  await requirePageSession();
  const [accounts, cards, rates, snapshots] = await Promise.all([
    db.account.findMany({ where: { isSystem: false }, orderBy: [{ archived: "asc" }, { type: "asc" }, { name: "asc" }] }),
    db.creditCard.findMany({ orderBy: [{ archived: "asc" }, { name: "asc" }] }),
    db.exchangeRate.findMany(),
    db.monthlySnapshot.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }], take: 24 }),
  ]);
  return {
    accounts: accounts.map((a) => ({
      id: a.id, name: a.name, type: a.type, currency: a.currency, archived: a.archived,
      balance: num(a.currentBalance), interestRate: a.interestRate ? num(a.interestRate) : null,
    })),
    cards: cards.map((c) => ({
      id: c.id, name: c.name, currency: c.currency, archived: c.archived, limit: num(c.limit), debt: num(c.currentBalance),
      cutoffDay: c.cutoffDay, paymentDueDay: c.paymentDueDay, interestRate: num(c.interestRate),
    })),
    rates: Object.fromEntries(rates.filter((r) => r.currency !== "MXN").map((r) => [r.currency, { rate: num(r.rateToMXN), updatedAt: r.updatedAt.toISOString() }])) as Record<"USD" | "EUR", { rate: number; updatedAt: string } | undefined>,
    snapshots: snapshots.map((s) => ({ year: s.year, month: s.month, netWorth: num(s.netWorth), savingsRate: num(s.savingsRate), createdAt: s.createdAt.toISOString() })),
    period: currentPeriod(),
  };
}
export type Settings = Awaited<ReturnType<typeof getSettings>>;
