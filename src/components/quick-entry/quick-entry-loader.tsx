import { connection } from "next/server";
import { getEntryOptions } from "@/server/queries";
import { QuickEntryDialog } from "./quick-entry-dialog";

/** Carga cuentas, tarjetas, categorías y bolsas para el registro rápido. */
export async function QuickEntryLoader() {
  await connection();
  const options = await getEntryOptions();
  return <QuickEntryDialog options={options} />;
}
