/** Piezas de presentación del dashboard (server components, sin JS). */
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { money, percent } from "@/lib/format";

export function Section({ title, eyebrow, action, children, className = "" }: { title: string; eyebrow?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-lg border bg-card ${className}`}>
      <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
        <div>
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Tarjeta de cifra principal. `tone` solo si la cifra tiene signo con significado. */
export function Kpi({ label, value, sub, emphasis = false }: { label: string; value: string; sub?: React.ReactNode; emphasis?: boolean }) {
  return (
    <div className={`flex flex-col justify-between gap-6 px-5 py-5 ${emphasis ? "bg-foreground text-background" : ""}`}>
      <p className={`eyebrow ${emphasis ? "!text-background/60" : ""}`}>{label}</p>
      <div>
        <p className={`num font-medium tracking-[-0.03em] ${emphasis ? "text-[34px] leading-none sm:text-[40px]" : "text-[26px] leading-none"}`}>{value}</p>
        {sub && <div className={`mt-2 text-xs ${emphasis ? "text-background/70" : "text-muted-foreground"}`}>{sub}</div>}
      </div>
    </div>
  );
}

/** Cambio con signo + ícono (nunca solo color). `goodWhen` indica si subir es bueno. */
export function Delta({ value, goodWhen = "up", asPercent = true }: { value: number | null; goodWhen?: "up" | "down"; asPercent?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-muted-foreground">sin mes previo</span>;
  const flat = Math.abs(value) < 0.0005;
  const good = flat ? null : (value > 0) === (goodWhen === "up");
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`num inline-flex items-center gap-0.5 font-medium ${good == null ? "text-muted-foreground" : good ? "text-positive" : "text-negative"}`}>
      <Icon className="size-3.5" aria-hidden />
      {asPercent ? percent(value, 1, { sign: true }) : money(value, "MXN", { sign: true })}
    </span>
  );
}

/**
 * Barra horizontal comparativa. Escala compartida por grupo (`max`) para que
 * las longitudes se puedan comparar entre sí.
 */
export function Bar({ label, value, max, color, note }: { label: string; value: number; max: number; color: "1" | "2" | "muted"; note?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const bg = color === "muted" ? "var(--chart-axis)" : `var(--chart-${color})`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1.5">
      <span className="flex items-center gap-2 text-sm">
        <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: bg }} />
        {label}
      </span>
      <span className="num text-sm font-medium">{money(value)}</span>
      <div className="col-span-2 h-2 rounded-[2px] bg-muted" aria-hidden>
        <div className="h-full rounded-r-[4px]" style={{ width: `${pct}%`, background: bg, minWidth: value > 0 ? 2 : 0 }} />
      </div>
      {note && <span className="col-span-2 text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Row({ label, value, strong = false, hint }: { label: React.ReactNode; value: string; strong?: boolean; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className={strong ? "font-medium" : "text-muted-foreground"}>
        {label}
        {hint && <span className="block text-xs text-muted-foreground/80">{hint}</span>}
      </span>
      <span className={`num ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

export function FundBadge({ state }: { state: "BALANCED" | "UNUSED" | "OVERPAID" }) {
  const map = {
    BALANCED: { label: "Cuadra", cls: "border-positive/30 text-positive", mark: "✓" },
    UNUSED: { label: "Sin usar", cls: "border-border text-muted-foreground", mark: "○" },
    OVERPAID: { label: "Pagaste de más", cls: "border-warning/40 text-warning", mark: "!" },
  }[state];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium ${map.cls}`}>
      <span aria-hidden>{map.mark}</span>
      {map.label}
    </span>
  );
}
