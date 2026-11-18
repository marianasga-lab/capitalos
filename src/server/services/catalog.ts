/** Metas de ahorro, categorías, presupuestos, personas y tipos de cambio. */
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import type {
  budgetInput, categoryInput, categoryUpdate, counterpartyInput, counterpartyUpdate,
  goalCreate, goalUpdate, rateInput,
} from "@/lib/validation";
import { dec, DomainError, parseDate, ZERO, type Db } from "./common";

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ---------- Metas ----------

export function createGoal(db: Db, input: z.output<typeof goalCreate>) {
  return db.savingsGoal.create({
    data: {
      name: input.name,
      targetAmount: dec(input.targetAmount),
      currentAmount: dec(input.currentAmount),
      deadline: input.deadline ? parseDate(input.deadline) : null,
      accountId: input.accountId ?? null,
    },
  });
}

export function updateGoal(db: Db, input: z.output<typeof goalUpdate>) {
  return db.savingsGoal.update({
    where: { id: input.id },
    data: {
      name: input.name,
      targetAmount: input.targetAmount ? dec(input.targetAmount) : undefined,
      currentAmount: input.currentAmount ? dec(input.currentAmount) : undefined,
      deadline: input.deadline === undefined ? undefined : input.deadline ? parseDate(input.deadline) : null,
      accountId: input.accountId === undefined ? undefined : input.accountId,
    },
  });
}

/** Aporta (positivo) o retira (negativo) de una meta. No mueve saldos de cuentas. */
export async function contributeToGoal(db: Db, id: string, amount: string) {
  if (!/^-?\d+(\.\d{1,2})?$/.test(amount) || Number(amount) === 0) throw new DomainError("Monto inválido.");
  const goal = await db.savingsGoal.findUnique({ where: { id } });
  if (!goal) throw new DomainError("La meta no existe.");
  const next = goal.currentAmount.plus(dec(amount));
  if (next.lt(0)) throw new DomainError("No puedes retirar más de lo que lleva la meta.");
  return db.savingsGoal.update({ where: { id }, data: { currentAmount: next } });
}

export const deleteGoal = (db: Db, id: string) => db.savingsGoal.delete({ where: { id } });

// ---------- Categorías y presupuesto ----------

export async function createCategory(db: Db, input: z.output<typeof categoryInput>) {
  try {
    return await db.category.create({
      data: { ...input, defaultBudget: input.defaultBudget != null ? dec(input.defaultBudget) : null },
    });
  } catch (e) {
    if (isUnique(e)) throw new DomainError("Ya existe una categoría con ese nombre.");
    throw e;
  }
}

/** Renombrar una categoría también actualiza los movimientos que la usan. */
export async function updateCategory(db: Db, input: z.output<typeof categoryUpdate>) {
  const cat = await db.category.findUnique({ where: { id: input.id } });
  if (!cat) throw new DomainError("La categoría no existe.");
  const { id, defaultBudget, ...rest } = input;
  const updated = await db.category.update({
    where: { id },
    data: { ...rest, ...(defaultBudget !== undefined && { defaultBudget: defaultBudget != null ? dec(defaultBudget) : null }) },
  });
  if (input.name && input.name !== cat.name) {
    await db.transaction.updateMany({ where: { category: cat.name }, data: { category: input.name } });
  }
  return updated;
}

export function setBudget(db: Db, input: z.output<typeof budgetInput>) {
  const { categoryId, year, month } = input;
  const plannedAmount = dec(input.plannedAmount);
  return db.budget.upsert({
    where: { categoryId_year_month: { categoryId, year, month } },
    create: { categoryId, year, month, plannedAmount },
    update: { plannedAmount },
  });
}

/** Crea el presupuesto de un mes copiando los montos por defecto de cada categoría. */
export async function seedMonthBudgets(db: Db, year: number, month: number) {
  const cats = await db.category.findMany({ where: { kind: "EXPENSE", archived: false } });
  let created = 0;
  for (const c of cats) {
    const exists = await db.budget.findUnique({ where: { categoryId_year_month: { categoryId: c.id, year, month } } });
    if (!exists) {
      await db.budget.create({ data: { categoryId: c.id, year, month, plannedAmount: c.defaultBudget ?? ZERO } });
      created++;
    }
  }
  return created;
}

// ---------- Personas ----------

export async function createCounterparty(db: Db, input: z.output<typeof counterpartyInput>) {
  try {
    return await db.counterparty.create({ data: input });
  } catch (e) {
    if (isUnique(e)) throw new DomainError("Ya existe una persona con ese nombre.");
    throw e;
  }
}

export const updateCounterparty = (db: Db, { id, ...data }: z.output<typeof counterpartyUpdate>) =>
  db.counterparty.update({ where: { id }, data });

// ---------- Tipos de cambio ----------

export function setExchangeRate(db: Db, input: z.output<typeof rateInput>) {
  const rateToMXN = dec(input.rateToMXN);
  return db.exchangeRate.upsert({
    where: { currency: input.currency },
    create: { currency: input.currency, rateToMXN },
    update: { rateToMXN },
  });
}
