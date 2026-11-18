/**
 * Abonos de personas que me deben (reembolsos y gastos compartidos).
 *  - recordPayment: abono total o parcial. Sin gasto específico, se reparte
 *    del más antiguo al más nuevo (como en "Papi Debe").
 *  - collectTransaction: el botón "Cobrado": liquida lo que falta de un gasto.
 *  - deletePayment: revierte un abono capturado por error.
 */
import { Prisma, PrismaClient, type Transaction } from "@prisma/client";
import { applyDeltas, owedMXN, paymentDeltas } from "@/lib/finance/ledger";
import { dec, DomainError, EPS, getRate, getReceivableAccount, parseDate, todayISO, ZERO, type Db } from "./common";
import { statusFor } from "./transactions";

type PaymentData = {
  counterpartyId: string;
  amount: string;
  accountId: string;
  date: string;
  transactionId?: string | null;
  notes?: string | null;
};

type Owing = Pick<Transaction, "type" | "amount" | "fxToMXN" | "myShareAmount" | "amountReimbursed">;
const remainingOf = (t: Owing) => owedMXN(t).minus(t.amountReimbursed);

async function pendingFor(db: Db, counterpartyId: string) {
  const rows = await db.transaction.findMany({
    where: { counterpartyId, reimbursementStatus: "PENDING" },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((t) => ({ tx: t, remaining: remainingOf(t) })).filter((r) => r.remaining.gt(EPS));
}

const fmt = (d: Prisma.Decimal) => d.toNumber().toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export async function recordPayment(db: PrismaClient, input: PaymentData) {
  return db.$transaction(async (tx) => {
    const account = await tx.account.findUnique({ where: { id: input.accountId } });
    if (!account || account.isSystem) throw new DomainError("Elige la cuenta donde recibiste el dinero.");
    if (account.archived) throw new DomainError("La cuenta está archivada.");
    const person = await tx.counterparty.findUnique({ where: { id: input.counterpartyId } });
    if (!person) throw new DomainError("La persona no existe.");

    const fx = await getRate(tx, account.currency);
    const amount = dec(input.amount);
    const amountMXN = amount.mul(fx);

    // ¿A qué gastos se aplica?
    let targets = await pendingFor(tx, person.id);
    if (input.transactionId) {
      targets = targets.filter((t) => t.tx.id === input.transactionId);
      if (!targets.length) throw new DomainError("Ese gasto no tiene saldo pendiente con esta persona.");
    }
    const totalPending = targets.reduce((s, t) => s.plus(t.remaining), ZERO);
    if (amountMXN.gt(totalPending.plus(EPS))) {
      throw new DomainError(`El abono (${fmt(amountMXN)}) es mayor a lo que te debe ${person.name}: ${fmt(totalPending)}.`);
    }

    // Reparte (FIFO). Cada fila guarda su parte en la moneda de la cuenta.
    const receivable = await getReceivableAccount(tx);
    const created = [];
    let leftMXN = amountMXN;
    let leftAmount = amount;
    for (let i = 0; i < targets.length && leftMXN.gt(EPS); i++) {
      const { tx: t, remaining } = targets[i];
      const isLast = remaining.gte(leftMXN.minus(EPS)) || i === targets.length - 1;
      const partMXN = isLast ? leftMXN : remaining;
      const part = isLast ? leftAmount : partMXN.div(fx).toDecimalPlaces(2);

      created.push(
        await tx.reimbursementPayment.create({
          data: {
            date: parseDate(input.date),
            amount: part,
            fxToMXN: fx,
            counterpartyId: person.id,
            accountId: account.id,
            transactionId: t.id,
            notes: input.notes ?? null,
          },
        }),
      );
      const appliedMXN = part.mul(fx);
      const reimbursed = t.amountReimbursed.plus(appliedMXN);
      const status = statusFor(remaining.plus(t.amountReimbursed), reimbursed);
      await tx.transaction.update({
        where: { id: t.id },
        data: {
          amountReimbursed: reimbursed,
          reimbursementStatus: status,
          ...(status === "PAID" && { reimbursedAt: parseDate(input.date), reimbursedToId: account.id }),
        },
      });
      await applyDeltas(tx, paymentDeltas(part, account.id, receivable.id, fx));
      leftMXN = leftMXN.minus(appliedMXN);
      leftAmount = leftAmount.minus(part);
    }
    return created;
  });
}

/** Botón "Cobrado": registra un abono por todo lo que falta de un gasto. */
export async function collectTransaction(
  db: PrismaClient,
  input: { transactionId: string; accountId?: string | null; date?: string },
) {
  const t = await db.transaction.findUnique({ where: { id: input.transactionId }, include: { account: true } });
  if (!t || !t.counterpartyId) throw new DomainError("Ese movimiento no tiene a nadie que te deba.");
  const remaining = remainingOf(t);
  if (remaining.lte(EPS)) throw new DomainError("Este gasto ya está cobrado.");

  // Destino por defecto: la cuenta de débito con la que pagaste; si pagaste
  // con tarjeta o efectivo, tu primera cuenta de débito en pesos.
  let accountId = input.accountId ?? (t.account?.type === "DEBIT" && !t.account.archived ? t.account.id : null);
  if (!accountId) {
    const debit = await db.account.findFirst({
      where: { type: "DEBIT", currency: "MXN", archived: false },
      orderBy: { createdAt: "asc" },
    });
    if (!debit) throw new DomainError("Elige la cuenta donde recibiste el dinero.");
    accountId = debit.id;
  }
  const account = await db.account.findUniqueOrThrow({ where: { id: accountId } });
  const fx = await getRate(db, account.currency);
  const amount = remaining.div(fx).toDecimalPlaces(2);

  return recordPayment(db, {
    counterpartyId: t.counterpartyId,
    amount: amount.toString(),
    accountId,
    date: input.date ?? todayISO(),
    transactionId: t.id,
  });
}

export async function deletePayment(db: PrismaClient, id: string) {
  return db.$transaction(async (tx) => {
    const p = await tx.reimbursementPayment.findUnique({ where: { id } });
    if (!p) throw new DomainError("El abono no existe.");
    const receivable = await getReceivableAccount(tx);
    // Revierte con el tipo de cambio guardado ese día.
    await applyDeltas(
      tx,
      paymentDeltas(p.amount, p.accountId, receivable.id, p.fxToMXN).map((d) => ({ ...d, amount: d.amount.neg() })),
    );
    if (p.transactionId) {
      const t = await tx.transaction.findUniqueOrThrow({ where: { id: p.transactionId } });
      const reimbursed = Prisma.Decimal.max(ZERO, t.amountReimbursed.minus(p.amount.mul(p.fxToMXN)));
      const status = statusFor(owedMXN(t), reimbursed);
      await tx.transaction.update({
        where: { id: t.id },
        data: {
          amountReimbursed: reimbursed,
          reimbursementStatus: status,
          ...(status !== "PAID" && { reimbursedAt: null, reimbursedToId: null }),
        },
      });
    }
    await tx.reimbursementPayment.delete({ where: { id } });
    return p;
  });
}

/** Cuánto me debe cada persona (MXN), con sus gastos pendientes. */
export async function counterpartyBalances(db: Db) {
  const people = await db.counterparty.findMany({ orderBy: { name: "asc" } });
  return Promise.all(
    people.map(async (person) => {
      const pending = await pendingFor(db, person.id);
      return {
        person,
        owedMXN: pending.reduce((s, p) => s.plus(p.remaining), ZERO),
        pending: pending.map((p) => ({ transaction: p.tx, remainingMXN: p.remaining })),
      };
    }),
  );
}
