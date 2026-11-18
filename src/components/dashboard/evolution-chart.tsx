"use client";
/**
 * Evolución mes a mes. Dos gráficas separadas (nunca doble eje):
 *  1. Patrimonio neto (línea).
 *  2. Tasa de ahorro (barras).
 * Incluye vista de tabla para accesibilidad.
 */
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compactMoney, money, monthLabel, monthShort, percent } from "@/lib/format";

type Point = { year: number; month: number; netWorth: number; savingsRate: number; expenses: number; live: boolean };

const axis = { stroke: "var(--chart-axis)", fontSize: 11, tickLine: false, axisLine: false, tick: { fill: "var(--chart-muted)" } } as const;

function Tip({ active, payload, kind }: { active?: boolean; payload?: { payload: Point }[]; kind: "nw" | "rate" }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium capitalize">{monthLabel(p.year, p.month)}{p.live ? " · en curso" : ""}</p>
      <p className="num text-muted-foreground">
        {kind === "nw" ? <>Patrimonio <span className="text-foreground">{money(p.netWorth)}</span></> : <>Ahorro <span className="text-foreground">{percent(p.savingsRate)}</span></>}
      </p>
    </div>
  );
}

export function EvolutionChart({ data }: { data: Point[] }) {
  const [table, setTable] = useState(false);
  const rows = data.map((d) => ({ ...d, label: `${monthShort(d.month)}${d.month === 1 || d === data[0] ? ` ${String(d.year).slice(2)}` : ""}` }));
  const onlyOne = data.length < 2;
  // Si el rango es chico, "$76 k" se repetiría en cada marca: usa cifras completas.
  const values = data.map((d) => d.netWorth);
  const span = Math.max(...values) - Math.min(...values);
  const yFormat = (v: number) => (span < 20_000 ? money(v, "MXN", { decimals: false }) : compactMoney(v));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          {onlyOne ? "Aún no hay meses cerrados." : "Meses cerrados + el mes en curso (en vivo)."}
        </p>
        <button onClick={() => setTable((t) => !t)} className="shrink-0 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
          {table ? "Ver gráfica" : "Ver tabla"}
        </button>
      </div>

      {onlyOne && !table ? (
        <div className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2">
          <div className="bg-card p-4">
            <p className="eyebrow mb-2">Patrimonio hoy</p>
            <p className="num text-2xl font-medium tracking-[-0.03em]">{money(data[0].netWorth, "MXN", { decimals: false })}</p>
          </div>
          <div className="bg-card p-4">
            <p className="eyebrow mb-2">Ahorro de {monthLabel(data[0].year, data[0].month).split(" ")[0]}</p>
            <p className="num text-2xl font-medium tracking-[-0.03em]">{percent(data[0].savingsRate)}</p>
          </div>
          <p className="bg-card p-4 text-xs text-muted-foreground sm:col-span-2">
            La gráfica aparece en cuanto cierres tu primer mes: será tu punto de partida para medir el crecimiento.
          </p>
        </div>
      ) : table ? (
        <table className="num w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="eyebrow py-2 font-medium">Mes</th>
              <th className="eyebrow py-2 text-right font-medium">Patrimonio</th>
              <th className="eyebrow py-2 text-right font-medium">Ahorro</th>
              <th className="eyebrow py-2 text-right font-medium">Gastos</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={`${d.year}-${d.month}`} className="border-b last:border-0">
                <td className="py-2 capitalize">{monthLabel(d.year, d.month)}{d.live && <span className="text-muted-foreground"> · en curso</span>}</td>
                <td className="py-2 text-right">{money(d.netWorth)}</td>
                <td className="py-2 text-right">{percent(d.savingsRate)}</td>
                <td className="py-2 text-right">{money(d.expenses)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <figure>
            <figcaption className="eyebrow mb-3">Patrimonio neto</figcaption>
            <div className="h-48" role="img" aria-label={`Patrimonio neto: ${data.map((d) => `${monthLabel(d.year, d.month)} ${money(d.netWorth)}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
                  <XAxis dataKey="label" {...axis} dy={6} padding={{ left: 16, right: 16 }} />
                  <YAxis {...axis} width={64} tickFormatter={yFormat} domain={["auto", "auto"]} tickCount={5} />
                  <Tooltip content={<Tip kind="nw" />} cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} />
                  <Line
                    type="linear"
                    dataKey="netWorth"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    isAnimationActive={false}
                    dot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: "var(--chart-1)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </figure>

          <figure>
            <figcaption className="eyebrow mb-3">Tasa de ahorro mensual</figcaption>
            <div className="h-28" role="img" aria-label={`Tasa de ahorro: ${data.map((d) => `${monthLabel(d.year, d.month)} ${percent(d.savingsRate)}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="30%">
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" {...axis} dy={6} />
                  <YAxis {...axis} width={64} tickFormatter={(v) => percent(v, 0)} tickCount={4} allowDecimals={false} domain={[(min: number) => Math.min(0, Math.floor(min * 10) / 10), (max: number) => Math.max(0.1, Math.ceil(max * 10) / 10)]} />
                  <ReferenceLine y={0} stroke="var(--chart-axis)" />
                  <Tooltip content={<Tip kind="rate" />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
                  <Bar dataKey="savingsRate" maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {rows.map((r) => (
                      <Cell key={`${r.year}-${r.month}`} fill="var(--chart-1)" fillOpacity={r.live ? 0.55 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">La barra atenuada es el mes en curso: puede cambiar.</p>
          </figure>
        </>
      )}
    </div>
  );
}
