/**
 * Descargas de respaldo:
 *   /api/export?formato=json                  → respaldo completo
 *   /api/export?formato=movimientos           → movimientos.csv (reimportable)
 *   /api/export?formato=tabla&tabla=account   → una tabla cruda en CSV
 *   /api/export?formato=plantilla             → ejemplo para importar
 */
import { db } from "@/lib/db";
import { CSV_COLUMNS, exportAll, exportTableCsv, exportTransactionsCsv } from "@/server/services/backup";
import { toCsv } from "@/lib/csv";
import { isoLocal } from "@/lib/format";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const formato = url.searchParams.get("formato") ?? "json";
  const stamp = isoLocal();
  const file = (body: string, name: string, type: string) =>
    new Response(body, {
      headers: {
        "Content-Type": `${type}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });

  try {
    if (formato === "json") return file(JSON.stringify(await exportAll(db), null, 2), `capitalos-respaldo-${stamp}.json`, "application/json");
    if (formato === "movimientos") return file(await exportTransactionsCsv(db), `capitalos-movimientos-${stamp}.csv`, "text/csv");
    if (formato === "plantilla") {
      const example = [
        { fecha: "05/11/2026", tipo: "ingreso", monto: "8000", descripcion: "Pago proyecto", categoria: "Freelance", cuenta: "Banco Principal", fuente: "propio" },
        { fecha: "06/11/2026", tipo: "gasto", monto: "9500", descripcion: "Renta", categoria: "Renta", cuenta: "Banco Principal", gasto_fijo: "si" },
        { fecha: "07/11/2026", tipo: "gasto", monto: "1200", descripcion: "Cena compartida", categoria: "Salidas", tarjeta: "Tarjeta Oro", fuente: "compartido", persona: "Padi", mi_parte: "600" },
        { fecha: "08/11/2026", tipo: "me_deben", monto: "350", descripcion: "Medicinas", categoria: "Salud", cuenta: "Banco Principal", persona: "Papá" },
        { fecha: "09/11/2026", tipo: "traspaso", monto: "100", descripcion: "Cambio de dólares", cuenta: "Efectivo dólares", cuenta_destino: "Efectivo pesos", monto_destino: "1830" },
        { fecha: "10/11/2026", tipo: "bolsa_deposito", monto: "33300", descripcion: "Papá: colegiatura", cuenta: "Banco Principal", bolsa: "Colegiatura noviembre" },
        { fecha: "11/11/2026", tipo: "bolsa_pago", monto: "34268.58", descripcion: "Colegiatura", tarjeta: "Tarjeta Oro", bolsa: "Colegiatura noviembre" },
      ];
      return file(toCsv(example, [...CSV_COLUMNS]), "capitalos-plantilla.csv", "text/csv");
    }
    if (formato === "tabla") {
      const tabla = url.searchParams.get("tabla") ?? "";
      return file(await exportTableCsv(db, tabla), `capitalos-${tabla}-${stamp}.csv`, "text/csv");
    }
    return new Response("Formato desconocido", { status: 400 });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Error", { status: 400 });
  }
}
