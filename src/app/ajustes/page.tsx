import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getSettings } from "@/server/queries";
import { money, monthLabel, percent } from "@/lib/format";
import { Empty, Section } from "@/components/dashboard/parts";
import { AccountRow, CardRow, CloseMonthForm, ImportCsvForm, NewAccountForm, NewCardForm, RatesForm, RestoreForm } from "@/components/settings-client";

export const metadata: Metadata = { title: "Ajustes" };

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[1080px] animate-pulse rounded-lg bg-muted" />}>
      <SettingsPage />
    </Suspense>
  );
}

const DL = "inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-secondary";
const TABLE_NAMES: [string, string][] = [
  ["account", "Cuentas"], ["creditCard", "Tarjetas"], ["transaction", "Movimientos (crudo)"], ["reimbursementPayment", "Abonos"],
  ["fund", "Bolsas"], ["counterparty", "Personas"], ["savingsGoal", "Metas"], ["monthlySnapshot", "Historial mensual"],
  ["category", "Categorías"], ["budget", "Presupuestos"], ["exchangeRate", "Tipos de cambio"],
];

async function SettingsPage() {
  await connection();
  const s = await getSettings();
  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
      <header>
        <p className="eyebrow mb-2">Configuración</p>
        <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Ajustes</h1>
      </header>

      <Section eyebrow="Monedas" title="Tipo de cambio" action={<span className="text-xs text-muted-foreground">Todo se suma en pesos con estos valores</span>}>
        <RatesForm rates={s.rates} />
      </Section>

      <Section eyebrow="Activos" title="Cuentas">
        {s.accounts.length === 0 ? <Empty>Aún no tienes cuentas. Agrega la primera abajo.</Empty> : (
          <ul className="mb-6 divide-y border-y">{s.accounts.map((a) => <AccountRow key={a.id} a={a} />)}</ul>
        )}
        <p className="eyebrow mb-3">Agregar cuenta</p>
        <NewAccountForm />
        <p className="mt-3 text-xs text-muted-foreground">
          El saldo solo se escribe al crear la cuenta. Después lo mueven tus movimientos. Si no cuadra con tu banco o tu cartera, usa <strong>Conciliar</strong>: registra la diferencia como ajuste.
        </p>
      </Section>

      <Section eyebrow="Pasivos" title="Tarjetas de crédito">
        {s.cards.length > 0 && <ul className="mb-6 divide-y border-y">{s.cards.map((c) => <CardRow key={c.id} c={c} />)}</ul>}
        <p className="eyebrow mb-3">Agregar tarjeta</p>
        <NewCardForm />
      </Section>

      <Section eyebrow="Historial" title="Cierre de mes">
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
          Guarda la foto de tu patrimonio y tu tasa de ahorro. Hazlo el último día del mes (o el primero del siguiente, antes de registrar movimientos nuevos). Puedes repetirlo: se actualiza.
        </p>
        <CloseMonthForm period={s.period} />
        {s.snapshots.length > 0 && (
          <table className="num mt-5 w-full text-sm">
            <thead><tr className="border-b text-left"><th className="eyebrow pb-2 font-medium">Mes</th><th className="eyebrow pb-2 text-right font-medium">Patrimonio</th><th className="eyebrow pb-2 text-right font-medium">Ahorro</th></tr></thead>
            <tbody>
              {s.snapshots.map((x) => (
                <tr key={`${x.year}-${x.month}`} className="border-b last:border-0">
                  <td className="py-2 capitalize">{monthLabel(x.year, x.month)}</td>
                  <td className="py-2 text-right">{money(x.netWorth)}</td>
                  <td className="py-2 text-right">{percent(x.savingsRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section eyebrow="Portabilidad" title="Respaldo y exportación">
        <div className="flex flex-col gap-8">
          <div>
            <p className="mb-1 text-sm font-medium">Exportar base de datos completa</p>
            <p className="mb-3 text-sm text-muted-foreground">El JSON es una copia exacta (incluye abonos y saldos) y sirve para restaurar. El CSV de movimientos se abre en Excel y se puede volver a importar.</p>
            <div className="flex flex-wrap gap-2">
              <a href="/api/export?formato=json" className={`${DL} bg-primary font-medium text-primary-foreground hover:bg-primary/90`} download>Respaldo completo (.json)</a>
              <a href="/api/export?formato=movimientos" className={DL} download>Movimientos (.csv)</a>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Cada tabla en CSV</summary>
              <div className="mt-3 flex flex-wrap gap-2">
                {TABLE_NAMES.map(([t, label]) => <a key={t} href={`/api/export?formato=tabla&tabla=${t}`} className={`${DL} h-8 text-xs`} download>{label}</a>)}
              </div>
            </details>
          </div>

          <div className="border-t pt-6">
            <p className="mb-1 text-sm font-medium">Importar movimientos desde CSV</p>
            <p className="mb-3 text-sm text-muted-foreground">
              Primero se revisa el archivo y ves los errores por línea; nada se guarda hasta que confirmas, y se importa todo o nada. Las cuentas, tarjetas y bolsas deben existir con el mismo nombre.{" "}
              <a href="/api/export?formato=plantilla" className="underline underline-offset-4" download>Descargar plantilla con ejemplos</a>.
            </p>
            <ImportCsvForm />
          </div>

          <div className="border-t pt-6">
            <p className="mb-1 text-sm font-medium text-negative">Restaurar respaldo</p>
            <p className="mb-3 text-sm text-muted-foreground">Reemplaza todos tus datos por los del archivo. Descarga un respaldo actual antes, por si acaso.</p>
            <RestoreForm />
          </div>
        </div>
      </Section>
    </div>
  );
}
