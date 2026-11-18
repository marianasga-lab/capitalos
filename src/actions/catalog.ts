"use server";
import { db } from "@/lib/db";
import {
  budgetInput, categoryInput, categoryUpdate, counterpartyInput, counterpartyUpdate,
  goalContribution, goalCreate, goalUpdate, idInput, monthInput, rateInput,
} from "@/lib/validation";
import { runAction } from "@/server/action-utils";
import * as svc from "@/server/services/catalog";
import * as reports from "@/server/services/reports";

export const createGoalAction = async (input: unknown) => runAction(goalCreate, input, (d) => svc.createGoal(db, d));
export const updateGoalAction = async (input: unknown) => runAction(goalUpdate, input, (d) => svc.updateGoal(db, d));
export const contributeToGoalAction = async (input: unknown) =>
  runAction(goalContribution, input, (d) => svc.contributeToGoal(db, d.id, d.amount));
export const deleteGoalAction = async (id: string) => runAction(idInput, { id }, (d) => svc.deleteGoal(db, d.id));

export const createCategoryAction = async (input: unknown) => runAction(categoryInput, input, (d) => svc.createCategory(db, d));
export const updateCategoryAction = async (input: unknown) => runAction(categoryUpdate, input, (d) => svc.updateCategory(db, d));
export const setBudgetAction = async (input: unknown) => runAction(budgetInput, input, (d) => svc.setBudget(db, d));
export const seedMonthBudgetsAction = async (input: unknown) =>
  runAction(monthInput, input, (d) => svc.seedMonthBudgets(db, d.year, d.month));

export const createCounterpartyAction = async (input: unknown) => runAction(counterpartyInput, input, (d) => svc.createCounterparty(db, d));
export const updateCounterpartyAction = async (input: unknown) => runAction(counterpartyUpdate, input, (d) => svc.updateCounterparty(db, d));

export const setExchangeRateAction = async (input: unknown) => runAction(rateInput, input, (d) => svc.setExchangeRate(db, d));

/** Cierre de mes: guarda la foto de patrimonio y ahorro. */
export const closeMonthAction = async (input: unknown) => runAction(monthInput, input, (d) => reports.closeMonth(db, d.year, d.month));
