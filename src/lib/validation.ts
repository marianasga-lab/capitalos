/**
 * Validación de entradas de las Server Actions (zod).
 * Los montos llegan como número o texto y se validan como decimales
 * positivos con máximo 2 decimales (o 6 para tipos de cambio).
 */
import { z } from "zod";

const decimal = (maxDecimals: number, label: string) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => String(v).trim().replace(/,/g, ""))
    .refine((v) => new RegExp(`^-?\\d+(\\.\\d{1,${maxDecimals}})?$`).test(v), {
      message: `${label}: usa un número válido (máx. ${maxDecimals} decimales).`,
    });

export const money = decimal(2, "Monto").refine((v) => Number(v) > 0, { message: "El monto debe ser mayor a 0." });
export const moneyOrZero = decimal(2, "Monto").refine((v) => Number(v) >= 0, { message: "El monto no puede ser negativo." });
export const fxRate = decimal(6, "Tipo de cambio").refine((v) => Number(v) > 0, {
  message: "El tipo de cambio debe ser mayor a 0.",
});
/** Tasa anual en porcentaje (10.5 = 10.5 %). Se guarda como fracción. */
export const percent = decimal(4, "Tasa").refine((v) => Number(v) >= 0 && Number(v) <= 1000, { message: "Tasa fuera de rango." });

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD).")
  .refine((v) => !Number.isNaN(new Date(`${v}T12:00:00`).getTime()), "Fecha inválida.");

const id = z.string().min(1);
const optId = id.nullish();
const text = (max: number) => z.string().trim().min(1, "Campo obligatorio.").max(max);
const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

export const currency = z.enum(["MXN", "USD", "EUR"]);
export const transactionType = z.enum(["INCOME", "EXPENSE", "TRANSFER", "REIMBURSABLE_EXPENSE", "FUND_DEPOSIT", "FUND_PAYMENT"]);
export const fundSource = z.enum(["OWN_CAPITAL", "ALLOWANCE_FAMILY", "SHARED_SPLIT"]);
export const accountType = z.enum(["CASH", "DEBIT", "INVESTMENT"]); // RECEIVABLE es solo del sistema

// ---------- Movimientos ----------
export const transactionInput = z.object({
  type: transactionType,
  date: isoDate,
  amount: money,
  description: text(140),
  category: text(60),
  fundSource: fundSource.default("OWN_CAPITAL"),
  isFixedExpense: z.boolean().default(false),
  accountId: optId,
  toAccountId: optId,
  creditCardId: optId,
  toAmount: money.nullish(),
  myShareAmount: moneyOrZero.nullish(),
  /** Si se omite, se usa el tipo de cambio guardado en Ajustes. */
  fxToMXN: fxRate.nullish(),
  counterpartyId: optId,
  /** Alternativa rápida: nombre de la persona (se crea si no existe). */
  counterpartyName: optText(60),
  /** Bolsa de dinero de un tercero (solo FUND_DEPOSIT / FUND_PAYMENT). */
  fundId: optId,
  notes: optText(500),
});
export type TransactionInput = z.input<typeof transactionInput>;
export type TransactionData = z.output<typeof transactionInput>;

export const transactionFilters = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  type: transactionType.optional(),
  category: z.string().optional(),
  accountId: z.string().optional(),
  creditCardId: z.string().optional(),
  counterpartyId: z.string().optional(),
  fundSource: fundSource.optional(),
  search: z.string().max(100).optional(),
  take: z.number().int().min(1).max(500).default(100),
  skip: z.number().int().min(0).default(0),
});

// ---------- Bolsas (dinero de terceros) ----------
export const fundCreate = z.object({
  name: text(80),
  counterpartyId: optId,
  counterpartyName: optText(60),
  expectedAmount: money.nullish(),
  notes: optText(300),
});
export const fundUpdate = z.object({
  id,
  name: text(80).optional(),
  expectedAmount: money.nullish(),
  notes: optText(300),
});
/**
 * Cerrar una bolsa. Si no cuadra:
 *  - KEEP: el sobrante se queda conmigo (cuenta como apoyo familiar)
 *  - ABSORB: lo que pagué de más lo pongo yo (cuenta como mi gasto)
 */
export const fundClose = z.object({ id, date: isoDate, settle: z.enum(["KEEP", "ABSORB"]).nullish() });

// ---------- Reembolsos ----------
export const paymentInput = z.object({
  counterpartyId: id,
  amount: money,
  accountId: id,
  date: isoDate,
  /** Si se omite, el abono se reparte del gasto más antiguo al más nuevo. */
  transactionId: optId,
  notes: optText(300),
});
export const collectInput = z.object({
  transactionId: id,
  accountId: optId,
  date: isoDate.optional(),
});

// ---------- Cuentas ----------
export const accountCreate = z.object({
  name: text(60),
  type: accountType,
  currency: currency.default("MXN"),
  openingBalance: moneyOrZero.default("0"),
  interestRate: percent.nullish(),
});
export const accountUpdate = z.object({
  id,
  name: text(60).optional(),
  interestRate: percent.nullish(),
  archived: z.boolean().optional(),
});
export const reconcileInput = z.object({
  accountId: id,
  actualBalance: moneyOrZero,
  date: isoDate,
});

// ---------- Tarjetas ----------
const day = z.number().int().min(1).max(31);
export const cardCreate = z.object({
  name: text(60),
  limit: money,
  currency: currency.default("MXN"),
  cutoffDay: day,
  paymentDueDay: day,
  interestRate: percent,
  openingBalance: moneyOrZero.default("0"),
});
export const cardUpdate = z.object({
  id,
  name: text(60).optional(),
  limit: money.optional(),
  cutoffDay: day.optional(),
  paymentDueDay: day.optional(),
  interestRate: percent.optional(),
  archived: z.boolean().optional(),
});

// ---------- Metas ----------
export const goalCreate = z.object({
  name: text(80),
  targetAmount: money,
  currentAmount: moneyOrZero.default("0"),
  deadline: isoDate.nullish(),
  accountId: optId,
});
export const goalUpdate = goalCreate.partial().extend({ id });
export const goalContribution = z.object({ id, amount: z.union([z.number(), z.string()]).transform(String) });

// ---------- Catálogos ----------
export const categoryInput = z.object({
  name: text(60),
  kind: z.enum(["INCOME", "EXPENSE"]),
  defaultBudget: moneyOrZero.nullish(),
  defaultFundSource: fundSource.default("OWN_CAPITAL"),
  isFixed: z.boolean().default(false),
});
export const categoryUpdate = categoryInput.partial().extend({ id, archived: z.boolean().optional() });
export const budgetInput = z.object({
  categoryId: id,
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  plannedAmount: moneyOrZero,
});
export const counterpartyInput = z.object({ name: text(60), isFamily: z.boolean().default(false) });
export const counterpartyUpdate = counterpartyInput.partial().extend({ id });
export const rateInput = z.object({ currency: z.enum(["USD", "EUR"]), rateToMXN: fxRate });
export const monthInput = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});
export const idInput = z.object({ id });
