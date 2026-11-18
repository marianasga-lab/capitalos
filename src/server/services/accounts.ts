/**
 * Cuentas y tarjetas.
 * El saldo solo se escribe directo al crear (saldo de apertura). Después,
 * solo lo mueven los movimientos o una conciliación (que deja registro).
 */
import { PrismaClient } from "@prisma/client";
import type { z } from "zod";
import type { accountCreate, accountUpdate, cardCreate, cardUpdate, reconcileInput } from "@/lib/validation";
import { ADJUSTMENT_CATEGORY, dec, DomainError, EPS, pctToFraction, type Db } from "./common";
import { createTransaction } from "./transactions";

type AccountCreate = z.output<typeof accountCreate>;
type AccountUpdate = z.output<typeof accountUpdate>;
type CardCreate = z.output<typeof cardCreate>;
type CardUpdate = z.output<typeof cardUpdate>;

// ---------- Cuentas ----------

export function createAccount(db: Db, input: AccountCreate) {
  if (input.type !== "INVESTMENT" && input.interestRate) {
    throw new DomainError("La tasa de interés solo aplica a inversiones.");
  }
  return db.account.create({
    data: {
      name: input.name,
      type: input.type,
      currency: input.currency,
      currentBalance: dec(input.openingBalance),
      interestRate: pctToFraction(input.interestRate),
    },
  });
}

export async function updateAccount(db: Db, input: AccountUpdate) {
  const acc = await db.account.findUnique({ where: { id: input.id } });
  if (!acc) throw new DomainError("La cuenta no existe.");
  if (acc.isSystem && (input.archived || input.name)) throw new DomainError("Esta cuenta es del sistema.");
  if (input.archived && acc.currentBalance.abs().gt(EPS)) {
    throw new DomainError("Pasa el saldo a otra cuenta antes de archivarla (debe quedar en 0).");
  }
  return db.account.update({
    where: { id: input.id },
    data: {
      name: input.name,
      archived: input.archived,
      ...(input.interestRate !== undefined && { interestRate: pctToFraction(input.interestRate) }),
    },
  });
}

/** Solo se puede borrar una cuenta sin historial; si tiene, se archiva. */
export async function deleteAccount(db: Db, id: string) {
  const acc = await db.account.findUnique({
    where: { id },
    include: { _count: { select: { outgoing: true, incoming: true, reimbursements: true, reimbursedInto: true } } },
  });
  if (!acc) throw new DomainError("La cuenta no existe.");
  if (acc.isSystem) throw new DomainError("Esta cuenta es del sistema.");
  const used = Object.values(acc._count).some((n) => n > 0);
  if (used) throw new DomainError("La cuenta tiene movimientos. Archívala en lugar de borrarla.");
  await db.savingsGoal.updateMany({ where: { accountId: id }, data: { accountId: null } });
  return db.account.delete({ where: { id } });
}

/**
 * Conciliación: "en realidad tengo X". Registra la diferencia como
 * movimiento de ajuste (no cuenta como ingreso ni gasto en los reportes).
 */
export async function reconcileAccount(db: PrismaClient, input: z.output<typeof reconcileInput>) {
  const acc = await db.account.findUnique({ where: { id: input.accountId } });
  if (!acc || acc.isSystem) throw new DomainError("La cuenta no existe.");
  const diff = dec(input.actualBalance).minus(acc.currentBalance);
  if (diff.abs().lte(EPS)) return null;
  return createTransaction(db, {
    type: diff.gt(0) ? "INCOME" : "EXPENSE",
    date: input.date,
    amount: diff.abs().toFixed(2),
    description: `Conciliación de ${acc.name}`,
    category: ADJUSTMENT_CATEGORY,
    fundSource: "OWN_CAPITAL",
    isFixedExpense: false,
    accountId: acc.id,
    counterpartyName: null,
    notes: `Saldo en sistema ${acc.currentBalance.toFixed(2)} → real ${dec(input.actualBalance).toFixed(2)}`,
  });
}

// ---------- Tarjetas ----------

export function createCard(db: Db, input: CardCreate) {
  return db.creditCard.create({
    data: {
      name: input.name,
      limit: dec(input.limit),
      currency: input.currency,
      cutoffDay: input.cutoffDay,
      paymentDueDay: input.paymentDueDay,
      interestRate: pctToFraction(input.interestRate)!,
      currentBalance: dec(input.openingBalance),
    },
  });
}

export async function updateCard(db: Db, input: CardUpdate) {
  const card = await db.creditCard.findUnique({ where: { id: input.id } });
  if (!card) throw new DomainError("La tarjeta no existe.");
  if (input.archived && card.currentBalance.abs().gt(EPS)) {
    throw new DomainError("Liquida la tarjeta antes de archivarla.");
  }
  return db.creditCard.update({
    where: { id: input.id },
    data: {
      name: input.name,
      limit: input.limit ? dec(input.limit) : undefined,
      cutoffDay: input.cutoffDay,
      paymentDueDay: input.paymentDueDay,
      interestRate: input.interestRate ? pctToFraction(input.interestRate)! : undefined,
      archived: input.archived,
    },
  });
}

export async function deleteCard(db: Db, id: string) {
  const card = await db.creditCard.findUnique({ where: { id }, include: { _count: { select: { transactions: true } } } });
  if (!card) throw new DomainError("La tarjeta no existe.");
  if (card._count.transactions > 0) throw new DomainError("La tarjeta tiene movimientos. Archívala en lugar de borrarla.");
  return db.creditCard.delete({ where: { id } });
}
