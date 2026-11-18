import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getNetWorthDetail } from "@/server/queries";
import { money, percent, type CurrencyCode } from "@/lib/format";
import { Empty, FundBadge, Row, Section } from "@/components/dashboard/parts";

export const metadata: Metadata = { title: "Patrimonio" };

const CURRENCY_NAME: Record<CurrencyCode, string> = { MXN: "Pesos", USD: "Dólares", EUR: "Euros" };
const TYPE_NAME = { CASH: "Efectivo", DEBIT: "Banco", INVESTMENT: "Inversión", RECEIVABLE: "Por cobrar" } as const;

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[1180px] animate-pulse rounded-lg bg-muted" />}>
      <NetWorth />
    </Suspense>
  );
}

async function NetWorth() {
  await connection();
  const d = await getNetWorthDetail();
  const inHand = d.byCurrency.reduce((s, b) => s + b.totalMXN, 0);

  // Composición de activos (4 categorías, orden fijo de la paleta validada)
  const bank = d.liquidity - d.cashMXN;
  const parts = [
    { key: "cash", label: "Efectivo", value: d.cashMXN, color: "var(--chart-1)" },
    { key: "bank", label: "Banco", value: bank, color: "var(--chart-2)" },
    { key: "inv", label: "Inversiones", value: d.investments, color: "var(--chart-3)" },
    { key: "rec", label: "Por cobrar", value: d.receivables, color: "var(--chart-4)" },
  ].filter((p) => p.value > 0);
  const assetsTotal = parts.reduce((s, p) => s + p.value, 0);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <header className="grid gap-6 border-b pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="eyebrow mb-3">Patrimonio · fortuna neta</p>
          <p className="num text-[44px] font-medium leading-none tracking-[-0.04em] sm:text-[64px]">{money(d.netWorth, "MXN", { decimals: false })}</p>
          <p className="num mt-3 text-sm text-muted-foreground">
            Activos {money(d.totalAssets, "MXN", { decimals: false })} − deudas {money(d.totalLiabilities, "MXN", { decimals: false })} · todo convertido a pesos
          </p>
        </div>
        <dl className="num flex gap-6 text-sm">
          <div><dt className="eyebrow mb-1">Dólar</dt><dd>{money(d.rates.USD)}</dd></div>
          <div><dt className="eyebrow mb-1">Euro</dt><dd>{money(d.rates.EUR)}</dd></div>
        </dl>
      </header>

      {/* ----- Efectivo por moneda ----- */}
      <section aria-labelledby="cash-title">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="cash-title" className="text-[15px] font-semibold tracking-[-0.01em]">Efectivo en mano</h2>
          <p className="num text-sm text-muted-foreground">Total ≈ <span className="font-medium text-foreground">{money(d.cashMXN)}</span></p>
        </div>
        <div className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-3 max-sm:[&>*+*]:border-t sm:[&>*+*]:border-l">
          {(["MXN", "USD", "EUR"] as CurrencyCode[]).map((c) => {
            const b = d.byCurrency.find((x) => x.currency === c);
            const cash = b?.cash ?? 0;
            return (
              <div key={c} className="px-5 py-5">
                <p className="eyebrow mb-4">{CURRENCY_NAME[c]} · {c}</p>
                <p className="num text-[28px] font-medium leading-none tracking-[-0.03em]">{money(cash, c)}</p>
                <p className="num mt-2 text-xs text-muted-foreground">
                  {c === "MXN" ? "Billetes y monedas" : cash > 0 ? `≈ ${money(cash * (b?.rate ?? 0))} a ${money(b?.rate ?? 0)}` : "Sin efectivo en esta moneda"}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ----- Por moneda (todo) ----- */}
      <Section eyebrow="Por moneda" title="Dónde está tu dinero">
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="num w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left">
                {["Moneda", "Efectivo", "Banco", "Inversión", "Total", "En pesos", "% del total"].map((h, i) => (
                  <th key={h} className={`eyebrow pb-2 font-medium ${i > 0 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.byCurrency.map((b) => {
                const c = b.currency as CurrencyCode;
                return (
                  <tr key={c} className="border-b last:border-0">
                    <td className="py-3 font-medium">{CURRENCY_NAME[c]} <span className="text-muted-foreground">{c}</span></td>
                    <td className="py-3 text-right">{money(b.cash, c)}</td>
                    <td className="py-3 text-right">{money(b.bank, c)}</td>
                    <td className="py-3 text-right">{money(b.investments, c)}</td>
                    <td className="py-3 text-right font-medium">{money(b.total, c)}</td>
                    <td className="py-3 text-right">{money(b.totalMXN)}</td>
                    <td className="py-3 text-right text-muted-foreground">{inHand > 0 ? percent(b.totalMXN / inHand) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t">
                <td className="pt-3 font-medium" colSpan={5}>Total en cuentas</td>
                <td className="pt-3 text-right font-semibold">{money(inHand)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ----- Activos ----- */}
        <Section className="lg:col-span-7" eyebrow="Activos" title="Lo que tienes">
          {assetsTotal > 0 && (
            <figure className="mb-6">
              <figcaption className="sr-only">Composición de tus activos</figcaption>
              <div className="flex h-3 gap-[2px] overflow-hidden rounded-[3px]" aria-hidden>
                {parts.map((p) => (
                  <div key={p.key} style={{ width: `${(p.value / assetsTotal) * 100}%`, background: p.color }} title={`${p.label}: ${money(p.value)}`} />
                ))}
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
                {parts.map((p) => (
                  <li key={p.key} className="flex flex-col">
                    <span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-[2px]" style={{ background: p.color }} />{p.label}</span>
                    <span className="num font-medium">{percent(p.value / assetsTotal, 0)}</span>
                  </li>
                ))}
              </ul>
            </figure>
          )}
          <ul className="divide-y border-t">
            {d.accounts.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                <span>
                  {a.name}
                  <span className="block text-xs text-muted-foreground">
                    {TYPE_NAME[a.type]} · {a.currency}
                    {a.interestRate != null && ` · ${percent(a.interestRate)} anual`}
                    {a.isSystem && " · reembolsos y gastos compartidos"}
                  </span>
                </span>
                <span className="num text-right">
                  {money(a.balance, a.currency as CurrencyCode)}
                  {a.currency !== "MXN" && <span className="block text-xs text-muted-foreground">≈ {money(a.balanceMXN)}</span>}
                </span>
              </li>
            ))}
            {d.fundsOwedToMe > 0 && <li><Row label="Bolsas en las que pagaste de más" value={money(d.fundsOwedToMe)} /></li>}
          </ul>
        </Section>

        {/* ----- Pasivos ----- */}
        <Section className="lg:col-span-5" eyebrow="Pasivos" title="Lo que debes">
          <ul className="divide-y">
            {d.cards.map((c) => (
              <li key={c.id} className="py-3 first:pt-0">
                <div className="flex items-baseline justify-between text-sm">
                  <span>{c.name}<span className="block text-xs text-muted-foreground">Tarjeta de crédito · límite {money(c.limit, "MXN", { decimals: false })}</span></span>
                  <span className="num">{money(c.debt)}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-[2px] bg-muted" aria-hidden>
                  <div className="h-full rounded-r-[3px] bg-foreground/70" style={{ width: `${Math.min(100, (c.debt / c.limit) * 100)}%` }} />
                </div>
                <p className="num mt-1 text-xs text-muted-foreground">{percent(c.debt / c.limit, 0)} del límite usado</p>
              </li>
            ))}
            <li className="py-3">
              <Row label="Dinero de terceros en tus cuentas" value={money(d.thirdPartyHeld)} hint="Está en tu banco pero no es tuyo (bolsas)" />
            </li>
            <li className="pt-3"><Row label="Total pasivos" value={money(d.totalLiabilities)} strong /></li>
          </ul>
          {d.funds.length > 0 && (
            <div className="mt-6">
              <p className="eyebrow mb-2">Bolsas abiertas</p>
              <ul className="divide-y border-t">
                {d.funds.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate">{f.name} <span className="text-muted-foreground">· {f.owner}</span></span>
                    <span className="flex shrink-0 items-center gap-2"><span className="num text-muted-foreground">{f.state === "OVERPAID" ? `te debe ${money(-f.balance)}` : f.state === "UNUSED" ? `${money(f.balance)} sin usar` : ""}</span><FundBadge state={f.state} /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.cards.length === 0 && d.thirdPartyHeld === 0 && <Empty>No tienes deudas registradas.</Empty>}
        </Section>
      </div>
    </div>
  );
}
