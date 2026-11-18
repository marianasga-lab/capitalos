/**
 * Movimientos: crear, editar, borrar y listar.
 * Toda escritura ocurre dentro de `$transaction`: el movimiento y los
 * saldos que afecta se guardan juntos o no se guarda nada.
 */
import { Prisma, PrismaClient, type ReimbursementStatus, type Transaction } from "@prisma/client";
import { applyDeltas, computeDeltas, invertDeltas, LedgerError, owedMXN, type LedgerInput } from "@/lib/finance/ledger";
import type { TransactionData } from "@/lib/validation";
import { transactionFilters } from "@/lib/validation";
import type { z } from "zod";
import { dec, DomainError, EPS, getRate, getReceivableAccount, parseDate, type Db } from "./common";

export function statusFor(owed: Prisma.Decimal, reimbursed: Prisma.Decimal): ReimbursementStatus {
  if (owed.lte(EPS)) return "NOT_APPLICABLE";
  return reimbursed.gte(owed.minus(EPS)) ? "PAID" : "PENDING";
}

/** Convierte un movimiento guardado a la entrada del libro mayor. */
export const toLedger = (t: Transaction): LedgerInput => ({
  type: t.type,
  amount: t.amount,
  fxToMXN: t.fxToMXN,
  accountId: t.accountId,
  toAccountId: t.toAccountId,
  creditCardId: t.creditCardId,
  myShareAmount: t.myShareAmount,
  toAmount: t.toAmount,
});

/**
 * Valida reglas de negocio y completa lo derivable (moneda, tipo de cambio,
 * persona, estado). Devuelve los datos listos para guardar.
 */
async function resolve(db: Db, input: TransactionData, previous?: Transaction) {
  const { type } = input;
  const { accountId } = input;
  let { toAccountId, creditCardId, toAmount, myShareAmount } = input;
  let fundSource = input.fundSource;

  // Limpia campos que no aplican al tipo, para que no se cuelen saldos.
  if (type !== "TRANSFER") { toAccountId = null; toAmount = null; }
  if (type === "INCOME") creditCardId = null;
  if (type !== "EXPENSE") myShareAmount = null;

  const [account, toAccount, card] = await Promise.all([
    accountId ? db.account.findUnique({ where: { id: accountId } }) : null,
    toAccountId ? db.account.findUnique({ where: { id: toAccountId } }) : null,
    creditCardId ? db.creditCard.findUnique({ where: { id: creditCardId } }) : null,
  ]);
  if (accountId && !account) throw new DomainError("La cuenta no existe.");
  if (toAccountId && !toAccount) throw new DomainError("La cuenta destino no existe.");
  if (creditCardId && !card) throw new DomainError("La tarjeta no existe.");
  for (const a of [account, toAccount]) {
    if (a?.isSystem) throw new DomainError(`"${a.name}" la maneja el sistema; no se puede usar directamente.`);
  }

  // ----- Reglas por tipo -----
  if (type === "INCOME" && !account) throw new DomainError("Elige la cuenta donde entró el dinero.");
  if (type === "EXPENSE" || type === "REIMBURSABLE_EXPENSE") {
    if (account && card) throw new DomainError("Elige cuenta o tarjeta, no ambas.");
    if (!account && !card) throw new DomainError("Elige con qué pagaste: una cuenta o una tarjeta.");
  }
  if (type === "TRANSFER") {
    if (!account) throw new DomainError("Elige la cuenta de origen.");
    if (!!toAccount === !!card) throw new DomainError("Elige un destino: otra cuenta o una tarjeta a pagar.");
    if (toAccount) {
      if (toAccount.currency !== account.currency) {
        if (!toAmount) {
          throw new DomainError(`Cambio de ${account.currency} a ${toAccount.currency}: indica cuánto llegó a la cuenta destino.`);
        }
      } else toAmount = null; // misma moneda: llega lo mismo que sale
    }
    if (card && card.currency !== account.currency) {
      throw new DomainError("Para pagar la tarjeta usa una cuenta en su misma moneda.");
    }
  }

  // ----- Gasto compartido -----
  if (myShareAmount != null) fundSource = "SHARED_SPLIT";
  if (fundSource === "SHARED_SPLIT") {
    if (type !== "EXPENSE") throw new DomainError("Un gasto compartido debe ser de tipo Gasto.");
    if (myShareAmount == null) throw new DomainError("Indica cuánto te toca a ti del gasto compartido.");
    if (dec(myShareAmount).gt(dec(input.amount))) throw new DomainError("Tu parte no puede ser mayor al total.");
  }

  // ----- Persona -----
  let counterpartyId = input.counterpartyId ?? null;
  if (!counterpartyId && input.counterpartyName) {
    const cp = await db.counterparty.upsert({
      where: { name: input.counterpartyName },
      create: { name: input.counterpartyName },
      update: {},
    });
    counterpartyId = cp.id;
  } else if (counterpartyId && !(await db.counterparty.findUnique({ where: { id: counterpartyId } }))) {
    throw new DomainError("La persona no existe.");
  }
  if ((type === "REIMBURSABLE_EXPENSE" || fundSource === "SHARED_SPLIT") && !counterpartyId) {
    throw new DomainError("Indica quién te debe este dinero.");
  }

  // ----- Moneda y tipo de cambio -----
  const currency = (card ?? account)!.currency;
  // Al editar sin tocar la moneda se conserva el tipo de cambio original.
  const fxToMXN = input.fxToMXN
    ? dec(input.fxToMXN)
    : previous && previous.currency === currency
      ? previous.fxToMXN
      : await getRate(db, currency);

  const data = {
    date: parseDate(input.date),
    amount: dec(input.amount),
    description: input.description,
    category: input.category,
    type,
    fundSource,
    isFixedExpense: type === "EXPENSE" ? input.isFixedExpense : false,
    currency,
    fxToMXN,
    accountId: account?.id ?? null,
    toAccountId: toAccount?.id ?? null,
    creditCardId: card?.id ?? null,
    toAmount: toAmount ? dec(toAmount) : null,
    myShareAmount: myShareAmount != null ? dec(myShareAmount) : null,
    counterpartyId,
    notes: input.notes,
  };
  return { data, archived: [account, toAccount, card].some((x) => x?.archived) };
}

