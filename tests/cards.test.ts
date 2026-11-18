import { describe, expect, it } from "vitest";
import { cardCycle, clampedDate, dueDateAfter, lastCutoffs, payoffPlan, simulateInterest } from "@/lib/finance/cards";

const d = (s: string) => new Date(`${s}T12:00:00`);
const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

describe("fechas de corte", () => {
  it("acota el día 31 en meses cortos", () => {
    expect(ymd(clampedDate(2026, 1, 31))).toBe("2026-02-28");
    expect(ymd(clampedDate(2028, 1, 31))).toBe("2028-02-29");
    expect(ymd(clampedDate(2026, 12, 5))).toBe("2027-01-05"); // mes 12 → enero siguiente
  });

  it("encuentra el último corte y el anterior", () => {
    const c = lastCutoffs(3, d("2026-11-17"));
    expect([ymd(c.prev), ymd(c.last), ymd(c.next)]).toEqual(["2026-10-03", "2026-11-03", "2026-12-03"]);
    const c2 = lastCutoffs(20, d("2026-11-17"));
    expect([ymd(c2.prev), ymd(c2.last)]).toEqual(["2026-09-20", "2026-10-20"]);
    // El mismo día del corte cuenta como corte ocurrido
    expect(ymd(lastCutoffs(17, d("2026-11-17")).last)).toBe("2026-11-17");
  });

  it("el día de pago cae después del corte (mismo mes o el siguiente)", () => {
    expect(ymd(dueDateAfter(d("2026-11-03"), 21))).toBe("2026-11-21");
    expect(ymd(dueDateAfter(d("2026-10-20"), 10))).toBe("2026-11-10");
  });
});

describe("pago para no generar intereses", () => {
  const card = { cutoffDay: 3, paymentDueDay: 21 };
  const moves = [
    { date: d("2026-10-02"), amount: 999, kind: "charge" as const }, // ciclo anterior
    { date: d("2026-10-04"), amount: 500, kind: "charge" as const },
    { date: d("2026-11-03"), amount: 300, kind: "charge" as const }, // día de corte: entra
    { date: d("2026-11-04"), amount: 200, kind: "charge" as const }, // siguiente periodo
    { date: d("2026-11-10"), amount: 600, kind: "payment" as const },
  ];

  it("suma los cargos del periodo cerrado y descuenta pagos posteriores al corte", () => {
    const c = cardCycle(card, moves, d("2026-11-17"));
    expect(c.noInterestPayment).toBe(800);
    expect(c.paidSinceCutoff).toBe(600);
    expect(c.remainingNoInterest).toBe(200);
    expect(c.currentPeriodCharges).toBe(200);
    expect(ymd(c.dueDate)).toBe("2026-11-21");
    expect(c.daysUntilDue).toBe(4);
    expect(c.status).toBe("DUE_SOON");
  });

  it("incluye la deuda anterior al corte (saldo inicial o no pagado)", () => {
    // Deuda hoy = 2,400 anterior + 800 del periodo + 200 nuevos − 600 pagados = 2,800
    const c = cardCycle(card, moves.slice(1), d("2026-11-17"), 2800);
    expect(c.periodCharges).toBe(800);
    expect(c.previousBalance).toBe(2400);
    expect(c.noInterestPayment).toBe(3200);
    expect(c.remainingNoInterest).toBe(2600);
  });

  it("marca pagada, vencida o sin nada que pagar", () => {
    expect(cardCycle(card, [...moves, { date: d("2026-11-12"), amount: 200, kind: "payment" }], d("2026-11-17")).status).toBe("PAID");
    expect(cardCycle(card, moves, d("2026-11-25")).status).toBe("OVERDUE");
    expect(cardCycle(card, [], d("2026-11-17")).status).toBe("NOTHING_DUE");
    expect(cardCycle(card, moves, d("2026-11-10")).status).toBe("PENDING");
  });

  it("la alerta aparece justo a 5 días", () => {
    expect(cardCycle(card, moves, d("2026-11-16")).status).toBe("DUE_SOON"); // 5 días
    expect(cardCycle(card, moves, d("2026-11-15")).status).toBe("PENDING"); // 6 días
  });
});

describe("simulador", () => {
  it("calcula interés mensual con IVA sobre lo no pagado", () => {
    const s = simulateInterest({ balance: 10000, payment: 4000, annualRate: 0.6 });
    expect(s.unpaid).toBe(6000);
    expect(s.interest).toBe(300); // 6000 × 0.6/360 × 30
    expect(s.iva).toBe(48);
    expect(s.totalCost).toBe(348);
  });

  it("pagar todo no genera intereses", () => {
    expect(simulateInterest({ balance: 5000, payment: 5000, annualRate: 0.7 }).totalCost).toBe(0);
  });

  it("plan de pago fijo: meses e intereses, o null si no alcanza", () => {
    const p = payoffPlan({ balance: 10000, monthlyPayment: 2000, annualRate: 0.6 })!;
    expect(p.months).toBe(7); // 6 pagos completos + uno final de ~$153
    expect(p.totalInterest).toBeGreaterThan(1000);
    expect(payoffPlan({ balance: 10000, monthlyPayment: 500, annualRate: 0.6 })).toBeNull(); // 580 de interés > 500
  });
});
