import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <p className="mb-1 text-[22px] font-semibold tracking-[-0.02em]">CapitalOS</p>
        <p className="mb-8 text-sm text-muted-foreground">Tus finanzas, solo para ti.</p>
        <LoginForm />
      </div>
    </main>
  );
}
