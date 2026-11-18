"use server";
import { db } from "@/lib/db";
import { fundClose, fundCreate, fundUpdate, idInput } from "@/lib/validation";
import { runAction } from "@/server/action-utils";
import * as svc from "@/server/services/funds";

export const createFundAction = async (input: unknown) => runAction(fundCreate, input, (d) => svc.createFund(db, d));
export const updateFundAction = async (input: unknown) => runAction(fundUpdate, input, (d) => svc.updateFund(db, d));
export const closeFundAction = async (input: unknown) => runAction(fundClose, input, (d) => svc.closeFund(db, d));
export const reopenFundAction = async (id: string) => runAction(idInput, { id }, (d) => svc.reopenFund(db, d.id));
export const deleteFundAction = async (id: string) => runAction(idInput, { id }, (d) => svc.deleteFund(db, d.id));
