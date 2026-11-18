"use client";
/**
 * Registro rápido (Ctrl/Cmd + K). Un formulario que cambia según el tipo:
 * cada tipo pide solo lo que necesita.
 */
import { cloneElement, isValidElement, useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createTransactionAction, updateTransactionAction } from "@/actions/transactions";
import { isoLocal, money, type CurrencyCode } from "@/lib/format";
import type { EntryOptions, PlainTx } from "@/server/queries";
import { useQuickEntry, type EntryMode } from "./context";

const MODES: { value: EntryMode; label: string; hint: string }[] = [
  { value: "EXPENSE", label: "Gasto", hint: "Dinero que sale y es tuyo" },
  { value: "INCOME", label: "Ingreso", hint: "Dinero que entra y es tuyo" },
  { value: "TRANSFER", label: "Traspaso", hint: "Entre tus cuentas o pago de tarjeta" },
  { value: "REIMBURSABLE_EXPENSE", label: "Me deben", hint: "Pagaste algo que te van a devolver" },
  { value: "FUND", label: "Bolsa", hint: "Dinero de alguien más (ej. colegiatura de Papá)" },
];

type Source = "OWN_CAPITAL" | "ALLOWANCE_FAMILY" | "SHARED_SPLIT";

const inputCls =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-50";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="eyebrow">{label}</label>
      <FieldIdContext id={id}>{children}</FieldIdContext>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
// Pasa el id al control para que la etiqueta quede asociada (accesibilidad).
function FieldIdContext({ id, children }: { id: string; children: React.ReactNode }) {
  if (isValidElement<{ id?: string }>(children)) return cloneElement(children, { id: children.props.id ?? id });
  return <>{children}</>;
}

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-md border bg-muted/50 p-0.5">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-[4px] px-2 text-[13px] transition-colors ${value === o.value ? "bg-card font-medium text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function QuickEntryDialog({ options }: { options: EntryOptions }) {
  const { open, session, close, ...rest } = useQuickEntry();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto overflow-x-hidden p-0 sm:max-w-[560px]">
        {/* key nuevo en cada apertura: el formulario arranca limpio o precargado */}
        <EntryForm key={session} options={options} editing={rest.editing} initialMode={rest.mode} initialFund={rest.fundId} close={close} />
      </DialogContent>
    </Dialog>
  );
}

type FormProps = { options: EntryOptions; editing: PlainTx | null; initialMode: EntryMode; initialFund?: string; close: () => void };

