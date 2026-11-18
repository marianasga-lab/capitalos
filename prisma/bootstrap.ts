/**
 * Arranque seguro para producción (corre en cada deploy).
 * Crea solo lo que falta: tipos de cambio, cuenta "Cuentas por Cobrar" y
 * categorías base. NUNCA borra ni modifica datos existentes.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const EXPENSE: [string, number, boolean, "OWN_CAPITAL" | "ALLOWANCE_FAMILY"][] = [
  ["Renta", 0, true, "OWN_CAPITAL"], ["Súper", 0, false, "OWN_CAPITAL"], ["Salidas", 0, false, "OWN_CAPITAL"],
  ["Transporte", 0, false, "OWN_CAPITAL"], ["Teléfono", 0, true, "OWN_CAPITAL"], ["Suscripciones", 0, true, "OWN_CAPITAL"],
  ["Suministros", 0, true, "OWN_CAPITAL"], ["Salud", 0, false, "OWN_CAPITAL"], ["Educación", 0, false, "OWN_CAPITAL"],
  ["Viajes", 0, false, "OWN_CAPITAL"], ["Regalos", 0, false, "OWN_CAPITAL"], ["Personal", 0, false, "OWN_CAPITAL"],
];
const INCOME = ["Sueldo", "Freelance", "Apoyo familiar", "Intereses", "Reembolsos"];

async function main() {
  for (const [currency, rate] of [["MXN", 1], ["USD", 18.5], ["EUR", 21.5]] as const) {
    await db.exchangeRate.upsert({ where: { currency }, create: { currency, rateToMXN: rate }, update: {} });
  }
  if (!(await db.account.findFirst({ where: { type: "RECEIVABLE", isSystem: true } }))) {
    await db.account.create({ data: { name: "Cuentas por Cobrar", type: "RECEIVABLE", currency: "MXN", isSystem: true } });
  }
  if ((await db.category.count()) === 0) {
    for (const [name, , isFixed, fs] of EXPENSE) await db.category.create({ data: { name, kind: "EXPENSE", isFixed, defaultFundSource: fs } });
    for (const name of INCOME) {
      await db.category.create({ data: { name, kind: "INCOME", defaultFundSource: name === "Apoyo familiar" ? "ALLOWANCE_FAMILY" : "OWN_CAPITAL" } });
    }
  }
  console.log("CapitalOS: base lista.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