function ledgerOf(d: Awaited<ReturnType<typeof resolve>>["data"]): LedgerInput {
  return { ...d };
}

function wrapLedger<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof LedgerError) throw new DomainError(e.message);
    throw e;
  }
}

export async function createTransaction(db: PrismaClient, input: TransactionData) {
  return db.$transaction(async (tx) => {
    const { data, archived } = await resolve(tx, input);
    if (archived) throw new DomainError("No puedes registrar movimientos en una cuenta o tarjeta archivada.");
    const receivable = await getReceivableAccount(tx);
    const deltas = wrapLedger(() => computeDeltas(ledgerOf(data), receivable.id));
    const status = statusFor(owedMXN(data), dec(0));
    const row = await tx.transaction.create({ data: { ...data, reimbursementStatus: status } });
    await applyDeltas(tx, deltas);
    return row;
  });
}

export async function updateTransaction(db: PrismaClient, id: string, input: TransactionData) {
  return db.$transaction(async (tx) => {
    const old = await tx.transaction.findUnique({ where: { id }, include: { _count: { select: { payments: true } } } });
    if (!old) throw new DomainError("El movimiento no existe.");
    const { data } = await resolve(tx, input, old);
    const receivable = await getReceivableAccount(tx);

    const newOwed = owedMXN(data);
    if (old._count.payments > 0) {
      if (data.counterpartyId !== old.counterpartyId) {
        throw new DomainError("Este gasto ya tiene abonos: no puedes cambiar a la persona. Borra los abonos primero.");
      }
      if (newOwed.lt(old.amountReimbursed.minus(EPS))) {
        throw new DomainError("Ya te abonaron más de lo que quedaría adeudado. Ajusta o borra los abonos primero.");
      }
    }

    // Deshace el efecto anterior y aplica el nuevo, en la misma transacción.
    const undo = invertDeltas(computeDeltas(toLedger(old), receivable.id));
    const redo = wrapLedger(() => computeDeltas(ledgerOf(data), receivable.id));
    await applyDeltas(tx, undo);
    await applyDeltas(tx, redo);

    return tx.transaction.update({
      where: { id },
      data: { ...data, reimbursementStatus: statusFor(newOwed, old.amountReimbursed) },
    });
  });
}

export async function deleteTransaction(db: PrismaClient, id: string) {
  return db.$transaction(async (tx) => {
    const old = await tx.transaction.findUnique({ where: { id }, include: { _count: { select: { payments: true } } } });
    if (!old) throw new DomainError("El movimiento no existe.");
    if (old._count.payments > 0) {
      throw new DomainError("Este gasto tiene abonos registrados. Bórralos primero (el dinero que ya te pagaron sí llegó).");
    }
    const receivable = await getReceivableAccount(tx);
    await applyDeltas(tx, invertDeltas(computeDeltas(toLedger(old), receivable.id)));
    await tx.transaction.delete({ where: { id } });
    return old;
  });
}

export async function listTransactions(db: Db, rawFilters: z.input<typeof transactionFilters> = {}) {
  const f = transactionFilters.parse(rawFilters);
  const where: Prisma.TransactionWhereInput = {
    type: f.type,
    category: f.category,
    creditCardId: f.creditCardId,
    counterpartyId: f.counterpartyId,
    fundSource: f.fundSource,
    ...(f.accountId && { OR: [{ accountId: f.accountId }, { toAccountId: f.accountId }] }),
    ...((f.from || f.to) && {
      date: { ...(f.from && { gte: parseDate(f.from) }), ...(f.to && { lte: parseDate(f.to) }) },
    }),
    ...(f.search && { description: { contains: f.search } }),
  };
  const [rows, total] = await Promise.all([
    db.transaction.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: f.take,
      skip: f.skip,
      include: {
        account: { select: { name: true } },
        toAccount: { select: { name: true } },
        creditCard: { select: { name: true } },
        counterparty: { select: { name: true } },
      },
    }),
    db.transaction.count({ where }),
  ]);
  return { rows, total };
}
