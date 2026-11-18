/**
 * Bolsas: dinero de un tercero (ej. Papá) que yo recibo y pago por él.
 * Responde "¿cuadra?": lo depositado vs. lo pagado vs. lo esperado.
 */
import { Prisma, PrismaClient, type Fund } from "@prisma/client";
import type { z } from "zod";
import type { fundClose, fundCreate, fundUpdate } from "@/lib/validation";
import { dec, DomainError, EPS, parseDate, ZERO, type Db } from "./common";
import { createTransaction } from "./transactions";

type D = Prisma.Decimal;

export type FundState =
  | "BALANCED" // depositado = pagado
  | "UNUSED" // tengo dinero suyo sin usar
  | "OVERPAID"; // pagué de más: me debe

export function fundState(balance: D): FundState {
  if (balance.abs().lte(EPS)) return "BALANCED";
  return balance.gt(0) ? "UNUSED" : "OVERPAID";
}

export async function createFund(db: Db, input: z.output<typeof fundCreate>) {
  let counterpartyId = input.counterpartyId ?? null;
  if (!counterpartyId && input.counterpartyName) {
    const cp = await db.counterparty.upsert({
      where: { name: input.counterpartyName },
      create: { name: input.counterpartyName, isFamily: true },
      update: {},
    });
    counterpartyId = cp.id;
  }
  if (!counterpartyId) throw new DomainError("Indica de quién es el dinero.");
  return db.fund.create({
    data: {
      name: input.name,
      counterpartyId,
      expectedAmount: input.expectedAmount ? dec(input.expectedAmount) : null,
      notes: input.notes,
    },
  });
}

export function updateFund(db: Db, input: z.output<typeof fundUpdate>) {
  return db.fund.update({
    where: { id: input.id },
    data: {
      name: input.name,
      notes: input.notes,
      ...(input.expectedAmount !== undefined && { expectedAmount: input.expectedAmount ? dec(input.expectedAmount) : null }),
    },
  });
}

/** Resumen de cada bolsa: cuánto entró, cuánto salió, y si cuadra. */
export async function fundSummaries(db: Db, where: Prisma.FundWhereInput = {}) {
  const funds = await db.fund.findMany({
    where,
    include: { counterparty: true, transactions: { orderBy: { date: "asc" } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return funds.map((f) => summarize(f));
}

function summarize(f: Fund & { counterparty: { name: string }; transactions: Prisma.TransactionGetPayload<object>[] }) {
  let deposited = ZERO, paid = ZERO, settled = ZERO;
  for (const t of f.transactions) {
    const v = t.amount.mul(t.fxToMXN);
    if (t.type === "FUND_DEPOSIT") deposited = deposited.plus(v);
    else if (t.type === "FUND_PAYMENT") paid = paid.plus(v);
    else settled = settled.plus(t.type === "INCOME" ? v.neg() : v);
  }
  const state = fundState(f.balance);
  return {
    fund: f,
    owner: f.counterparty.name,
    deposited,
    paid,
    settled,
    balance: f.balance,
    state,
    /** Lo que falta que deposite para llegar a lo esperado (≤ 0: ya cubrió). */
    missingDeposit: f.expectedAmount ? f.expectedAmount.minus(deposited) : null,
    /** Lo que falta pagar de lo esperado. */
    missingPayment: f.expectedAmount ? f.expectedAmount.minus(paid) : null,
    message:
      state === "BALANCED"
        ? "Cuadra: lo depositado es igual a lo pagado."
        : state === "UNUSED"
          ? `Tienes ${mxn(f.balance)} de ${f.counterparty.name} sin usar.`
          : `Pagaste ${mxn(f.balance.neg())} de más: ${f.counterparty.name} te lo debe.`,
  };
}

const mxn = (d: D) => d.toNumber().toLocaleString("es-MX", { style: "currency", currency: "MXN" });

/**
 * Cierra la bolsa. Si no cuadra, exige decidir qué pasa con la diferencia:
 *  - KEEP (sobrante): pasa a ser mío → ingreso de apoyo familiar.
 *  - ABSORB (pagué de más): lo pongo yo → gasto propio.
 * Si Papá va a depositar o le vas a devolver, regístralo antes de cerrar.
 */
export async function closeFund(db: PrismaClient, input: z.output<typeof fundClose>) {
  return db.$transaction(async (tx) => {
    const f = await tx.fund.findUnique({ where: { id: input.id }, include: { counterparty: true } });
    if (!f) throw new DomainError("La bolsa no existe.");
    if (f.status === "CLOSED") throw new DomainError("La bolsa ya está cerrada.");
    const state = fundState(f.balance);

    if (state !== "BALANCED") {
      const expected = state === "UNUSED" ? "KEEP" : "ABSORB";
      if (input.settle !== expected) {
        throw new DomainError(
          state === "UNUSED"
            ? `Quedan ${mxn(f.balance)} de ${f.counterparty.name}. Devuélveselos (registra un pago de la bolsa) o elige quedártelos.`
            : `Pagaste ${mxn(f.balance.neg())} de más. Registra el depósito de ${f.counterparty.name} o elige absorberlo.`,
        );
      }
      await createTransaction(
        tx,
        {
          type: state === "UNUSED" ? "INCOME" : "EXPENSE",
          date: input.date,
          amount: f.balance.abs().toFixed(2),
          description: state === "UNUSED" ? `Sobrante de "${f.name}" (me lo quedo)` : `Diferencia de "${f.name}" (la pongo yo)`,
          category: state === "UNUSED" ? "Apoyo familiar" : "Bolsas: diferencia absorbida",
          fundSource: state === "UNUSED" ? "ALLOWANCE_FAMILY" : "OWN_CAPITAL",
          isFixedExpense: false,
          counterpartyId: f.counterpartyId,
          counterpartyName: null,
          fundId: f.id,
          notes: "Cierre de bolsa",
        },
        { settlement: true },
      );
    }
    return tx.fund.update({ where: { id: f.id }, data: { status: "CLOSED", closedAt: parseDate(input.date) } });
  });
}

/** Reabre una bolsa. No deshace el ajuste del cierre (bórralo a mano si hace falta). */
export const reopenFund = (db: Db, id: string) =>
  db.fund.update({ where: { id }, data: { status: "OPEN", closedAt: null } });

export async function deleteFund(db: Db, id: string) {
  const f = await db.fund.findUnique({ where: { id }, include: { _count: { select: { transactions: true } } } });
  if (!f) throw new DomainError("La bolsa no existe.");
  if (f._count.transactions > 0) throw new DomainError("La bolsa tiene movimientos. Ciérrala en lugar de borrarla.");
  return db.fund.delete({ where: { id } });
}
