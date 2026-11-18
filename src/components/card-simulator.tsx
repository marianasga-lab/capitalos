"use client";
/** Simulador: ¿qué pasa si pago menos que el total? */
import { useId, useState } from "react";
import { IVA, payoffPlan, simulateInterest } from "@/lib/finance/cards";
import { money, percent } from "@/lib/format";

export function CardSimulator({ balance, annualRate }: { balance: number; annualRate: number }) {
  const id = useId();
  const [payment, setPayment] = useState(() => Math.round(balance * 0.3));
  const max = Math.max(balance, 1);
  const s = simulateInterest({ balance, payment, annualRate });
  const plan = payment < balance ? payoffPlan({ balance, monthlyPayment: payment, annualRate }) : null;

  if (balance <= 0) return <p className="text-sm text-muted-foreground">No hay saldo que simular.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="eyebrow">Si pagas</label>
        <div className="flex items-baseline justify-between gap-3">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={max}
            step="0.01"
            value={payment}
            onChange={(e) => setPayment(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
            className="num h-9 w-40 rounded-md border border-input bg-card px-3 text-base outline-none focus-visible:border-ring"
          />
          <span className="num text-xs text-muted-foreground">de {money(balance)}</span>
        </div>
        <input
          id={id}
          type="range"
          min={0}
          max={max}
          step={Math.max(1, Math.round(max / 200))}
          value={payment}
          onChange={(e) => setPayment(Number(e.target.value))}
          className="w-full accent-[var(--chart-1)]"
          aria-label="Monto a pagar"
        />
      </div>

      <dl className="num grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border text-sm">
        <div className="bg-card p-3"><dt className="eyebrow mb-1">Queda sin pagar</dt><dd>{money(s.unpaid)}</dd></div>
        <div className="bg-card p-3"><dt className="eyebrow mb-1">Intereses + IVA</dt><dd className={s.totalCost > 0 ? "text-negative" : ""}>{money(s.totalCost)}</dd></div>
        <div className="bg-card p-3"><dt className="eyebrow mb-1">Interés (≈30 días)</dt><dd>{money(s.interest)}</dd></div>
        <div className="bg-card p-3"><dt className="eyebrow mb-1">IVA ({percent(IVA, 0)})</dt><dd>{money(s.iva)}</dd></div>
      </dl>

      <p className="text-sm">
        {payment >= balance
          ? "Pagas el total: no generas intereses."
          : plan
            ? <>Pagando {money(payment)} cada mes (sin compras nuevas) terminas en <strong>{plan.months} {plan.months === 1 ? "mes" : "meses"}</strong> y pagas <strong className="text-negative">{money(plan.totalInterest)}</strong> de intereses e IVA.</>
            : <span className="text-negative">Con {money(payment)} al mes no alcanzas a cubrir los intereses: la deuda crecería.</span>}
      </p>
      <p className="text-xs text-muted-foreground">
        Estimación con tasa anual de {percent(annualRate)} ÷ 360 por día, 30 días e IVA. Tu banco calcula sobre el saldo promedio diario, así que la cifra real puede variar.
      </p>
    </div>
  );
}
