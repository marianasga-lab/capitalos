import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getFundsPage, type PlainFund } from "@/server/queries";
import { money } from "@/lib/format";
import { Empty, FundBadge, Section } from "@/components/dashboard/parts";
import { OpenEntryButton } from "@/components/interactive";
import { CloseFundButton, NewFundForm, ReopenFundButton } from "@/components/funds-client";

export const metadata: Metadata = { title: "Bolsas" };

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[980px] animate-pulse rounded-lg bg-muted" />}>
      <Funds />
    </Suspense>
  );
}

async function Funds() {
  await connection();
  const { funds, people } = await getFundsPage();
  const open = funds.filter((f) => f.status === "OPEN");
  const closed = funds.filter((f) => f.status === "CLOSED");

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6">
      <header>
        <p className="eyebrow mb-2">Dinero de terceros</p>
        <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Bolsas</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Cuando alguien te deposita para algo concreto (la colegiatura, la pensión), ese dinero sigue siendo suyo.
          Aquí entra y sale sin contar como ingreso ni gasto, y ves si lo depositado y lo pagado cuadran.
          La mesada es distinta: esa es tuya y se registra como ingreso de apoyo familiar.
        </p>
      </header>

      <Section eyebrow="Nueva" title="Crear una bolsa">
        <NewFundForm people={people} />
      </Section>

      <section aria-labelledby="open-title" className="flex flex-col gap-3">
        <h2 id="open-title" className="text-[15px] font-semibold tracking-[-0.01em]">Abiertas</h2>
        {open.length === 0 ? <Empty>No hay bolsas abiertas.</Empty> : open.map((f) => <FundCard key={f.id} f={f} />)}
      </section>

      {closed.length > 0 && (
        <Section eyebrow="Historial" title="Cerradas">
          <ul className="divide-y">
            {closed.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>{f.name} <span className="text-muted-foreground">· {f.owner}</span></span>
                <span className="num flex items-center gap-3 text-muted-foreground">
                  depositó {money(f.deposited)} · pagaste {money(f.paid)}
                  <ReopenFundButton id={f.id} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function FundCard({ f }: { f: PlainFund }) {
  const scale = Math.max(f.expected ?? 0, f.deposited, f.paid, 1);
  const bars = [
    { label: "Depositó", value: f.deposited, color: "var(--chart-1)" },
    { label: "Pagaste", value: f.paid, color: "var(--chart-2)" },
  ];
  return (
    <article className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{f.name}</h3>
          <p className="text-xs text-muted-foreground">Dinero de {f.owner}</p>
        </div>
        <FundBadge state={f.state} />
      </header>
      <div className="grid gap-6 p-5 md:grid-cols-[1fr_17rem] md:items-end">
        <div className="flex flex-col gap-3">
          {bars.map((b) => (
            <div key={b.label} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground"><span aria-hidden className="size-2 rounded-[2px]" style={{ background: b.color }} />{b.label}</span>
              <div className="relative h-2 rounded-[2px] bg-muted" aria-hidden>
                <div className="h-full rounded-r-[4px]" style={{ width: `${(b.value / scale) * 100}%`, background: b.color }} />
                {f.expected != null && <span className="absolute -top-1 h-4 w-px bg-foreground/50" style={{ left: `${(f.expected / scale) * 100}%` }} />}
              </div>
              <span className="num w-28 text-right font-medium">{money(b.value)}</span>
            </div>
          ))}
          {f.expected != null && (
            <p className="num text-xs text-muted-foreground">
              Esperado {money(f.expected)} (línea vertical)
              {f.missingDeposit != null && f.missingDeposit > 0.005 && ` · falta que deposite ${money(f.missingDeposit)}`}
            </p>
          )}
          <p className={`text-sm ${f.state === "OVERPAID" ? "text-warning" : f.state === "BALANCED" ? "text-positive" : ""}`}>{f.message}</p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <OpenEntryButton mode="FUND" prefill={{ fundId: f.id }} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">+ Depósito o pago</OpenEntryButton>
          <CloseFundButton id={f.id} state={f.state} balance={f.balance} owner={f.owner} />
        </div>
      </div>
    </article>
  );
}
