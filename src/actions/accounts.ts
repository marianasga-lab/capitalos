"use server";
import { db } from "@/lib/db";
import { accountCreate, accountUpdate, cardCreate, cardUpdate, idInput, reconcileInput } from "@/lib/validation";
import { runAction } from "@/server/action-utils";
import * as svc from "@/server/services/accounts";

export const createAccountAction = async (input: unknown) => runAction(accountCreate, input, (d) => svc.createAccount(db, d));
export const updateAccountAction = async (input: unknown) => runAction(accountUpdate, input, (d) => svc.updateAccount(db, d));
export const deleteAccountAction = async (id: string) => runAction(idInput, { id }, (d) => svc.deleteAccount(db, d.id));
/** "En realidad tengo X": registra la diferencia como ajuste. */
export const reconcileAccountAction = async (input: unknown) => runAction(reconcileInput, input, (d) => svc.reconcileAccount(db, d));

export const createCardAction = async (input: unknown) => runAction(cardCreate, input, (d) => svc.createCard(db, d));
export const updateCardAction = async (input: unknown) => runAction(cardUpdate, input, (d) => svc.updateCard(db, d));
export const deleteCardAction = async (id: string) => runAction(idInput, { id }, (d) => svc.deleteCard(db, d.id));
