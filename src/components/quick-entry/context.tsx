"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PlainTx } from "@/server/queries";

export type EntryMode = "EXPENSE" | "INCOME" | "TRANSFER" | "REIMBURSABLE_EXPENSE" | "FUND";

type State = { open: boolean; mode: EntryMode; editing: PlainTx | null; fundId?: string; session: number };
type Ctx = State & {
  openEntry: (mode?: EntryMode, opts?: { fundId?: string }) => void;
  editEntry: (tx: PlainTx) => void;
  close: () => void;
};

const QuickEntryContext = createContext<Ctx | null>(null);

export function QuickEntryProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ open: false, mode: "EXPENSE", editing: null, session: 0 });

  const openEntry = useCallback((mode: EntryMode = "EXPENSE", opts: { fundId?: string } = {}) => {
    setState((s) => ({ open: true, mode, editing: null, fundId: opts.fundId, session: s.session + 1 }));
  }, []);
  const editEntry = useCallback((tx: PlainTx) => {
    const mode: EntryMode = tx.type === "FUND_DEPOSIT" || tx.type === "FUND_PAYMENT" ? "FUND" : tx.type;
    setState((s) => ({ open: true, mode, editing: tx, session: s.session + 1 }));
  }, []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  // Atajo global: Cmd/Ctrl + K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setState((s) => (s.open ? { ...s, open: false } : { open: true, mode: "EXPENSE", editing: null, session: s.session + 1 }));
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
