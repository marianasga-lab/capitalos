/**
 * Respaldo y portabilidad.
 *  - exportAll / restoreAll: JSON completo, restauración exacta (incluye abonos y saldos).
 *  - exportTransactionsCsv / importTransactionsCsv: movimientos en un formato
 *    legible, editable en Excel e importable (los saldos se recalculan).
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { csvToObjects, toCsv } from "@/lib/csv";
import { transactionInput, type TransactionInput } from "@/lib/validation";
import { DomainError } from "./common";
import { createTransaction } from "./transactions";

export const BACKUP_APP = "CapitalOS";
export const BACKUP_VERSION = 1;

/** Orden de inserción (respeta llaves foráneas). Al borrar se usa al revés. */
const TABLES = [
  "exchangeRate",
  "account",
  "creditCard",
  "counterparty",
  "fund",
  "category",
  "budget",
  "savingsGoal",
  "monthlySnapshot",
  "transaction",
  "reimbursementPayment",
] as const;
type Table = (typeof TABLES)[number];

const MODEL_NAME: Record<Table, string> = {
  exchangeRate: "ExchangeRate", account: "Account", creditCard: "CreditCard", counterparty: "Counterparty",
  fund: "Fund", category: "Category", budget: "Budget", savingsGoal: "SavingsGoal",
  monthlySnapshot: "MonthlySnapshot", transaction: "Transaction", reimbursementPayment: "ReimbursementPayment",
};

// Campos por modelo, desde el esquema de Prisma: así el respaldo sigue
// funcionando si se agregan columnas.
const FIELDS = Object.fromEntries(
  Prisma.dmmf.datamodel.models.map((m) => [m.name, m.fields.filter((f) => f.kind !== "object")]),
);

type Delegate = { findMany: (a?: object) => Promise<object[]>; deleteMany: () => Promise<unknown>; createMany: (a: { data: object[] }) => Promise<unknown> };
const delegate = (db: Prisma.TransactionClient | PrismaClient, t: Table) => (db as unknown as Record<Table, Delegate>)[t];

export async function exportAll(db: PrismaClient) {
  const data: Record<string, object[]> = {};
  for (const t of TABLES) data[t] = await delegate(db, t).findMany();
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: Object.fromEntries(TABLES.map((t) => [t, data[t].length])),
    data: JSON.parse(JSON.stringify(data)) as Record<Table, Record<string, unknown>[]>,
  };
}

/** Convierte valores del JSON a los tipos de Prisma (fechas y decimales). */
function revive(table: Table, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS[MODEL_NAME[table]]) {
    const v = row[f.name];
    if (v === undefined) continue; // usa el default del esquema
    if (v === null) { out[f.name] = null; continue; }
    if (f.type === "DateTime") {
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) throw new DomainError(`Fecha inválida en ${table}.${f.name}`);
      out[f.name] = d;
    } else if (f.type === "Decimal") out[f.name] = new Prisma.Decimal(String(v));
    else out[f.name] = v;
  }
  return out;
}

/**
 * Reemplaza TODOS los datos por los del respaldo, en una sola transacción:
 * si algo falla, no se borra nada.
 */
export async function restoreAll(db: PrismaClient, raw: unknown) {
  const file = raw as { app?: string; version?: number; data?: Record<string, unknown> };
  if (!file || file.app !== BACKUP_APP || !file.data) throw new DomainError("Este archivo no es un respaldo de CapitalOS.");
  if (file.version !== BACKUP_VERSION) throw new DomainError(`Versión de respaldo no compatible (${file.version}).`);
  for (const t of TABLES) {
    if (!Array.isArray(file.data[t])) throw new DomainError(`Al respaldo le falta la tabla "${t}".`);
  }
  const data = file.data as Record<Table, Record<string, unknown>[]>;

  return db.$transaction(
    async (tx) => {
      for (const t of [...TABLES].reverse()) await delegate(tx, t).deleteMany();
      for (const t of TABLES) {
        const rows = data[t].map((r) => revive(t, r));
        if (rows.length) await delegate(tx, t).createMany({ data: rows });
      }
      return Object.fromEntries(TABLES.map((t) => [t, data[t].length])) as Record<Table, number>;
    },
    { timeout: 60_000 },
  );
}

