"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PlainTx } from "@/server/queries";

export type EntryMode = "EXPENSE" | "INCOME" | "TRANSFER" | "REIMBURSABLE_EXPENSE" | "FUND";

export type Prefill = { fundId?: string; cardId?: string; amount?: number; description?: string };
type State = { open: boolean; mode: EntryMode; editing: PlainTx | null; prefill: Prefill; session: number };
type Ctx = State & {
  openEntry: (mode?: EntryMode, prefill?: Prefill) => void;
  editEntry: (tx: PlainTx) => void;
  close: () => void;
};

const QuickEntryContext = createContext<Ctx | null>(null);

export function QuickEntryProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ open: false, mode: "EXPENSE", editing: null, prefill: {}, session: 0 });

  const openEntry = useCallback((mode: EntryMode = "EXPENSE", prefill: Prefill = {}) => {
    setState((s) => ({ open: true, mode, editing: null, prefill, session: s.session + 1 }));
  }, []);
  const editEntry = useCallback((tx: PlainTx) => {
    const mode: EntryMode = tx.type === "FUND_DEPOSIT" || tx.type === "FUND_PAYMENT" ? "FUND" : tx.type;
    setState((s) => ({ open: true, mode, editing: tx, prefill: {}, session: s.session + 1 }));
  }, []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  // Atajo global: Cmd/Ctrl + K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setState((s) => (s.open ? { ...s, open: false } : { open: true, mode: "EXPENSE", editing: null, prefill: {}, session: s.session + 1 }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ ...state, openEntry, editEntry, close }), [state, openEntry, editEntry, close]);
  return <QuickEntryContext.Provider value={value}>{children}</QuickEntryContext.Provider>;
}

export function useQuickEntry() {
  const ctx = useContext(QuickEntryContext);
  if (!ctx) throw new Error("useQuickEntry debe usarse dentro de QuickEntryProvider");
  return ctx;
}
