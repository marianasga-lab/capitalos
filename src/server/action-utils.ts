import "server-only";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DomainError } from "./services/common";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Decimal → string y Date → ISO, para poder mandarlo a componentes cliente. */
type Plain<T> = T extends Prisma.Decimal
  ? string
  : T extends Date
    ? string
    : T extends (infer U)[]
      ? Plain<U>[]
      : T extends object
        ? { [K in keyof T]: Plain<T[K]> }
        : T;

export const toPlain = <T>(v: T): Plain<T> => JSON.parse(JSON.stringify(v ?? null));

/**
 * Valida la entrada, ejecuta y refresca la UI.
 * Los errores de negocio (DomainError) llegan tal cual al usuario; los
 * inesperados se registran en el servidor y se muestra un mensaje genérico.
 */
export async function runAction<S extends z.ZodType, T>(
  schema: S,
  raw: unknown,
  fn: (input: z.output<S>) => Promise<T>,
): Promise<ActionResult<Plain<T>>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    const first = flat.formErrors[0] ?? Object.values(flat.fieldErrors).flat()[0];
    return { ok: false, error: (first as string) ?? "Datos inválidos.", fieldErrors: flat.fieldErrors as Record<string, string[]> };
  }
  try {
    const data = await fn(parsed.data);
    revalidatePath("/", "layout");
    return { ok: true, data: toPlain(data) };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { ok: false, error: "El registro ya no existe." };
    }
    console.error("[CapitalOS] Error inesperado:", e);
    return { ok: false, error: "Algo salió mal al guardar. No se modificó nada." };
  }
}
