/**
 * Motor de tarjetas de crédito (funciones puras, sin base de datos).
 *
 * Ciclo: el estado de cuenta cierra el día de corte y vence el siguiente día
 * límite de pago.
 *  - Cargos del periodo: lo cargado entre el corte anterior (exclusivo) y el
 *    último corte (inclusivo).
 *  - Saldo al corte: la deuda que había al cerrar (incluye saldo anterior sin
 *    pagar o la deuda con la que se dio de alta la tarjeta).
 *  - Pago para no generar intereses: saldo al corte − pagos desde el corte.
 * Si el día no existe en el mes (ej. 31 en febrero), se usa el último día.
 */

export type CardMovement = {
  date: Date;
  amount: number;
  /** "charge" = cargo (sube la deuda); "payment" = pago o abono a la tarjeta. */
  kind: "charge" | "payment";
};

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

/** Fecha con día "acotado": día 31 en un mes de 30 → día 30. */
export function clampedDate(year: number, month0: number, day: number) {
  const y = year + Math.floor(month0 / 12);
  const m = ((month0 % 12) + 12) % 12;
  return new Date(y, m, Math.min(day, daysInMonth(y, m)));
}

export function daysBetween(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}

/** Último corte ocurrido en o antes de `today`, y el anterior a ese. */
export function lastCutoffs(cutoffDay: number, today: Date) {
  const t = startOfDay(today);
  let last = clampedDate(t.getFullYear(), t.getMonth(), cutoffDay);
  if (last > t) last = clampedDate(t.getFullYear(), t.getMonth() - 1, cutoffDay);
  const prev = clampedDate(last.getFullYear(), last.getMonth() - 1, cutoffDay);
  const next = clampedDate(last.getFullYear(), last.getMonth() + 1, cutoffDay);
  return { last, prev, next };
}

/** Primer día límite de pago estrictamente posterior a un corte. */
export function dueDateAfter(cutoff: Date, paymentDueDay: number) {
  const same = clampedDate(cutoff.getFullYear(), cutoff.getMonth(), paymentDueDay);
  return same > cutoff ? same : clampedDate(cutoff.getFullYear(), cutoff.getMonth() + 1, paymentDueDay);
}

export type CardCycle = {
  /** Periodo del estado de cuenta ya cerrado. */
  statementStart: Date; // exclusivo (corte anterior)
  statementEnd: Date; // inclusivo (último corte)
  dueDate: Date;
  daysUntilDue: number;
  /** Cargos del periodo cerrado. */
  periodCharges: number;
  /** Saldo anterior que seguía al corte (deuda inicial o no pagada). */
  previousBalance: number;
  /** Deuda al cierre: lo que hay que pagar para no generar intereses. */
  noInterestPayment: number;
  /** Pagos hechos a la tarjeta después del último corte. */
  paidSinceCutoff: number;
  /** Lo que falta para no generar intereses (≥ 0). */
  remainingNoInterest: number;
  /** Cargos después del corte: van al siguiente estado de cuenta. */
  currentPeriodCharges: number;
  nextCutoff: Date;
  status: "PAID" | "DUE_SOON" | "PENDING" | "OVERDUE" | "NOTHING_DUE";
};

export const DUE_SOON_DAYS = 5;

export function cardCycle(
  card: { cutoffDay: number; paymentDueDay: number },
  movements: CardMovement[],
  today: Date = new Date(),
  /** Deuda actual. Si se da, el saldo al corte incluye deuda anterior. */
  currentDebt?: number,
): CardCycle {
  const { last, prev, next } = lastCutoffs(card.cutoffDay, today);
  const dueDate = dueDateAfter(last, card.paymentDueDay);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  let statement = 0, paid = 0, current = 0;
  for (const m of movements) {
    const d = m.date;
    if (m.kind === "charge") {
      if (d > endOfDay(prev) && d <= endOfDay(last)) statement += m.amount;
      else if (d > endOfDay(last)) current += m.amount;
    } else if (d > endOfDay(last)) {
      paid += m.amount;
    }
  }
  const round = (v: number) => Math.round(v * 100) / 100;
  // Deuda al corte = deuda de hoy − cargos posteriores + pagos posteriores.
  const atCutoff = currentDebt != null ? Math.max(0, currentDebt - current + paid) : statement;
  const remaining = round(Math.max(0, atCutoff - paid));
  const daysUntilDue = daysBetween(today, dueDate);

  let status: CardCycle["status"];
  if (atCutoff <= 0.005) status = "NOTHING_DUE";
  else if (remaining <= 0.005) status = "PAID";
  else if (daysUntilDue < 0) status = "OVERDUE";
  else if (daysUntilDue <= DUE_SOON_DAYS) status = "DUE_SOON";
  else status = "PENDING";

  return {
    statementStart: prev,
    statementEnd: last,
    dueDate,
    daysUntilDue,
    periodCharges: round(statement),
    previousBalance: round(Math.max(0, atCutoff - statement)),
    noInterestPayment: round(atCutoff),
    paidSinceCutoff: round(paid),
    remainingNoInterest: remaining,
    currentPeriodCharges: round(current),
    nextCutoff: next,
    status,
  };
}

/**
 * Simulador de intereses (estimación).
 * Bancos en México: interés ordinario sobre saldo no pagado, tasa anual / 360
 * por día, más IVA del 16 % sobre el interés. Se asume un mes de 30 días y
 * sin compras nuevas.
 */
export const IVA = 0.16;

export function simulateInterest(params: { balance: number; payment: number; annualRate: number; days?: number }) {
  const { balance, payment, annualRate } = params;
  const days = params.days ?? 30;
  const unpaid = Math.max(0, balance - payment);
  const interest = unpaid * (annualRate / 360) * days;
  const iva = interest * IVA;
  return {
    unpaid,
    interest: Math.round(interest * 100) / 100,
    iva: Math.round(iva * 100) / 100,
    totalCost: Math.round((interest + iva) * 100) / 100,
    nextBalance: Math.round((unpaid + interest + iva) * 100) / 100,
  };
}

/**
 * Si pagas la misma cantidad cada mes, ¿cuántos meses tardas y cuánto pagas
 * de intereses? `null` si el pago no alcanza a cubrir los intereses.
 */
export function payoffPlan(params: { balance: number; monthlyPayment: number; annualRate: number; maxMonths?: number }) {
  const { monthlyPayment, annualRate } = params;
  const monthly = (annualRate / 360) * 30 * (1 + IVA);
  let balance = params.balance;
  let totalInterest = 0;
  let months = 0;
  const max = params.maxMonths ?? 600;
  if (monthlyPayment <= 0) return null;
  while (balance > 0.005 && months < max) {
    const cost = balance * monthly;
    if (monthlyPayment <= cost) return null; // nunca terminas
    totalInterest += cost;
    balance = balance + cost - monthlyPayment;
    months++;
  }
  return months >= max ? null : { months, totalInterest: Math.round(totalInterest * 100) / 100 };
}
