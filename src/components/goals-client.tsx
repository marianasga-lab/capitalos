"use client";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { contributeToGoalAction, createGoalAction, deleteGoalAction } from "@/actions/catalog";

const input = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";

export function NewGoalForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      id="new-goal"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto] lg:items-end"
      action={(fd) =>
        start(async () => {
          setError(null);
          const r = await createGoalAction({
            name: fd.get("name"),
            targetAmount: fd.get("target"),
            currentAmount: fd.get("current") || "0",
            deadline: fd.get("deadline") || null,
            accountId: fd.get("account") || null,
          });
          if (!r.ok) return setError(r.error);
          toast.success("Meta creada");
          (document.getElementById("new-goal") as HTMLFormElement | null)?.reset();
        })
      }
    >
      <label className="flex flex-col gap-1.5"><span className="eyebrow">Meta</span><input name="name" required maxLength={80} placeholder="Fondo de emergencia" className={input} /></label>
      <label className="flex flex-col gap-1.5"><span className="eyebrow">Objetivo</span><input name="target" required inputMode="decimal" placeholder="90,000" className={`${input} num`} /></label>
      <label className="flex flex-col gap-1.5"><span className="eyebrow">Ya tienes</span><input name="current" inputMode="decimal" placeholder="0" className={`${input} num`} /></label>
      <label className="flex flex-col gap-1.5"><span className="eyebrow">Fecha límite</span><input name="deadline" type="date" className={`${input} num`} /></label>
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Cuenta (opcional)</span>
        <select name="account" className={input} defaultValue="">
          <option value="">Ninguna</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <button disabled={pending} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{pending ? "Creando…" : "Crear meta"}</button>
      {error && <p role="alert" className="text-sm text-negative sm:col-span-2 lg:col-span-6">{error}</p>}
    </form>
  );
}

export function GoalActions({ id, name }: { id: string; name: string }) {
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();
  const run = (sign: 1 | -1) =>
    start(async () => {
      const clean = amount.replace(/,/g, "").trim();
      if (!clean || Number(clean) <= 0) {
        toast.error("Escribe un monto.");
        return;
      }
      const r = await contributeToGoalAction({ id, amount: sign === 1 ? clean : `-${clean}` });
      if (r.ok) { toast.success(sign === 1 ? "Aportación registrada" : "Retiro registrado"); setAmount(""); }
      else toast.error(r.error);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`amt-${id}`}>Monto para {name}</label>
      <input id={`amt-${id}`} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Monto" className="num h-8 w-28 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring" />
      <button disabled={pending} onClick={() => run(1)} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50">Aportar</button>
      <button disabled={pending} onClick={() => run(-1)} className="h-8 rounded-md border px-3 text-xs font-medium hover:bg-secondary disabled:opacity-50">Retirar</button>
      <button
        disabled={pending}
        onClick={() => confirm(`¿Borrar la meta “${name}”?`) && start(async () => { const r = await deleteGoalAction(id); if (!r.ok) toast.error(r.error); })}
        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-negative"
        title="Borrar meta"
      >
        <Trash2 className="size-3.5" aria-hidden /><span className="sr-only">Borrar meta {name}</span>
      </button>
    </div>
  );
}
