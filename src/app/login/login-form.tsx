"use client";
import { useActionState } from "react";
import { loginAction, type LoginState } from "@/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          className="h-11 rounded-md border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
        />
      </label>
      {state.error && <p role="alert" className="text-sm text-negative">{state.error}</p>}
      <button disabled={pending} className="h-11 rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50">
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