// ---------- CSV de movimientos ----------

const TYPE_OUT: Record<string, string> = {
  INCOME: "ingreso", EXPENSE: "gasto", TRANSFER: "traspaso", REIMBURSABLE_EXPENSE: "me_deben",
  FUND_DEPOSIT: "bolsa_deposito", FUND_PAYMENT: "bolsa_pago",
};
const TYPE_IN: Record<string, TransactionInput["type"]> = {
  ...Object.fromEntries(Object.entries(TYPE_OUT).map(([k, v]) => [v, k as TransactionInput["type"]])),
  ...Object.fromEntries(Object.keys(TYPE_OUT).map((k) => [k.toLowerCase(), k as TransactionInput["type"]])),
  reembolsable: "REIMBURSABLE_EXPENSE", transferencia: "TRANSFER",
};
const SOURCE_OUT = { OWN_CAPITAL: "propio", ALLOWANCE_FAMILY: "familiar", SHARED_SPLIT: "compartido" } as const;
const SOURCE_IN: Record<string, TransactionInput["fundSource"]> = {
  propio: "OWN_CAPITAL", mio: "OWN_CAPITAL", familiar: "ALLOWANCE_FAMILY", apoyo_familiar: "ALLOWANCE_FAMILY",
  compartido: "SHARED_SPLIT", own_capital: "OWN_CAPITAL", allowance_family: "ALLOWANCE_FAMILY", shared_split: "SHARED_SPLIT",
};

export const CSV_COLUMNS = [
  "fecha", "tipo", "monto", "moneda", "descripcion", "categoria", "cuenta", "tarjeta",
  "cuenta_destino", "monto_destino", "fuente", "persona", "mi_parte", "bolsa", "gasto_fijo", "tipo_cambio", "notas",
] as const;

export async function exportTransactionsCsv(db: PrismaClient) {
  const rows = await db.transaction.findMany({
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: { account: true, toAccount: true, creditCard: true, counterparty: true, fund: true },
  });
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return toCsv(
    rows.map((t) => ({
      fecha: ymd(t.date),
      tipo: TYPE_OUT[t.type],
      monto: t.amount.toFixed(2),
      moneda: t.currency,
      descripcion: t.description,
      categoria: t.category,
      cuenta: t.account?.name ?? "",
      tarjeta: t.creditCard?.name ?? "",
      cuenta_destino: t.toAccount?.name ?? "",
      monto_destino: t.toAmount?.toFixed(2) ?? "",
      fuente: SOURCE_OUT[t.fundSource],
      persona: t.counterparty?.name ?? "",
      mi_parte: t.myShareAmount?.toFixed(2) ?? "",
      bolsa: t.fund?.name ?? "",
      gasto_fijo: t.isFixedExpense ? "si" : "",
      tipo_cambio: t.currency === "MXN" ? "" : t.fxToMXN.toString(),
      notas: t.notes ?? "",
    })),
    [...CSV_COLUMNS],
  );
}

export type ImportReport = {
  total: number;
  valid: number;
  errors: { line: number; message: string }[];
  imported: number;
  preview: { line: number; date: string; type: string; amount: string; description: string }[];
};

