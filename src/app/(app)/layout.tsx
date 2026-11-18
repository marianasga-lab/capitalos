import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { QuickEntryProvider } from "@/components/quick-entry/context";
import { QuickEntryLoader } from "@/components/quick-entry/quick-entry-loader";

/** Pantallas de la app (todas requieren sesión). */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <QuickEntryProvider>
      <AppShell>{children}</AppShell>
      <Suspense fallback={null}>
        <QuickEntryLoader />
      </Suspense>
    </QuickEntryProvider>
  );
}
