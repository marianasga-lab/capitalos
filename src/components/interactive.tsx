"use client";
import { useTransition } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { collectTransactionAction, deleteTransactionAction } from "@/actions/transactions";
import { money, shortDate, type CurrencyCode } from "@/lib/format";
import type { PlainTx } from "@/server/queries";
import { useQuickEntry, type EntryMode } from "./quick-entry/context";

/** Botón "Cobrado": liquida lo pendiente con un clic. */
export function CollectButton({ transactionId, label = "Cobrado" }: { transactionId: string; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await collectTransactionAction({ transactionId });
          if (r.ok) toast.success("Marcado como cobrado", { description: "El dinero regresó a tu cuenta de débito." });
          else toast.error(r.error);
        })
      }
      className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-50"
    >
      <Check className="size-3.5" aria-hidden />
      {pending ? "…" : label}
    </button>
  );
}

export function OpenEntryButton({ mode, fundId, children, className }: { mode?: EntryMode; fundId?: string; children: React.ReactNode; className?: string }) {
  const { openEntry } = useQuickEntry();
  return (
    <button onClick={() => openEntry(mode, { fundId })} className={className ?? "text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"}>
      {children}
    </button>
  );
}

const TYPE_LABEL: Record<PlainTx["type"], string> = {
  INCOME: "Ingreso",
  EXPENSE: "Gasto",
  TRANSFER: "Traspaso",
  REIMBURSABLE_EXPENSE: "Me deben",
  FUND_DEPOSIT: "Bolsa · depósito",
  FUND_PAYMENT: "Bolsa · pago",
};

/** Signo según el efecto en MI dinero: + entra, − sale, ↔ neutro. */
function signed(t: PlainTx) {
  const cur = t.currency as CurrencyCode;
  if (t.type === "INCOME") return { text: money(t.amount, cur, { sign: true }), tone: "text-positive" };
  if (t.type === "EXPENSE") return { text: money(-(t.myShare ?? t.amount), cur), tone: "" };
  return { text: money(t.amount, cur), tone: "text-muted-foreground" };
}

export function TransactionList({ rows, compact = false }: { rows: PlainTx[]; compact?: boolean }) {
  const { editEntry } = useQuickEntry();
  const [pending, start] = useTransition();

  const remove = (t: PlainTx) => {
    if (!confirm(`¿Borrar “${t.description}”? Los saldos se ajustan solos.`)) return;
    start(async () => {
      const r = await deleteTransactionAction(t.id);
      if (r.ok) toast.success("Movimiento borrado");
      else toast.error(r.error);
    });
  };

  return (
    <ul className={`divide-y ${pending ? "opacity-60" : ""}`}>
      {rows.map((t) => {
        const s = signed(t);
        const settlement = !!t.fundId && !t.accountId && !t.creditCardId;
        const pendingCollect = (t.type === "REIMBURSABLE_EXPENSE" || t.fundSource === "SHARED_SPLIT") && t.status === "PENDING";
        return (
          <li key={t.id} className="group grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-x-3 py-3">
            <span className="num text-xs text-muted-foreground">{shortDate(t.date)}</span>
            <div className="min-w-0">
              <p className="truncate text-sm">{t.description}</p>
              <p className="truncate text-xs text-muted-foreground">
                {TYPE_LABEL[t.type]}
                {t.fundSource === "ALLOWANCE_FAMILY" && t.type !== "FUND_DEPOSIT" && t.type !== "FUND_PAYMENT" && " · apoyo familiar"}
                {t.fundSource === "SHARED_SPLIT" && ` · compartido con ${t.person}`}
                {t.type === "REIMBURSABLE_EXPENSE" && t.person && ` · ${t.person}`}
                {!compact && t.category && ` · ${t.category}`}
                {t.source && ` · ${t.source}${t.destination ? ` → ${t.destination}` : ""}`}
                {t.status === "PAID" && " · cobrado"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {pendingCollect && <CollectButton transactionId={t.id} />}
              <span className={`num text-right text-sm font-medium ${s.tone}`}>{s.text}</span>
              {!compact && !settlement && (
                <span className="flex gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                  <button onClick={() => editEntry(t)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" title="Editar">
                    <Pencil className="size-3.5" aria-hidden /><span className="sr-only">Editar {t.description}</span>
                  </button>
                  <button onClick={() => remove(t)} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-negative" title="Borrar">
                    <Trash2 className="size-3.5" aria-hidden /><span className="sr-only">Borrar {t.description}</span>
                  </button>
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
