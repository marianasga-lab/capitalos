import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { getCardsOverview, type CardOverview } from "@/server/queries";
import { money, percent, shortDate } from "@/lib/format";
import { Empty, Row } from "@/components/dashboard/parts";
import { OpenEntryButton } from "@/components/interactive";
import { CardSimulator } from "@/components/card-simulator";

export const metadata: Metadata = { title: "Tarjetas" };

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[1180px] animate-pulse rounded-lg bg-muted" />}>
      <Cards />
    </Suspense>
  );
}

async function Cards() {
  await connection();
  const cards = await getCardsOverview();
  const totalDue = cards.reduce((s, c) => s + c.cycle.remainingNoInterest, 0);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Auditoría</p>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Tarjetas de crédito</h1>
        </div>
        {cards.length > 0 && (
          <p className="num text-sm text-muted-foreground">
            Para no pagar intereses este ciclo: <span className="text-base font-semibold text-foreground">{money(totalDue)}</span>
          </p>
        )}
      </header>
      {cards.length === 0 ? <Empty>No tienes tarjetas. Agrégalas en Ajustes.</Empty> : cards.map((c) => <CardPanel key={c.id} c={c} />)}
    </div>
  );
}

function StatusBadge({ c }: { c: CardOverview }) {
  const { status, daysUntilDue } = c.cycle;
  const map = {
    DUE_SOON: { Icon: AlertTriangle, cls: "border-warning/50 bg-warning/10 text-warning", label: daysUntilDue === 0 ? "Vence hoy" : `Vence en ${daysUntilDue} ${daysUntilDue === 1 ? "día" : "días"}` },
    OVERDUE: { Icon: AlertTriangle, cls: "border-negative/50 bg-negative/10 text-negative", label: `Venció hace ${-daysUntilDue} ${daysUntilDue === -1 ? "día" : "días"}` },
    PAID: { Icon: CheckCircle2, cls: "border-positive/40 text-positive", label: "Pagada este ciclo" },
    PENDING: { Icon: Clock, cls: "border-border text-muted-foreground", label: `Faltan ${daysUntilDue} días` },
    NOTHING_DUE: { Icon: CheckCircle2, cls: "border-border text-muted-foreground", label: "Sin cargos en el ciclo" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-1 text-xs font-medium ${map.cls}`}>
      <map.Icon className="size-3.5" aria-hidden />
      {map.label}
    </span>
  );
}

function CardPanel({ c }: { c: CardOverview }) {
  const { cycle } = c;
  const used = c.limit > 0 ? c.debt / c.limit : 0;
  const urgent = cycle.status === "DUE_SOON" || cycle.status === "OVERDUE";
  return (
    <article className={`min-w-0 rounded-lg border bg-card ${urgent ? "border-warning/50" : ""}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{c.name}</h2>
          <p className="text-xs text-muted-foreground">Corte día {c.cutoffDay} · pago día {c.paymentDueDay} · CAT {percent(c.annualRate)}</p>
        </div>
        <StatusBadge c={c} />
      </header>

      <div className="grid gap-8 p-5 lg:grid-cols-12">
        {/* Pago para no generar intereses */}
        <div className="flex flex-col gap-5 lg:col-span-4">
          <div>
            <p className="eyebrow mb-2">Pago para no generar intereses</p>
            <p className="num text-[36px] font-medium leading-none tracking-[-0.03em]">{money(cycle.remainingNoInterest)}</p>
            <p className="num mt-2 text-sm text-muted-foreground">
              antes del <span className="font-medium text-foreground">{shortDate(cycle.dueDate)}</span>
              {cycle.paidSinceCutoff > 0 && cycle.remainingNoInterest > 0 && ` · ya abonaste ${money(cycle.paidSinceCutoff)}`}
            </p>
          </div>
          {cycle.remainingNoInterest > 0 && (
            <OpenEntryButton
              mode="TRANSFER"
              prefill={{ cardId: c.id, amount: cycle.remainingNoInterest, description: `Pago ${c.name}` }}
              className="h-9 self-start rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Registrar pago
            </OpenEntryButton>
          )}
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Límite usado</span>
              <span className="num">{percent(used, 0)}</span>
            </div>
            <div className="h-1.5 rounded-[2px] bg-muted" aria-hidden>
              <div className={`h-full rounded-r-[3px] ${used > 0.8 ? "bg-negative" : "bg-foreground/70"}`} style={{ width: `${Math.min(100, used * 100)}%` }} />
            </div>
            <p className="num mt-1.5 text-xs text-muted-foreground">{money(c.available)} disponibles de {money(c.limit, "MXN", { decimals: false })}</p>
          </div>
        </div>

        {/* Desglose del ciclo */}
        <div className="lg:col-span-4">
          <p className="eyebrow mb-1">Estado de cuenta</p>
          <p className="num mb-2 text-xs text-muted-foreground">del {shortDate(new Date(new Date(cycle.statementStart).getTime() + 86_400_000))} al {shortDate(cycle.statementEnd)}</p>
          <div className="divide-y border-t">
            {cycle.previousBalance > 0 && <Row label="Saldo anterior" value={money(cycle.previousBalance)} hint="Deuda que ya traías antes de este periodo" />}
            <Row label={cycle.previousBalance > 0 ? "+ Cargos del periodo" : "Cargos del periodo"} value={money(cycle.periodCharges)} />
            {cycle.previousBalance > 0 && <Row label="= Saldo al corte" value={money(cycle.noInterestPayment)} />}
            <Row label="− Pagos desde el corte" value={money(cycle.paidSinceCutoff)} />
            <Row label="= Falta pagar" value={money(cycle.remainingNoInterest)} strong />
            <Row label="Cargos nuevos (siguiente corte)" value={money(cycle.currentPeriodCharges)} hint={`Corte ${shortDate(cycle.nextCutoff)}`} />
            <Row label="Deuda total hoy" value={money(c.debt)} />
          </div>
        </div>

        {/* Simulador */}
        <div className="lg:col-span-4">
          <p className="eyebrow mb-3">Simulador de intereses</p>
          <CardSimulator balance={cycle.remainingNoInterest > 0 ? cycle.remainingNoInterest : c.debt} annualRate={c.annualRate} />
        </div>
      </div>
    </article>
  );
}
