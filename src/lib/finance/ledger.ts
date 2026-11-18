/**
 * Reglas del libro mayor: cómo cada movimiento afecta los saldos.
 * Es la única fuente de verdad. La usan el seed y los servicios,
 * siempre dentro de una transacción de base de datos.
 *
 * Signos:
 *  - Account.currentBalance    → activo (+ = tengo), en la moneda de la cuenta
 *  - CreditCard.currentBalance → pasivo (+ = debo), en la moneda de la tarjeta
 *  - "Cuentas por Cobrar" siempre está en MXN: todo lo que entra ahí se
 *    convierte con el tipo de cambio del movimiento (`fxToMXN`).
 *
 * Reembolsos: el movimiento SIEMPRE manda lo adeudado a "por cobrar",
 * sin importar su estado. Los abonos (ReimbursementPayment) son los que
 * mueven el dinero de "por cobrar" a una cuenta real. Así editar o borrar
 * nunca depende del estado.
 */
import { Prisma } from "@prisma/client";

type D = Prisma.Decimal;
type Num = D | number | string;

export type LedgerInput = {
  type: "INCOME" | "EXPENSE" | "TRANSFER" | "REIMBURSABLE_EXPENSE";
  amount: Num;
  /** Tipo de cambio a MXN de la moneda del movimiento (1 si es MXN). */
  fxToMXN?: Num | null;
  accountId?: string | null;
  toAccountId?: string | null;
  creditCardId?: string | null;
  /** Gasto compartido: mi parte. La diferencia queda por cobrar. */
  myShareAmount?: Num | null;
  /** TRANSFER entre monedas: lo que llega al destino. */
  toAmount?: Num | null;
};

export type Delta =
  | { kind: "account"; id: string; amount: D }
  | { kind: "card"; id: string; amount: D };

export class LedgerError extends Error {}

const dec = (v: Num) => new Prisma.Decimal(v);

/** Cuánto me deben por este movimiento, en MXN (0 si no aplica). */
export function owedMXN(tx: Pick<LedgerInput, "type" | "amount" | "fxToMXN" | "myShareAmount">): D {
  const amt = dec(tx.amount);
  const fx = dec(tx.fxToMXN ?? 1);
  if (tx.type === "REIMBURSABLE_EXPENSE") return amt.mul(fx);
  if (tx.type === "EXPENSE" && tx.myShareAmount != null) return amt.minus(dec(tx.myShareAmount)).mul(fx);
  return new Prisma.Decimal(0);
}

/** Devuelve los cambios de saldo que provoca un movimiento. */
export function computeDeltas(tx: LedgerInput, receivableAccountId: string): Delta[] {
  const amt = dec(tx.amount);
  if (amt.lte(0)) throw new LedgerError("El monto debe ser mayor a 0.");
  if (dec(tx.fxToMXN ?? 1).lte(0)) throw new LedgerError("El tipo de cambio debe ser mayor a 0.");

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
        const mine = dec(tx.myShareAmount);
        if (mine.lt(0) || mine.gt(amt)) throw new LedgerError("Tu parte no puede superar el total.");
      }
      break;

    case "TRANSFER":
      if (!tx.accountId) throw new LedgerError("Un traspaso necesita cuenta origen.");
      out.push({ kind: "account", id: tx.accountId, amount: amt.neg() });
      if (tx.toAccountId) {
        if (tx.toAccountId === tx.accountId) throw new LedgerError("Origen y destino son iguales.");
        const received = tx.toAmount != null ? dec(tx.toAmount) : amt;
        if (received.lte(0)) throw new LedgerError("El monto recibido debe ser mayor a 0.");
        out.push({ kind: "account", id: tx.toAccountId, amount: received });
      } else if (tx.creditCardId) {
        // Pago de tarjeta: baja la deuda.
        out.push({ kind: "card", id: tx.creditCardId, amount: amt.neg() });
      } else throw new LedgerError("Un traspaso necesita cuenta destino o tarjeta a pagar.");
      break;

    case "REIMBURSABLE_EXPENSE":
      spend();
      break;
  }

  const owed = owedMXN(tx);
  if (owed.gt(0)) out.push({ kind: "account", id: receivableAccountId, amount: owed });
  return out;
}

/**
 * Un abono de alguien que me debía: sale de "por cobrar" (MXN) y entra a
 * una cuenta real en su moneda. `fxToMXN` es el tipo de cambio de esa cuenta.
 */
export function paymentDeltas(amount: Num, accountId: string, receivableAccountId: string, fxToMXN: Num = 1): Delta[] {
  const amt = dec(amount);
  if (amt.lte(0)) throw new LedgerError("El abono debe ser mayor a 0.");
  return [
    { kind: "account", id: receivableAccountId, amount: amt.mul(dec(fxToMXN)).neg() },
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
      await tx.account.update({ where: { id: d.id }, data: { currentBalance: { increment: d.amount } } });
    } else {
      await tx.creditCard.update({ where: { id: d.id }, data: { currentBalance: { increment: d.amount } } });
    }
  }
}
