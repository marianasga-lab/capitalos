import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getDashboard } from "@/server/queries";
import { money, monthLabel, percent } from "@/lib/format";
import { Bar, Delta, Empty, FundBadge, Kpi, Row, Section } from "@/components/dashboard/parts";
import { EvolutionChart } from "@/components/dashboard/evolution-chart";
import { CollectButton, OpenEntryButton, TransactionList } from "@/components/interactive";

export default function Page() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  await connection();
  const d = await getDashboard();
  const { kpis, month: m, previousMonth: pm, runway } = d;
  const expenseChange = pm.expenses > 0 ? m.expenses / pm.expenses - 1 : null;
  const flowMax = Math.max(m.income, m.expenses);
  const sourceMax = Math.max(m.expensesOwn, m.expensesFamily);
  const peopleOwing = d.receivables.length;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2 capitalize">Resumen · {monthLabel(d.period.year, d.period.month)}</p>
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em] sm:text-[34px]">Tu dinero, hoy</h1>
        </div>
        <Link href="/patrimonio" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Ver patrimonio por moneda →
        </Link>
      </header>

      {/* ----- KPIs ----- */}
      <div className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-2 lg:grid-cols-4 [&>*]:border-border max-sm:[&>*+*]:border-t sm:max-lg:[&>*:nth-child(n+3)]:border-t sm:[&>*:nth-child(even)]:border-l lg:[&>*+*]:border-l">
        <Kpi
          emphasis
          label="Fortuna neta"
          value={money(kpis.netWorth, "MXN", { decimals: false })}
          sub={<>Activos {money(kpis.totalAssets, "MXN", { decimals: false })} − deudas {money(kpis.totalLiabilities, "MXN", { decimals: false })}</>}
        />
        <Kpi
          label="Liquidez inmediata"
          value={money(kpis.liquidity, "MXN", { decimals: false })}
          sub={kpis.thirdPartyHeld > 0 ? <>Tuya: {money(kpis.ownLiquidity, "MXN", { decimals: false })} · {money(kpis.thirdPartyHeld, "MXN", { decimals: false })} es de terceros</> : "Efectivo + débito, en todas las monedas"}
        />
        <Kpi
          label="Inversiones"
          value={money(kpis.investments, "MXN", { decimals: false })}
          sub={<>≈ <span className="num text-positive">+{money(kpis.investmentMonthlyYield)}</span> al mes según su tasa</>}
        />
        <Kpi
          label="Por cobrar"
          value={money(kpis.receivables, "MXN", { decimals: false })}
          sub={peopleOwing ? `${peopleOwing} ${peopleOwing === 1 ? "persona te debe" : "personas te deben"}` : "Nadie te debe"}
        />
      </div>

      {/* ----- Flujo + Runway ----- */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Section className="lg:col-span-7" eyebrow="Flujo del mes" title="Ingresos vs. gastos" action={<OpenEntryButton>+ Registrar</OpenEntryButton>}>
          {!m.hasData ? (
            <Empty>Todavía no hay movimientos este mes.</Empty>
          ) : (
            <div className="grid gap-8 md:grid-cols-2">
              <div className="flex flex-col gap-4">
                <Bar label="Ingresos" value={m.income} max={flowMax} color="1" note={m.incomeFamily > 0 ? `${money(m.incomeFamily)} de apoyo familiar` : undefined} />
                <Bar label="Gastos" value={m.expenses} max={flowMax} color="2" />
                <div className="mt-1 border-t pt-3">
                  <Row label="Ahorro del mes" value={money(m.savings, "MXN", { sign: true })} strong />
                  <Row label="Tasa de ahorro" value={percent(m.savingsRate)} />
                  <div className="flex items-baseline justify-between py-2 text-sm">
                    <span className="text-muted-foreground">Gastos vs. mes anterior</span>
                    <Delta value={expenseChange} goodWhen="down" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <p className="eyebrow">¿Con qué dinero gastaste?</p>
                <Bar label="Capital propio" value={m.expensesOwn} max={sourceMax} color="1" note="Incluye tu parte de gastos compartidos" />
                <Bar label="Apoyo familiar" value={m.expensesFamily} max={sourceMax} color="2" />
                <div className="mt-1 border-t pt-3">
                  <p className="eyebrow mb-1">No cuentan como gasto</p>
                  <Row label="Pagaste y te lo deben" value={money(m.reimbursable)} />
                  <Row label="Dinero de terceros recibido" value={money(m.fundsIn)} />
                  <Row label="Dinero de terceros pagado" value={money(m.fundsOut)} />
                </div>
              </div>
            </div>
          )}
        </Section>

        <Section className="lg:col-span-5" eyebrow="Runway" title="¿Cuántos meses aguantas?">
          {runway.months == null ? (
            <Empty>Marca tus gastos fijos (renta, suscripciones) para calcularlo.</Empty>
          ) : (
            <div className="flex flex-col gap-5">
              <p className="flex items-baseline gap-2">
                <span className="num text-[56px] font-medium leading-none tracking-[-0.04em]">{runway.months.toFixed(1)}</span>
                <span className="text-muted-foreground">{runway.months >= 0.95 && runway.months < 1.05 ? "mes" : "meses"}</span>
              </p>
              <RunwayGauge months={runway.months} />
              <div className="border-t pt-2">
                <Row label="Liquidez propia" value={money(kpis.ownLiquidity)} hint="Efectivo + débito, sin dinero de terceros" />
                <Row label="− Deuda de tarjetas" value={money(-kpis.cardDebt)} />
                <Row label="= Liquidez neta" value={money(runway.netLiquidity)} strong />
                <Row
                  label="÷ Gasto fijo mensual"
                  value={money(runway.monthlyFixed)}
                  hint={runway.basedOnMonths > 1 ? `Promedio de ${runway.basedOnMonths} meses` : "Con base en este mes"}
                />
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* ----- Evolución + Por cobrar / Bolsas ----- */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Section className="lg:col-span-7" eyebrow="Evolución" title="Patrimonio y ahorro mes a mes">
          <EvolutionChart data={d.evolution} />
        </Section>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
          <Section eyebrow="Por cobrar" title="Quién te debe">
            {d.receivables.length === 0 ? (
              <Empty>Nadie te debe dinero.</Empty>
            ) : (
              <ul className="flex flex-col gap-5">
                {d.receivables.map((p) => (
                  <li key={p.id}>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-sm font-medium">{p.name}</span>
                      <span className="num text-sm font-semibold">{money(p.owed)}</span>
                    </div>
                    <ul className="divide-y border-t">
                      {p.items.map((it) => (
                        <li key={it.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="min-w-0 truncate text-muted-foreground">
                            {it.description}
                            {it.partial && <span className="text-xs"> · abono parcial</span>}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="num">{money(it.remaining)}</span>
                            <CollectButton transactionId={it.id} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section eyebrow="Dinero de terceros" title="Bolsas abiertas" action={<Link href="/bolsas" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">Ver todas</Link>}>
            {d.funds.length === 0 ? (
              <Empty>Sin bolsas abiertas. Úsalas cuando alguien te deposite para algo concreto.</Empty>
            ) : (
              <ul className="divide-y">
                {d.funds.map((f) => (
                  <li key={f.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">{f.name} <span className="font-normal text-muted-foreground">· {f.owner}</span></span>
                      <FundBadge state={f.state} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{f.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <Section eyebrow="Actividad" title="Últimos movimientos" action={<Link href="/movimientos" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">Ver todos</Link>}>
        {d.recent.length === 0 ? <Empty>Registra tu primer movimiento con Ctrl K.</Empty> : <TransactionList rows={d.recent} compact />}
      </Section>
    </div>
  );
}

/** Regla de 0 a 12 meses con marcas en 3 y 6 (referencias comunes de fondo de emergencia). */
function RunwayGauge({ months }: { months: number }) {
  const pct = Math.min(100, (months / 12) * 100);
  return (
    <div>
      <div className="relative h-2 rounded-[2px] bg-muted" aria-hidden>
        <div className="h-full rounded-r-[4px] bg-[var(--chart-1)]" style={{ width: `${pct}%` }} />
        {[3, 6].map((t) => (
          <span key={t} className="absolute -top-1 h-4 w-px bg-foreground/40" style={{ left: `${(t / 12) * 100}%` }} />
        ))}
      </div>
      <div className="num relative mt-1.5 h-4 text-[11px] text-muted-foreground" aria-hidden>
        <span className="absolute left-0">0</span>
        <span className="absolute left-1/4 -translate-x-1/2">3</span>
        <span className="absolute left-1/2 -translate-x-1/2">6</span>
        <span className="absolute right-0">12+</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {months < 3 ? "Menos de 3 meses: prioriza tu fondo de emergencia." : months < 6 ? "Entre 3 y 6 meses: vas bien." : "Más de 6 meses: colchón sólido."}
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto flex max-w-[1180px] animate-pulse flex-col gap-6" aria-busy="true" aria-label="Cargando">
      <div className="h-16 w-64 rounded bg-muted" />
      <div className="h-36 rounded-lg bg-muted" />
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="h-80 rounded-lg bg-muted lg:col-span-7" />
        <div className="h-80 rounded-lg bg-muted lg:col-span-5" />
      </div>
    </div>
  );
}
