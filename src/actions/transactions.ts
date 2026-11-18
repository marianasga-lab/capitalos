"use server";
/**
 * Server Actions de movimientos y reembolsos.
 * App de uso personal y local: no hay login todavía. Antes de publicarla
 * en internet hay que agregar autenticación y verificarla en cada acción.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { collectInput, idInput, paymentInput, transactionInput } from "@/lib/validation";
import { runAction } from "@/server/action-utils";
import * as txs from "@/server/services/transactions";
import * as reimb from "@/server/services/reimbursements";

export async function createTransactionAction(input: unknown) {
  return runAction(transactionInput, input, (data) => txs.createTransaction(db, data));
}

export async function updateTransactionAction(id: string, input: unknown) {
  return runAction(transactionInput, input, (data) => txs.updateTransaction(db, id, data));
}

export async function deleteTransactionAction(id: string) {
  return runAction(idInput, { id }, ({ id }) => txs.deleteTransaction(db, id));
}

/** Abono total o parcial de alguien que me debe. */
export async function recordPaymentAction(input: unknown) {
  return runAction(paymentInput, input, (data) => reimb.recordPayment(db, data));
}

/** Botón "Cobrado" (un clic): liquida lo pendiente de un gasto. */
export async function collectTransactionAction(input: unknown) {
  return runAction(collectInput, input, (data) => reimb.collectTransaction(db, data));
}

export async function deletePaymentAction(id: string) {
  return runAction(idInput, { id }, ({ id }) => reimb.deletePayment(db, id));
}

export async function listTransactionsAction(filters: unknown) {
  return runAction(z.record(z.string(), z.unknown()), filters ?? {}, (f) => txs.listTransactions(db, f));
}