/** Acepta 2026-11-05, 05/11/2026 y 5/11/26 (día/mes/año, formato de México). */
function parseDateCell(v: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return v;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/**
 * Importa movimientos desde CSV. Con `commit: false` solo valida (vista previa).
 * Con `commit: true` guarda TODO o NADA: si una fila falla, no se guarda ninguna.
 */
export async function importTransactionsCsv(db: PrismaClient, text: string, opts: { commit: boolean }): Promise<ImportReport> {
  const { headers, records } = csvToObjects(text);
  for (const req of ["fecha", "tipo", "monto"]) {
    if (!headers.includes(req)) throw new DomainError(`Falta la columna "${req}". Descarga la plantilla para ver el formato.`);
  }
  if (records.length === 0) throw new DomainError("El archivo no tiene movimientos.");
  if (records.length > 5000) throw new DomainError("Máximo 5,000 movimientos por archivo.");

  const [accounts, cards, funds] = await Promise.all([
    db.account.findMany({ where: { isSystem: false } }),
    db.creditCard.findMany(),
    db.fund.findMany(),
  ]);
  const byName = <T extends { name: string }>(list: T[]) => new Map(list.map((x) => [x.name.trim().toLowerCase(), x]));
  const accMap = byName(accounts), cardMap = byName(cards), fundMap = byName(funds);

  const errors: ImportReport["errors"] = [];
  const parsed: { line: number; data: ReturnType<typeof transactionInput.parse> }[] = [];

  for (const { line, values: v } of records) {
    const fail = (message: string) => errors.push({ line, message });
    const type = TYPE_IN[v.tipo?.toLowerCase().replace(/\s+/g, "_")];
    if (!type) { fail(`Tipo "${v.tipo}" no reconocido. Usa: ${Object.values(TYPE_OUT).join(", ")}.`); continue; }

    const find = (map: Map<string, { id: string }>, name: string | undefined, what: string) => {
      if (!name) return null;
      const hit = map.get(name.trim().toLowerCase());
      if (!hit) { fail(`No existe ${what} "${name}". Créala primero en Ajustes.`); return undefined; }
      return hit.id;
    };
    const accountId = find(accMap, v.cuenta, "la cuenta");
    const creditCardId = find(cardMap, v.tarjeta, "la tarjeta");
    const toAccountId = find(accMap, v.cuenta_destino, "la cuenta");
    const fundId = find(fundMap, v.bolsa, "la bolsa");
    if ([accountId, creditCardId, toAccountId, fundId].includes(undefined)) continue;

    const result = transactionInput.safeParse({
      type,
      date: parseDateCell(v.fecha ?? ""),
      amount: v.monto,
      description: v.descripcion || v.categoria || TYPE_OUT[type],
      category: v.categoria || "Otros",
      fundSource: SOURCE_IN[(v.fuente ?? "").toLowerCase().replace(/\s+/g, "_")] ?? "OWN_CAPITAL",
      isFixedExpense: ["si", "sí", "true", "1", "x"].includes((v.gasto_fijo ?? "").toLowerCase()),
      accountId, creditCardId, toAccountId, fundId,
      toAmount: v.monto_destino || null,
      myShareAmount: v.mi_parte || null,
      fxToMXN: v.tipo_cambio || null,
      counterpartyName: v.persona || null,
      notes: v.notas || null,
    });
    if (!result.success) {
      const issue = result.error.issues[0];
      fail(`${issue.path.join(".") || "fila"}: ${issue.message}`);
      continue;
    }
    parsed.push({ line, data: result.data });
  }

  const report: ImportReport = {
    total: records.length,
    valid: parsed.length,
    errors,
    imported: 0,
    preview: parsed.slice(0, 8).map(({ line, data }) => ({ line, date: data.date, type: TYPE_OUT[data.type], amount: data.amount, description: data.description })),
  };
  if (!opts.commit || errors.length) return report;

  // Todo o nada. Si una regla de negocio falla, se reporta la línea.
  await db.$transaction(
    async (tx) => {
      for (const { line, data } of parsed) {
        try {
          await createTransaction(tx, data);
        } catch (e) {
          throw new DomainError(`Línea ${line}: ${e instanceof Error ? e.message : "error"}. No se importó nada.`);
        }
      }
    },
    { timeout: 120_000 },
  );
  report.imported = parsed.length;
  return report;
}

/** CSV de una tabla cruda (para análisis en Excel). */
export async function exportTableCsv(db: PrismaClient, table: string) {
  if (!(TABLES as readonly string[]).includes(table)) throw new DomainError("Tabla desconocida.");
  const rows = (await delegate(db, table as Table).findMany()) as Record<string, unknown>[];
  const cols = FIELDS[MODEL_NAME[table as Table]].map((f) => f.name);
  return toCsv(JSON.parse(JSON.stringify(rows)), cols);
}

export const EXPORTABLE_TABLES = TABLES;
