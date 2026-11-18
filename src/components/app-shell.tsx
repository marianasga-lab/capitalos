"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ArrowLeftRight, CreditCard, Landmark, LayoutGrid, LogOut, Plus, Settings, Target, Wallet } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { ThemeToggle } from "./theme-toggle";
import { useQuickEntry } from "./quick-entry/context";

const NAV = [
  { href: "/", label: "Resumen", Icon: LayoutGrid },
  { href: "/patrimonio", label: "Patrimonio", Icon: Landmark },
  { href: "/movimientos", label: "Movimientos", Icon: ArrowLeftRight },
  { href: "/tarjetas", label: "Tarjetas", Icon: CreditCard },
  { href: "/bolsas", label: "Bolsas", Icon: Wallet },
  { href: "/metas", label: "Metas", Icon: Target },
  { href: "/ajustes", label: "Ajustes", Icon: Settings },
];

function NewEntryButton({ compact = false }: { compact?: boolean }) {
  const { openEntry } = useQuickEntry();
  return (
    <button
      onClick={() => openEntry()}
      className="group inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Plus className="size-4" aria-hidden />
      {compact ? <span className="sr-only">Nuevo movimiento</span> : <span>Nuevo movimiento</span>}
      {!compact && (
        <kbd className="ml-1 hidden rounded-[3px] border border-primary-foreground/25 px-1 font-mono text-[10px] text-primary-foreground/70 sm:inline">
          ⌃K
        </kbd>
      )}
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  // En celular, la barra de secciones se desliza: muestra la sección activa.
  const mobileNav = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = mobileNav.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && active) nav.scrollLeft = active.offsetLeft - nav.clientWidth / 2 + active.clientWidth / 2;
  }, [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      {/* Escritorio: barra lateral */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-sidebar px-4 py-6 lg:flex">
        <Link href="/" className="mb-10 flex items-baseline gap-1.5 px-2">
          <span className="text-[17px] font-semibold tracking-[-0.02em]">CapitalOS</span>
          <span className="eyebrow !text-[10px]">MX</span>
        </Link>
        <nav aria-label="Principal" className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                isActive(href) ? "bg-sidebar-accent font-medium text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              }`}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-4 px-2">
          <NewEntryButton />
          <div className="flex items-center justify-between">
            <ThemeToggle />
            <form action={logoutAction}>
              <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" title="Cerrar sesión">
                <LogOut className="size-3.5" aria-hidden /> Salir
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Móvil: barra superior + navegación */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" className="text-[16px] font-semibold tracking-[-0.02em]">CapitalOS</Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action={logoutAction}>
              <button className="grid size-9 place-items-center rounded-md text-muted-foreground hover:text-foreground" title="Cerrar sesión">
                <LogOut className="size-4" aria-hidden /><span className="sr-only">Cerrar sesión</span>
              </button>
            </form>
            <NewEntryButton compact />
          </div>
        </div>
        <nav ref={mobileNav} aria-label="Principal" className="flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${isActive(href) ? "bg-secondary font-medium" : "text-muted-foreground"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="min-w-0 px-4 pb-24 pt-6 sm:px-8 lg:px-12 lg:pt-10">{children}</main>
    </div>
  );
}
