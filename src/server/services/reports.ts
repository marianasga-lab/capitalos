/**
 * Números del mes y cierre mensual (MonthlySnapshot).
 *
 * Qué cuenta como gasto:
 *  - EXPENSE: todo, salvo la parte de otros en un gasto compartido.
 *  - REIMBURSABLE_EXPENSE: no es gasto tuyo (te lo van a pagar); se reporta aparte.
 *  - TRANSFER y ajustes de conciliación: no son ingreso ni gasto.
 *  - FUND_DEPOSIT / FUND_PAYMENT: dinero de terceros; se reporta aparte.
 *    Solo el cierre de una bolsa con diferencia cuenta (sobrante = ingreso
 *    familiar; lo que absorbí = gasto propio).
 */
import { Prisma } from "@prisma/client";
import { computeNetWorth } from "@/lib/finance/networth";
import { ADJUSTMENT_CATEGORY, getRates, monthRange, ZERO, type Db } from "./common";

type D = Prisma.Decimal;

export async function monthStats(db: Db, year: number, month: number) {
  const txs = await db.transaction.findMany({
    where: { date: monthRange(year, month), NOT: { category: ADJUSTMENT_CATEGORY } },
  });

  let income = ZERO, incomeOwn = ZERO, incomeFamily = ZERO;
  let fundsIn = ZERO, fundsOut = ZERO;
  let expenses = ZERO, expensesOwn = ZERO, expensesFamily = ZERO, fixedExpenses = ZERO, reimbursable = ZERO;
  const byCategory = new Map<string, D>();

  for (const t of txs) {
    const mxn = (v: D) => v.mul(t.fxToMXN);
    if (t.type === "INCOME") {
      const v = mxn(t.amount);
      income = income.plus(v);
      if (t.fundSource === "ALLOWANCE_FAMILY") incomeFamily = incomeFamily.plus(v);
      else incomeOwn = incomeOwn.plus(v);
    } else if (t.type === "EXPENSE") {
      const v = mxn(t.myShareAmount ?? t.amount);
      expenses = expenses.plus(v);
      if (t.fundSource === "ALLOWANCE_FAMILY") expensesFamily = expensesFamily.plus(v);
      else expensesOwn = expensesOwn.plus(v); // capital propio y mi parte de lo compartido
      if (t.isFixedExpense) fixedExpenses = fixedExpenses.plus(v);
      byCategory.set(t.category, (byCategory.get(t.category) ?? ZERO).plus(v));
    } else if (t.type === "REIMBURSABLE_EXPENSE") {
      reimbursable = reimbursable.plus(mxn(t.amount));
    } else if (t.type === "FUND_DEPOSIT") {
      fundsIn = fundsIn.plus(mxn(t.amount));
    } else if (t.type === "FUND_PAYMENT") {
      fundsOut = fundsOut.plus(mxn(t.amount));
    }
  }

  const budgets = await db.budget.findMany({ where: { year, month }, include: { category: true } });
  const budgetRows = budgets.map((b) => {
    const actual = byCategory.get(b.category.name) ?? ZERO;
    return { category: b.category.name, planned: b.plannedAmount, actual, diff: b.plannedAmount.minus(actual) };
  });
  // Categorías con gasto pero sin presupuesto, para que no se pierdan.
  for (const [category, actual] of byCategory) {
    if (!budgetRows.some((r) => r.category === category)) budgetRows.push({ category, planned: ZERO, actual, diff: actual.neg() });
  }

  const savings = income.minus(expenses);
  return {
    year, month,
    income, incomeOwn, incomeFamily,
    expenses, expensesOwn, expensesFamily, fixedExpenses,
    reimbursable,
    /** Dinero de terceros recibido y pagado en el mes (no cuenta en ingresos/gastos). */
    fundsIn, fundsOut,
    savings,
    savingsRate: income.gt(0) ? savings.div(income) : ZERO,
    budget: budgetRows.sort((a, b) => b.actual.comparedTo(a.actual)),
  };
}

/** Patrimonio actual con los saldos guardados. */
export async function currentNetWorth(db: Db) {
  const [accounts, cards, rates, funds] = await Promise.all([
    db.account.findMany(), db.creditCard.findMany(), getRates(db), db.fund.findMany(),
  ]);
  return computeNetWorth(accounts, cards, rates, funds);
}

/**
 * Cierre de mes: guarda la foto de patrimonio y ahorro.
 * El patrimonio es el de HOY, así que córrelo el último día del mes o el
 * primero del siguiente antes de registrar movimientos nuevos.
 */
export async function closeMonth(db: Db, year: number, month: number) {
  const [stats, nw] = await Promise.all([monthStats(db, year, month), currentNetWorth(db)]);
  const data = {
    totalAssets: nw.totalAssets,
    totalLiabilities: nw.totalLiabilities,
    netWorth: nw.netWorth,
    savingsRate: stats.savingsRate,
    totalIncome: stats.income,
    totalExpenses: stats.expenses,
  };
  return db.monthlySnapshot.upsert({
    where: { year_month: { year, month } },
    create: { year, month, ...data },
    update: data,
  });
}
