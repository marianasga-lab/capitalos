"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { runAction } from "@/server/action-utils";
import { importTransactionsCsv, restoreAll } from "@/server/services/backup";
import { DomainError } from "@/server/services/common";

const MAX = 10 * 1024 * 1024;
const fileForm = z.custom<FormData>((v) => v instanceof FormData);

async function readFile(fd: FormData, ext: string) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new DomainError("Elige un archivo.");
  if (file.size > MAX) throw new DomainError("El archivo pesa más de 10 MB.");
  if (!file.name.toLowerCase().endsWith(ext)) throw new DomainError(`El archivo debe ser ${ext}.`);
  return file.text();
}

/** Restaura un respaldo JSON. Reemplaza TODOS los datos: exige confirmación escrita. */
export async function restoreBackupAction(fd: FormData) {
  return runAction(fileForm, fd, async (form) => {
    if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "REEMPLAZAR") {
      throw new DomainError('Escribe REEMPLAZAR para confirmar que se borrarán los datos actuales.');
    }
    let json: unknown;
    try {
      json = JSON.parse(await readFile(form, ".json"));
    } catch (e) {
      if (e instanceof DomainError) throw e;
      throw new DomainError("El archivo no es un JSON válido.");
    }
    return restoreAll(db, json);
  });
}

/** Importa movimientos desde CSV. `commit=0` solo valida (vista previa). */
export async function importCsvAction(fd: FormData) {
  return runAction(fileForm, fd, async (form) =>
    importTransactionsCsv(db, await readFile(form, ".csv"), { commit: form.get("commit") === "1" }),
  );
}
