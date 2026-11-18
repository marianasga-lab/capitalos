"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createAccountAction, createCardAction, reconcileAccountAction, updateAccountAction, updateCardAction } from "@/actions/accounts";
import { closeMonthAction, setExchangeRateAction } from "@/actions/catalog";
import { importCsvAction, restoreBackupAction } from "@/actions/backup";
import { isoLocal, money, monthLabel, type CurrencyCode } from "@/lib/format";
import type { Settings } from "@/server/queries";
import type { ImportReport } from "@/server/services/backup";

export const inputCls = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25";
const btn = "h-9 shrink-0 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50";
const btnGhost = "h-8 shrink-0 rounded-md border px-3 text-xs font-medium hover:bg-secondary disabled:opacity-50";

function L({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`flex flex-col gap-1.5 ${className}`}><span className="eyebrow">{label}</span>{children}</label>;
}

/** Ejecuta una acción y muestra el resultado. */
function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { toast.success(success); after?.(); }
      else toast.error(r.error);
    });
  return { pending, run };
}

// ---------- Tipos de cambio ----------
export function RatesForm({ rates }: { rates: Settings["rates"] }) {
  const { pending, run } = useAction();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      action={(fd) =>
        run(async () => {
          const usd = await setExchangeRateAction({ currency: "USD", rateToMXN: fd.get("USD") });
          if (!usd.ok) return usd;
          return setExchangeRateAction({ currency: "EUR", rateToMXN: fd.get("EUR") });
        }, "Tipos de cambio guardados")
      }
    >
      <L label="1 dólar (USD) en pesos"><input name="USD" required inputMode="decimal" defaultValue={rates.USD?.rate} className={`${inputCls} num`} /></L>
      <L label="1 euro (EUR) en pesos"><input name="EUR" required inputMode="decimal" defaultValue={rates.EUR?.rate} className={`${inputCls} num`} /></L>
      <button disabled={pending} className={btn}>Guardar</button>
    </form>
  );
}

// ---------- Cuentas ----------
const TYPE_NAME = { CASH: "Efectivo", DEBIT: "Banco / débito", INVESTMENT: "Inversión" } as const;

export function AccountRow({ a }: { a: Settings["accounts"][number] }) {
  const { pending, run } = useAction();
  const [real, setReal] = useState("");
  return (
    <li className={`grid gap-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center ${a.archived ? "opacity-50" : ""}`}>
      <div className="flex items-baseline justify-between gap-3 sm:justify-start sm:gap-6">
        <span className="text-sm">
          {a.name}
          <span className="block text-xs text-muted-foreground">{TYPE_NAME[a.type as keyof typeof TYPE_NAME]} · {a.currency}{a.archived && " · archivada"}</span>
        </span>
        <span className="num text-sm font-medium">{money(a.balance, a.currency as CurrencyCode)}</span>
      </div>
      {!a.archived && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`real-${a.id}`}>Saldo real de {a.name}</label>
          <input id={`real-${a.id}`} value={real} onChange={(e) => setReal(e.target.value)} inputMode="decimal" placeholder="Saldo real" className="num h-8 w-28 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring" />
          <button
            disabled={pending || !real}
            onClick={() => run(() => reconcileAccountAction({ accountId: a.id, actualBalance: real, date: isoLocal() }), "Saldo conciliado", () => setReal(""))}
            className={btnGhost}
            title="Registra la diferencia como ajuste (no cuenta como ingreso ni gasto)"
          >
            Conciliar
          </button>
          <button disabled={pending} onClick={() => run(() => updateAccountAction({ id: a.id, archived: true }), "Cuenta archivada")} className={btnGhost}>Archivar</button>
        </div>
      )}
      {a.archived && (
        <button disabled={pending} onClick={() => run(() => updateAccountAction({ id: a.id, archived: false }), "Cuenta reactivada")} className={`${btnGhost} justify-self-start`}>Reactivar</button>
      )}
    </li>
  );
}

