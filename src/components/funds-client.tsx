"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { closeFundAction, createFundAction, reopenFundAction } from "@/actions/funds";
import { isoLocal, money } from "@/lib/format";

const input = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

export function NewFundForm({ people }: { people: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end"
      action={(fd) =>
        start(async () => {
          setError(null);
          const r = await createFundAction({
            name: fd.get("name"),
            counterpartyName: fd.get("owner"),
            expectedAmount: fd.get("expected") || null,
          });
          if (!r.ok) return setError(r.error);
          toast.success("Bolsa creada", { description: "Registra el depósito o el pago con Ctrl K → Bolsa." });
          (document.getElementById("new-fund") as HTMLFormElement | null)?.reset();
        })
      }
      id="new-fund"
    >
      <label className="flex flex-col gap-1.5"><span className="eyebrow">Para qué</span><input name="name" required maxLength={80} placeholder="Colegiatura diciembre" className={input} /></label>
      <label className="flex flex-col gap-1.5"><span className="eyebrow">De quién es el dinero</span><input name="owner" list="fund-people" required defaultValue={people.find((p) => p.name === "Papá")?.name} className={input} /></label>
      <label className="flex flex-col gap-1.5"><span className="eyebrow">Monto esperado (opcional)</span><input name="expected" inputMode="decimal" placeholder="34,268.58" className={`${input} num`} /></label>
      <button disabled={pending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{pending ? "Creando…" : "Crear bolsa"}</button>
      <datalist id="fund-people">{people.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      {error && <p role="alert" className="text-sm text-negative sm:col-span-4">{error}</p>}
    </form>
  );
}

export function CloseFundButton({ id, state, balance, owner }: { id: string; state: "BALANCED" | "UNUSED" | "OVERPAID"; balance: number; owner: string }) {
  const [pending, start] = useTransition();
  const run = (settle: "KEEP" | "ABSORB" | null) =>
    start(async () => {
      const r = await closeFundAction({ id, date: isoLocal(), settle });
      if (r.ok) toast.success("Bolsa cerrada");
      else toast.error(r.error);
    });

  const btn = "h-8 rounded-md border px-3 text-xs font-medium hover:bg-secondary disabled:opacity-50";
  if (state === "BALANCED") return <button disabled={pending} onClick={() => run(null)} className={btn}>Cerrar bolsa</button>;
  return (
    <details className="relative">
      <summary className={`${btn} inline-flex cursor-pointer list-none items-center`}>Cerrar con diferencia…</summary>
      <div className="absolute right-0 z-10 mt-2 w-72 rounded-md border bg-popover p-3 text-sm shadow-sm">
        {state === "UNUSED" ? (
          <>
            <p className="mb-3 text-muted-foreground">Quedan {money(balance)} de {owner}. Si se los devuelves, registra un pago de la bolsa. Si te los quedas:</p>
            <button disabled={pending} onClick={() => run("KEEP")} className={`${btn} w-full`}>Me lo quedo (cuenta como apoyo familiar)</button>
          </>
        ) : (
          <>
            <p className="mb-3 text-muted-foreground">Pagaste {money(-balance)} de más. Si {owner} te lo va a depositar, regístralo antes. Si lo pones tú:</p>
            <button disabled={pending} onClick={() => run("ABSORB")} className={`${btn} w-full`}>Lo absorbo yo (cuenta como mi gasto)</button>
          </>
        )}
      </div>
    </details>
  );
}

export function ReopenFundButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(async () => { const r = await reopenFundAction(id); if (!r.ok) toast.error(r.error); })} className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
      Reabrir
    </button>
  );
}
