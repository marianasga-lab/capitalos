import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getGoalsPage, type GoalsPage } from "@/server/queries";
import { money, monthLabel, percent, shortDate } from "@/lib/format";
import { Empty, Section } from "@/components/dashboard/parts";
import { GoalActions, NewGoalForm } from "@/components/goals-client";

export const metadata: Metadata = { title: "Metas" };

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[980px] animate-pulse rounded-lg bg-muted" />}>
      <Goals />
    </Suspense>
  );
}

async function Goals() {
  await connection();
  const d = await getGoalsPage();
  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Ahorro</p>
          <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Metas</h1>
        </div>
        <p className="num max-w-sm text-right text-sm text-muted-foreground">
          Tu ritmo de ahorro: <span className={`font-semibold ${d.pace >= 0 ? "text-foreground" : "text-negative"}`}>{money(d.pace)}</span> al mes
          <span className="block text-xs">({d.paceSource})</span>
        </p>
      </header>

      {d.goals.length === 0 ? <Empty>Aún no tienes metas.</Empty> : d.goals.map((g) => <GoalCard key={g.id} g={g} pace={d.pace} />)}

      <Section eyebrow="Nueva" title="Crear una meta">
        <NewGoalForm accounts={d.accounts} />
      </Section>
    </div>
  );
}

function GoalCard({ g, pace }: { g: GoalsPage["goals"][number]; pace: number }) {
  const done = g.remaining === 0;
  const projected = g.projectedDate ? new Date(g.projectedDate) : null;
  return (
    <article className="min-w-0 rounded-lg border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{g.name}</h2>
          <p className="text-xs text-muted-foreground">
            {g.deadline ? `Para el ${shortDate(g.deadline)} ${new Date(g.deadline).getFullYear()}` : "Sin fecha límite"}
            {g.account && ` · en ${g.account.name}`}
          </p>
        </div>
        {done ? (
          <span className="rounded-[4px] border border-positive/40 px-2 py-1 text-xs font-medium text-positive">✓ Lograda</span>
        ) : g.onTrack === true ? (
          <span className="rounded-[4px] border border-positive/40 px-2 py-1 text-xs font-medium text-positive">✓ A tiempo</span>
        ) : g.onTrack === false ? (
          <span className="rounded-[4px] border border-warning/50 px-2 py-1 text-xs font-medium text-warning">! Vas atrasada</span>
        ) : null}
      </header>
      <div className="grid gap-6 p-5 md:grid-cols-[1fr_auto] md:items-end">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="num text-[26px] font-medium leading-none tracking-[-0.03em]">{money(g.current, "MXN", { decimals: false })}</p>
            <p className="num text-sm text-muted-foreground">de {money(g.target, "MXN", { decimals: false })} · {percent(g.progress, 0)}</p>
          </div>
          <div className="h-2 rounded-[2px] bg-muted" role="progressbar" aria-valuenow={Math.round(g.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso de ${g.name}`}>
            <div className="h-full rounded-r-[4px] bg-[var(--chart-1)]" style={{ width: `${g.progress * 100}%` }} />
          </div>
          {!done && (
            <ul className="num grid gap-1 text-sm sm:grid-cols-2">
              {g.neededPerMonth != null && (
                <li><span className="text-muted-foreground">Para llegar a tiempo: </span>{money(g.neededPerMonth)}/mes{g.monthsLeft != null && <span className="text-muted-foreground"> ({g.monthsLeft} {g.monthsLeft === 1 ? "mes" : "meses"})</span>}</li>
              )}
              <li>
                <span className="text-muted-foreground">A tu ritmo: </span>
                {projected ? <span className="capitalize">{monthLabel(projected.getFullYear(), projected.getMonth() + 1)}</span> : <span className="text-negative">{pace <= 0 ? "no avanza (ahorro ≤ 0)" : "—"}</span>}
              </li>
            </ul>
          )}
          {g.account && (
            <p className="text-xs text-muted-foreground">La meta es un apartado: {g.account.name} tiene {money(g.account.balance, g.account.currency as "MXN")} en total.</p>
          )}
        </div>
        <GoalActions id={g.id} name={g.name} />
      </div>
    </article>
  );
}