export function NewAccountForm() {
  const { pending, run } = useAction();
  const [type, setType] = useState("DEBIT");
  return (
    <form
      id="new-account"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_0.7fr_1fr_0.8fr_auto] lg:items-end"
      action={(fd) =>
        run(
          () => createAccountAction({
            name: fd.get("name"), type: fd.get("type"), currency: fd.get("currency"),
            openingBalance: fd.get("opening") || "0", interestRate: fd.get("rate") || null,
          }),
          "Cuenta creada",
          () => (document.getElementById("new-account") as HTMLFormElement | null)?.reset(),
        )
      }
    >
      <L label="Nombre"><input name="name" required maxLength={60} placeholder="BBVA Nómina" className={inputCls} /></L>
      <L label="Tipo">
        <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
          {Object.entries(TYPE_NAME).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </L>
      <L label="Moneda">
        <select name="currency" className={inputCls} defaultValue="MXN"><option>MXN</option><option>USD</option><option>EUR</option></select>
      </L>
      <L label="Saldo actual"><input name="opening" inputMode="decimal" placeholder="0.00" className={`${inputCls} num`} /></L>
      <L label="Tasa anual %"><input name="rate" inputMode="decimal" placeholder={type === "INVESTMENT" ? "10.5" : "—"} disabled={type !== "INVESTMENT"} className={`${inputCls} num`} /></L>
      <button disabled={pending} className={btn}>Agregar</button>
    </form>
  );
}

// ---------- Tarjetas ----------
export function CardRow({ c }: { c: Settings["cards"][number] }) {
  const { pending, run } = useAction();
  return (
    <li className={`py-3 ${c.archived ? "opacity-50" : ""}`}>
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.9fr_0.6fr_0.6fr_0.7fr_auto] lg:items-end"
        action={(fd) =>
          run(() => updateCardAction({
            id: c.id, name: fd.get("name"), limit: fd.get("limit"),
            cutoffDay: Number(fd.get("cutoff")), paymentDueDay: Number(fd.get("due")), interestRate: fd.get("rate"),
          }), "Tarjeta actualizada")
        }
      >
        <L label="Tarjeta"><input name="name" defaultValue={c.name} required className={inputCls} /></L>
        <L label="Límite"><input name="limit" defaultValue={c.limit} inputMode="decimal" required className={`${inputCls} num`} /></L>
        <L label="Día de corte"><input name="cutoff" type="number" min={1} max={31} defaultValue={c.cutoffDay} required className={`${inputCls} num`} /></L>
        <L label="Día de pago"><input name="due" type="number" min={1} max={31} defaultValue={c.paymentDueDay} required className={`${inputCls} num`} /></L>
        <L label="CAT anual %"><input name="rate" defaultValue={+(c.interestRate * 100).toFixed(2)} inputMode="decimal" required className={`${inputCls} num`} /></L>
        <div className="flex gap-2">
          <button disabled={pending} className={btnGhost}>Guardar</button>
          <button type="button" disabled={pending} onClick={() => run(() => updateCardAction({ id: c.id, archived: !c.archived }), c.archived ? "Tarjeta reactivada" : "Tarjeta archivada")} className={btnGhost}>
            {c.archived ? "Reactivar" : "Archivar"}
          </button>
        </div>
      </form>
      <p className="num mt-1.5 text-xs text-muted-foreground">Deuda actual {money(c.debt)}</p>
    </li>
  );
}

export function NewCardForm() {
  const { pending, run } = useAction();
  return (
    <form
      id="new-card"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.9fr_0.6fr_0.6fr_0.7fr_0.9fr_auto] lg:items-end"
      action={(fd) =>
        run(
          () => createCardAction({
            name: fd.get("name"), limit: fd.get("limit"), cutoffDay: Number(fd.get("cutoff")),
            paymentDueDay: Number(fd.get("due")), interestRate: fd.get("rate"), openingBalance: fd.get("opening") || "0",
          }),
          "Tarjeta agregada",
          () => (document.getElementById("new-card") as HTMLFormElement | null)?.reset(),
        )
      }
    >
      <L label="Tarjeta"><input name="name" required placeholder="Banamex Oro" className={inputCls} /></L>
      <L label="Límite"><input name="limit" required inputMode="decimal" className={`${inputCls} num`} /></L>
      <L label="Día de corte"><input name="cutoff" type="number" min={1} max={31} required className={`${inputCls} num`} /></L>
      <L label="Día de pago"><input name="due" type="number" min={1} max={31} required className={`${inputCls} num`} /></L>
      <L label="CAT anual %"><input name="rate" required inputMode="decimal" placeholder="65" className={`${inputCls} num`} /></L>
      <L label="Deuda actual"><input name="opening" inputMode="decimal" placeholder="0.00" className={`${inputCls} num`} /></L>
      <button disabled={pending} className={btn}>Agregar</button>
    </form>
  );
}