function EntryForm({ options, editing, initialMode, initialFund, close }: FormProps) {
  const [mode, setMode] = useState<EntryMode>(() =>
    editing ? (editing.type === "FUND_DEPOSIT" || editing.type === "FUND_PAYMENT" ? "FUND" : (editing.type as EntryMode)) : initialMode,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ----- Estado del formulario (desde lo que se edita, o en blanco) -----
  const firstDebit = options.accounts.find((a) => a.type === "DEBIT") ?? options.accounts[0];
  const [f, setF] = useState(() =>
    editing
      ? {
          amount: String(editing.amount),
          description: editing.description,
          category: editing.category,
          date: editing.date.slice(0, 10),
          payWith: editing.creditCardId ? `card:${editing.creditCardId}` : editing.accountId ? `acc:${editing.accountId}` : "",
          accountId: editing.accountId ?? "",
          toTarget: editing.toAccountId ? `acc:${editing.toAccountId}` : editing.creditCardId ? `card:${editing.creditCardId}` : "",
          toAmount: editing.toAmount ? String(editing.toAmount) : "",
          source: editing.fundSource as Source,
          person: editing.person ?? "",
          myShare: editing.myShare != null ? String(editing.myShare) : "",
          isFixed: editing.isFixedExpense,
          fundId: editing.fundId ?? "",
          fundDirection: (editing.type === "FUND_PAYMENT" ? "OUT" : "IN") as "IN" | "OUT",
          notes: editing.notes ?? "",
        }
      : { ...blank(firstDebit?.id), fundId: initialFund ?? options.funds[0]?.id ?? "" },
  );
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  // ----- Derivados -----
  const accountById = useMemo(() => new Map(options.accounts.map((a) => [a.id, a])), [options.accounts]);
  const cardById = useMemo(() => new Map(options.cards.map((c) => [c.id, c])), [options.cards]);
  const parseTarget = (v: string) => {
    const [kind, id] = v.split(":");
    return kind === "card" ? { accountId: null, creditCardId: id } : kind === "acc" ? { accountId: id, creditCardId: null } : { accountId: null, creditCardId: null };
  };
  const currencyOf = (v: string): CurrencyCode => {
    const t = parseTarget(v);
    return ((t.creditCardId ? cardById.get(t.creditCardId)?.currency : t.accountId ? accountById.get(t.accountId)?.currency : "MXN") ?? "MXN") as CurrencyCode;
  };

  const fromCurrency: CurrencyCode =
    mode === "INCOME" || mode === "TRANSFER" || (mode === "FUND" && f.fundDirection === "IN")
      ? ((accountById.get(f.accountId)?.currency ?? "MXN") as CurrencyCode)
      : currencyOf(f.payWith);
  const toCurrency: CurrencyCode | null = mode === "TRANSFER" ? currencyOf(f.toTarget) : null;
  const crossCurrency = mode === "TRANSFER" && f.toTarget.startsWith("acc:") && toCurrency !== fromCurrency;
  const amountMXN = Number(f.amount || 0) * (options.rates[fromCurrency] ?? 1);

  const catKind = mode === "INCOME" ? "INCOME" : "EXPENSE";
  const categories = options.categories.filter((c) => c.kind === catKind);

  // ----- Envío -----
  function buildPayload() {
    const base = { date: f.date, amount: f.amount, notes: f.notes || null };
    switch (mode) {
      case "EXPENSE":
        return {
          ...base, type: "EXPENSE", ...parseTarget(f.payWith),
          description: f.description, category: f.category || "Otros",
          fundSource: f.source, isFixedExpense: f.isFixed,
          ...(f.source === "SHARED_SPLIT" ? { myShareAmount: f.myShare, counterpartyName: f.person } : {}),
        };
      case "INCOME":
        return {
          ...base, type: "INCOME", accountId: f.accountId,
          description: f.description, category: f.category || "Otros",
          fundSource: f.source === "ALLOWANCE_FAMILY" ? "ALLOWANCE_FAMILY" : "OWN_CAPITAL",
          ...(f.source === "ALLOWANCE_FAMILY" && f.person ? { counterpartyName: f.person } : {}),
        };
      case "TRANSFER": {
        const to = parseTarget(f.toTarget);
        const fromName = accountById.get(f.accountId)?.name ?? "";
        const toName = to.creditCardId ? cardById.get(to.creditCardId)?.name : accountById.get(to.accountId ?? "")?.name;
        return {
          ...base, type: "TRANSFER", accountId: f.accountId,
          toAccountId: to.accountId, creditCardId: to.creditCardId,
          toAmount: crossCurrency ? f.toAmount : null,
          description: f.description || (to.creditCardId ? `Pago ${toName}` : `${fromName} → ${toName}`),
          category: to.creditCardId ? "Pago de tarjeta" : crossCurrency ? "Cambio de divisa" : "Traspaso",
        };
      }
      case "REIMBURSABLE_EXPENSE":
        return {
          ...base, type: "REIMBURSABLE_EXPENSE", ...parseTarget(f.payWith),
          description: f.description, category: f.category || "Otros", counterpartyName: f.person,
        };
      case "FUND": {
        const fund = options.funds.find((x) => x.id === f.fundId);
        const isIn = f.fundDirection === "IN";
        return {
          ...base, type: isIn ? "FUND_DEPOSIT" : "FUND_PAYMENT", fundId: f.fundId,
          ...(isIn ? { accountId: f.accountId, creditCardId: null } : parseTarget(f.payWith)),
          description: f.description || `${fund?.owner ?? ""}: ${isIn ? "depósito" : "pago"} ${fund?.name ?? ""}`.trim(),
          category: fund?.name ?? "Bolsa",
        };
      }
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>, another = false) {
    e.preventDefault();
    setError(null);
    const payload = buildPayload();
    startTransition(async () => {
      const res = editing ? await updateTransactionAction(editing.id, payload) : await createTransactionAction(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(editing ? "Movimiento actualizado" : "Movimiento registrado", {
        description: `${payload!.description} · ${money(Number(f.amount), fromCurrency)}`,
      });
      if (another) setF((s) => ({ ...s, amount: "", description: "", myShare: "", toAmount: "", notes: "" }));
      else close();
    });
  }

  const sourceOptions = options.accounts.filter((a) => a.type !== "INVESTMENT" || mode === "TRANSFER");
  const payWithSelect = (
    <select className={inputCls} value={f.payWith} onChange={(e) => set("payWith", e.target.value)} required>
      <option value="" disabled>Elige…</option>
      <optgroup label="Cuentas">
        {sourceOptions.map((a) => <option key={a.id} value={`acc:${a.id}`}>{a.name} · {a.currency}</option>)}
      </optgroup>
      {options.cards.length > 0 && (
        <optgroup label="Tarjetas de crédito">
          {options.cards.map((c) => <option key={c.id} value={`card:${c.id}`}>{c.name}</option>)}
        </optgroup>
      )}
    </select>
  );
  const accountSelect = (value: string, onChange: (v: string) => void, all = false) => (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="" disabled>Elige…</option>
      {(all ? options.accounts : sourceOptions).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
    </select>
  );
  const peopleList = <datalist id="qe-people">{options.people.map((p) => <option key={p.id} value={p.name} />)}</datalist>;

  return (
    <>
        <DialogHeader className="border-b px-5 pb-4 pt-6 sm:px-6">
          <DialogTitle className="text-lg font-semibold tracking-[-0.01em]">{editing ? "Editar movimiento" : "Nuevo movimiento"}</DialogTitle>
          <DialogDescription>{MODES.find((m) => m.value === mode)?.hint}</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => submit(e)} className="flex min-w-0 flex-col gap-5 px-5 py-5 sm:px-6">
          {!editing && (
            <div role="tablist" aria-label="Tipo de movimiento" className="flex flex-wrap gap-1">
              {MODES.map((m) => (
                <button
                  type="button"
                  role="tab"
                  key={m.value}
                  aria-selected={mode === m.value}
                  onClick={() => { setMode(m.value); set("category", ""); }}
                  className={`h-8 shrink-0 rounded-md border px-3 text-[13px] transition-colors ${mode === m.value ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Monto: protagonista */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="qe-amount" className="eyebrow">{mode === "TRANSFER" ? "Monto que sale" : "Monto"}</label>
            <div className="flex items-baseline gap-2 border-b border-input pb-1 focus-within:border-ring">
              <span className="text-2xl text-muted-foreground">{fromCurrency === "EUR" ? "€" : fromCurrency === "USD" ? "US$" : "$"}</span>
              <input
                id="qe-amount"
                autoFocus
                inputMode="decimal"
                placeholder="0.00"
                value={f.amount}
                onChange={(e) => set("amount", e.target.value.replace(/[^\d.,]/g, ""))}
                className="num w-full bg-transparent text-3xl font-medium tracking-[-0.02em] outline-none placeholder:text-muted-foreground/40"
                required
              />
              <span className="eyebrow">{fromCurrency}</span>
            </div>
            {fromCurrency !== "MXN" && Number(f.amount) > 0 && (
              <p className="num text-xs text-muted-foreground">≈ {money(amountMXN)} al tipo de cambio de {options.rates[fromCurrency]}</p>
            )}
          </div>

          {/* ----- Campos por tipo ----- */}
          {mode === "TRANSFER" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sale de">{accountSelect(f.accountId, (v) => set("accountId", v), true)}</Field>
              <Field label="Va a">
                <select className={inputCls} value={f.toTarget} onChange={(e) => set("toTarget", e.target.value)} required>
                  <option value="" disabled>Elige…</option>
                  <optgroup label="Cuentas">
                    {options.accounts.filter((a) => a.id !== f.accountId).map((a) => <option key={a.id} value={`acc:${a.id}`}>{a.name} · {a.currency}</option>)}
                  </optgroup>
                  {options.cards.length > 0 && (
                    <optgroup label="Pagar tarjeta">
                      {options.cards.map((c) => <option key={c.id} value={`card:${c.id}`}>{c.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </Field>
              {crossCurrency && (
                <Field label={`Monto que llega (${toCurrency})`} hint="Es un cambio de divisa: escribe lo que realmente recibiste.">
                  <input className={`${inputCls} num`} inputMode="decimal" value={f.toAmount} onChange={(e) => set("toAmount", e.target.value)} required />
                </Field>
              )}
            </div>
          ) : mode === "FUND" ? (
            <>
              {options.funds.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Aún no tienes bolsas abiertas. Crea una en <a href="/bolsas" className="underline underline-offset-4">Bolsas</a> (ej. “Colegiatura diciembre · Papá”).
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Bolsa">
                    <select className={inputCls} value={f.fundId} onChange={(e) => set("fundId", e.target.value)} required>
                      {options.funds.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.owner}</option>)}
                    </select>
                  </Field>
                  <Field label="Movimiento">
                    <Segmented label="Dirección" value={f.fundDirection} onChange={(v) => set("fundDirection", v)} options={[{ value: "IN", label: "Me depositó" }, { value: "OUT", label: "Pagué con ella" }]} />
                  </Field>
                  {f.fundDirection === "IN"
                    ? <Field label="Entró a">{accountSelect(f.accountId, (v) => set("accountId", v))}</Field>
                    : <Field label="Pagué con">{payWithSelect}</Field>}
                </div>
              )}
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Descripción">
                  <input className={inputCls} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder={mode === "INCOME" ? "Ej. Pago proyecto web" : "Ej. Súper de la semana"} required maxLength={140} />
                </Field>
              </div>
              {mode === "INCOME"
                ? <Field label="Entró a">{accountSelect(f.accountId, (v) => set("accountId", v), true)}</Field>
                : <Field label="Pagué con">{payWithSelect}</Field>}
              <Field label="Categoría">
                <input
                  className={inputCls}
                  list="qe-categories"
                  value={f.category}
                  onChange={(e) => {
                    const v = e.target.value;
                    const c = categories.find((x) => x.name === v);
                    setF((s) => ({ ...s, category: v, ...(c && mode === "EXPENSE" ? { isFixed: c.isFixed } : {}) }));
                  }}
                  placeholder="Elige o escribe"
                />
              </Field>
              <datalist id="qe-categories">{categories.map((c) => <option key={c.name} value={c.name} />)}</datalist>

              {mode === "REIMBURSABLE_EXPENSE" && (
                <div className="sm:col-span-2">
                  <Field label="¿Quién te lo debe?" hint="Quedará en “Por cobrar” hasta que lo marques como cobrado.">
                    <input className={inputCls} list="qe-people" value={f.person} onChange={(e) => set("person", e.target.value)} placeholder="Papá, Roommate…" required />
                  </Field>
                </div>
              )}

              {(mode === "EXPENSE" || mode === "INCOME") && (
                <div className="sm:col-span-2">
                  <Field label="¿De quién es el dinero?">
                    <Segmented
                      label="Fuente del dinero"
                      value={f.source}
                      onChange={(v) => set("source", v)}
                      options={[
                        { value: "OWN_CAPITAL", label: "Mío" },
                        { value: "ALLOWANCE_FAMILY", label: "Apoyo familiar" },
                        ...(mode === "EXPENSE" ? [{ value: "SHARED_SPLIT" as Source, label: "Compartido" }] : []),
                      ]}
                    />
                  </Field>
                </div>
              )}
              {mode === "EXPENSE" && f.source === "SHARED_SPLIT" && (
                <>
                  <Field label="Con quién">
                    <input className={inputCls} list="qe-people" value={f.person} onChange={(e) => set("person", e.target.value)} required />
                  </Field>
                  <Field label="Mi parte" hint={Number(f.amount) && Number(f.myShare) <= Number(f.amount) ? `Te deben ${money(Number(f.amount) - Number(f.myShare || 0), fromCurrency)}` : undefined}>
                    <input className={`${inputCls} num`} inputMode="decimal" value={f.myShare} onChange={(e) => set("myShare", e.target.value)} placeholder={f.amount ? String(Number(f.amount) / 2) : ""} required />
                  </Field>
                </>
              )}
              {mode === "INCOME" && f.source === "ALLOWANCE_FAMILY" && (
                <Field label="De quién (opcional)">
                  <input className={inputCls} list="qe-people" value={f.person} onChange={(e) => set("person", e.target.value)} placeholder="Papá" />
                </Field>
              )}
              {mode === "EXPENSE" && (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" className="size-4 accent-foreground" checked={f.isFixed} onChange={(e) => set("isFixed", e.target.checked)} />
                  Gasto fijo mensual <span className="text-muted-foreground">(renta, suscripciones; cuenta para el Runway)</span>
                </label>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha">
              <input type="date" className={`${inputCls} num`} value={f.date} onChange={(e) => set("date", e.target.value)} required />
            </Field>
            {(mode === "TRANSFER" || mode === "FUND") && (
              <Field label="Descripción (opcional)">
                <input className={inputCls} value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={140} />
              </Field>
            )}
          </div>
          {peopleList}

          {error && (
            <p role="alert" className="rounded-md border border-negative/30 bg-negative/5 px-3 py-2 text-sm text-negative">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            {!editing && (
              <button
                type="button"
                disabled={pending}
                onClick={(e) => {
                  const form = (e.currentTarget as HTMLButtonElement).form!;
                  if (form.reportValidity()) submit({ preventDefault() {} } as React.FormEvent<HTMLFormElement>, true);
                }}
                className="h-10 rounded-md border px-4 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                Guardar y registrar otro
              </button>
            )}
            <button type="submit" disabled={pending || (mode === "FUND" && options.funds.length === 0)} className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              {pending ? "Guardando…" : editing ? "Guardar cambios" : "Registrar"}
            </button>
          </div>
        </form>
    </>
  );
}

function blank(defaultAccount?: string) {
  return {
    amount: "",
    description: "",
    category: "",
    date: isoLocal(),
    payWith: defaultAccount ? `acc:${defaultAccount}` : "",
    accountId: defaultAccount ?? "",
    toTarget: "",
    toAmount: "",
    source: "OWN_CAPITAL" as Source,
    person: "",
    myShare: "",
    isFixed: false,
    fundId: "",
    fundDirection: "IN" as "IN" | "OUT",
    notes: "",
  };
}
