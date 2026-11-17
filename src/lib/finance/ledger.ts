/**
 * Reglas del libro mayor: cómo cada movimiento afecta los saldos.
 * Es la única fuente de verdad. La usan el seed y las Server Actions,
 * siempre dentro de una transacción de base de datos.
 *
 * Signos:
 *  - Account.currentBalance  → activo (+ = tengo)
 *  - CreditCard.currentBalance → pasivo (+ = debo)
 */
import { Prisma } from "@prisma/client";

type D = Prisma.Decimal;

export type LedgerInput = {
  type: "INCOME" | "EXPENSE" | "TRANSFER" | "REIMBURSABLE_EXPENSE";
  amount: D | number | string;
  accountId?: string | null;
  toAccountId?: string | null;
  creditCardId?: string | null;
  reimbursementStatus?: "NOT_APPLICABLE" | "PENDING" | "PAID";
  reimbursedToId?: string | null;
  /** SHARED_SPLIT: mi parte. La diferencia queda por cobrar. */
  myShareAmount?: D | number | string | null;
};

export type Delta =
  | { kind: "account"; id: string; amount: D }
  | { kind: "card"; id: string; amount: D };

export class LedgerError extends Error {}

/** Devuelve los cambios de saldo que provoca un movimiento. */
export function computeDeltas(tx: LedgerInput, receivableAccountId: string): Delta[] {
  const amt = new Prisma.Decimal(tx.amount);
  if (amt.lte(0)) throw new LedgerError("El monto debe ser mayor a 0.");

  const out: Delta[] = [];
  const spend = () => {
    if (tx.creditCardId) out.push({ kind: "card", id: tx.creditCardId, amount: amt });
    else if (tx.accountId) out.push({ kind: "account", id: tx.accountId, amount: amt.neg() });
    else throw new LedgerError("Un gasto necesita cuenta o tarjeta de origen.");
  };

  switch (tx.type) {
    case "INCOME":
      if (!tx.accountId) throw new LedgerError("Un ingreso necesita cuenta destino.");
      out.push({ kind: "account", id: tx.accountId, amount: amt });
      break;

    case "EXPENSE":
      spend();
      if (tx.myShareAmount != null) {
        const mine = new Prisma.Decimal(tx.myShareAmount);
        if (mine.lt(0) || mine.gt(amt)) throw new LedgerError("Tu parte no puede superar el total.");
        const owed = amt.minus(mine);
        if (owed.gt(0)) out.push({ kind: "account", id: receivableAccountId, amount: owed });
      }
      break;

    case "TRANSFER":
      if (!tx.accountId) throw new LedgerError("Un traspaso necesita cuenta origen.");
      out.push({ kind: "account", id: tx.accountId, amount: amt.neg() });
      if (tx.toAccountId) {
        if (tx.toAccountId === tx.accountId) throw new LedgerError("Origen y destino son iguales.");
        out.push({ kind: "account", id: tx.toAccountId, amount: amt });
      } else if (tx.creditCardId) {
        // Pago de tarjeta: baja la deuda.
        out.push({ kind: "card", id: tx.creditCardId, amount: amt.neg() });
      } else throw new LedgerError("Un traspaso necesita cuenta destino o tarjeta a pagar.");
      break;

    case "REIMBURSABLE_EXPENSE":
      spend();
      if (tx.reimbursementStatus === "PAID") {
        // Ya me pagaron: el dinero regresó a una cuenta.
        const dest = tx.reimbursedToId ?? tx.accountId;
        if (!dest) throw new LedgerError("Indica la cuenta donde entró el reembolso.");
        out.push({ kind: "account", id: dest, amount: amt });
      } else {
        // Pendiente: no es pérdida de patrimonio, es dinero por cobrar.
        out.push({ kind: "account", id: receivableAccountId, amount: amt });
      }
      break;
  }
  return out;
}

/** Un abono de alguien que me debía: sale de "por cobrar" y entra a mi cuenta. */
export function paymentDeltas(
  amount: D | number | string,
  accountId: string,
  receivableAccountId: string,
): Delta[] {
  const amt = new Prisma.Decimal(amount);
  if (amt.lte(0)) throw new LedgerError("El abono debe ser mayor a 0.");
  return [
    { kind: "account", id: receivableAccountId, amount: amt.neg() },
    { kind: "account", id: accountId, amount: amt },
  ];
}

/** Invierte los deltas (para borrar o editar un movimiento). */
export function invertDeltas(deltas: Delta[]): Delta[] {
  return deltas.map((d) => ({ ...d, amount: d.amount.neg() }));
}

/** Aplica deltas dentro de un cliente transaccional de Prisma. */
export async function applyDeltas(tx: Prisma.TransactionClient, deltas: Delta[]) {
  for (const d of deltas) {
    if (d.kind === "account") {
      await tx.account.update({
        where: { id: d.id },
        data: { currentBalance: { increment: d.amount } },
      });
    } else {
      await tx.creditCard.update({
        where: { id: d.id },
        data: { currentBalance: { increment: d.amount } },
      });
    }
  }
}