// ---------- Cierre de mes ----------
export function CloseMonthForm({ period }: { period: { year: number; month: number } }) {
  const { pending, run } = useAction();
  const prev = period.month === 1 ? { year: period.year - 1, month: 12 } : { year: period.year, month: period.month - 1 };
  const options = [period, prev];
  const [sel, setSel] = useState(`${period.year}-${period.month}`);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <L label="Mes" className="min-w-48">
        <select value={sel} onChange={(e) => setSel(e.target.value)} className={inputCls}>
          {options.map((o) => <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`} className="capitalize">{monthLabel(o.year, o.month)}</option>)}
        </select>
      </L>
      <button
        disabled={pending}
        onClick={() => {
          const [year, month] = sel.split("-").map(Number);
          run(() => closeMonthAction({ year, month }), `Mes cerrado: ${monthLabel(year, month)}`);
        }}
        className={btn}
      >
        Cerrar mes
      </button>
    </div>
  );
}

// ---------- Respaldo ----------
export function RestoreForm() {
  const { pending, run } = useAction();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_0.8fr_auto] sm:items-end"
      action={(fd) => {
        if (!confirm("Esto BORRA todos tus datos actuales y los reemplaza por los del respaldo. ¿Continuar?")) return;
        run(() => restoreBackupAction(fd), "Respaldo restaurado");
      }}
    >
      <L label="Respaldo (.json)"><input name="file" type="file" accept=".json,application/json" required className="text-sm file:mr-3 file:h-9 file:rounded-md file:border file:bg-card file:px-3 file:text-sm" /></L>
      <L label='Escribe "REEMPLAZAR"'><input name="confirm" required autoComplete="off" className={inputCls} /></L>
      <button disabled={pending} className="h-9 rounded-md border border-negative/50 px-4 text-sm font-medium text-negative hover:bg-negative/5 disabled:opacity-50">Restaurar</button>
    </form>
  );
}

export function ImportCsvForm() {
  const [pending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = (commit: boolean) =>
    start(async () => {
      if (!file) return;
      setError(null);
      const fd = new FormData();
      fd.set("file", file);
      fd.set("commit", commit ? "1" : "0");
      const r = await importCsvAction(fd);
      if (!r.ok) { setError(r.error); setReport(null); return; }
      setReport(r.data as unknown as ImportReport);
      if (commit) toast.success(`${r.data.imported} movimientos importados`);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <L label="Movimientos (.csv)">
          <input type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReport(null); setError(null); }} className="text-sm file:mr-3 file:h-9 file:rounded-md file:border file:bg-card file:px-3 file:text-sm" />
        </L>
        <button disabled={!file || pending} onClick={() => send(false)} className={btnGhost + " h-9"}>{pending ? "Revisando…" : "Revisar archivo"}</button>
      </div>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      {report && (
        <div className="rounded-md border p-4 text-sm">
          {report.imported > 0 ? (
            <p className="text-positive">✓ Se importaron {report.imported} movimientos. Los saldos se actualizaron.</p>
          ) : (
            <>
              <p className="mb-2"><span className="font-medium">{report.valid}</span> de {report.total} filas están listas{report.errors.length > 0 && <>, <span className="text-negative">{report.errors.length} con errores</span></>}.</p>
              {report.errors.length > 0 && (
                <ul className="mb-3 max-h-48 list-inside list-disc overflow-y-auto text-negative">
                  {report.errors.slice(0, 50).map((e) => <li key={e.line}>Línea {e.line}: {e.message}</li>)}
                </ul>
              )}
              {report.preview.length > 0 && (
                <table className="num mb-3 w-full text-xs">
                  <tbody>
                    {report.preview.map((p) => (
                      <tr key={p.line} className="border-b last:border-0">
                        <td className="py-1 pr-2 text-muted-foreground">{p.date}</td><td className="py-1 pr-2">{p.type}</td>
                        <td className="py-1 pr-2">{p.description}</td><td className="py-1 text-right">{p.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {report.errors.length === 0 ? (
                <button disabled={pending} onClick={() => send(true)} className={btn}>Importar {report.valid} movimientos</button>
              ) : (
                <p className="text-muted-foreground">Corrige el archivo y vuelve a revisarlo. No se importa nada mientras haya errores.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
