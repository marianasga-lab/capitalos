import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getTransactionsPage, currentPeriod } from "@/server/queries";
import { monthLabel, money } from "@/lib/format";
import { Empty, Section } from "@/components/dashboard/parts";
import { OpenEntryButton, TransactionList } from "@/components/interactive";

export const metadata: Metadata = { title: "Movimientos" };

type Search = Promise<{ mes?: string; tipo?: string; q?: string }>;

const TYPES = [
  { value: "", label: "Todos" },
  { value: "EXPENSE", label: "Gastos" },
  { value: "INCOME", label: "Ingresos" },
  { value: "TRANSFER", label: "Traspasos" },
  { value: "REIMBURSABLE_EXPENSE", label: "Me deben" },
  { value: "FUND_DEPOSIT", label: "Bolsa · depósitos" },
  { value: "FUND_PAYMENT", label: "Bolsa · pagos" },
];

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[980px] animate-pulse rounded-lg bg-muted" />}>
      <Movements searchParams={searchParams} />
    </Suspense>
  );
}

function parseMonth(v?: string) {
  const m = v?.match(/^(\d{4})-(\d{2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { year: Number(m[1]), month: Number(m[2]) };
  return currentPeriod();
}
const key = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const shift = (y: number, m: number, d: number) => {
  const date = new Date(y, m - 1 + d, 1);
  return key(date.getFullYear(), date.getMonth() + 1);
};

async function Movements({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { year, month } = parseMonth(sp.mes);
  const tipo = sp.tipo ?? "";
  const { rows, total } = await getTransactionsPage({ year, month, type: tipo, q: sp.q });
  const href = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams({ mes: key(year, month), ...(tipo && { tipo }), ...(sp.q && { q: sp.q }), ...params } as Record<string, string>);
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `/movimientos?${q}`;
  };
  const out = rows.filter((r) => r.type === "EXPENSE").reduce((s, r) => s + (r.myShare ?? r.amount) * r.fxToMXN, 0);
  const inc = rows.filter((r) => r.type === "INCOME").reduce((s, r) => s + r.amountMXN, 0);

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Libro mayor</p>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Movimientos</h1>
        </div>
        <nav aria-label="Mes" className="flex items-center gap-1 rounded-md border bg-card p-0.5 text-sm">
          <Link href={href({ mes: shift(year, month, -1) })} className="rounded-[4px] px-2.5 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Mes anterior">←</Link>
          <span className="min-w-36 px-2 text-center font-medium capitalize">{monthLabel(year, month)}</span>
          <Link href={href({ mes: shift(year, month, 1) })} className="rounded-[4px] px-2.5 py-1 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Mes siguiente">→</Link>
        </nav>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Tipo" className="flex flex-wrap gap-1">
          {TYPES.map((t) => (
            <Link
              key={t.value}
              href={href({ tipo: t.value })}
              aria-current={tipo === t.value ? "true" : undefined}
              className={`rounded-md border px-2.5 py-1 text-[13px] ${tipo === t.value ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <form action="/movimientos" className="flex gap-2">
          <input type="hidden" name="mes" value={key(year, month)} />
          {tipo && <input type="hidden" name="tipo" value={tipo} />}
          <label htmlFor="q" className="sr-only">Buscar</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="Buscar descripción…" className="h-8 w-52 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring" />
        </form>
      </div>

      <Section
        title={`${total} ${total === 1 ? "movimiento" : "movimientos"}`}
        eyebrow={tipo ? TYPES.find((t) => t.value === tipo)?.label : "Todo el mes"}
        action={
          <div className="num text-right text-xs text-muted-foreground">
            <p>Ingresos <span className="text-foreground">{money(inc)}</span></p>
            <p>Gastos <span className="text-foreground">{money(out)}</span></p>
          </div>
        }
      >
        {rows.length === 0 ? (
          <Empty>
            No hay movimientos con estos filtros. <OpenEntryButton>Registrar uno</OpenEntryButton>
          </Empty>
        ) : (
          <TransactionList rows={rows} />
        )}
      </Section>
    </div>
  );
}
