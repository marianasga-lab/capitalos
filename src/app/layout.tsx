import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import { QuickEntryProvider } from "@/components/quick-entry/context";
import { QuickEntryLoader } from "@/components/quick-entry/quick-entry-loader";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "CapitalOS", template: "%s · CapitalOS" },
  description: "Finanzas personales y patrimonio.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ThemeProvider>
          <QuickEntryProvider>
            <AppShell>{children}</AppShell>
            <Suspense fallback={null}>
              <QuickEntryLoader />
            </Suspense>
          </QuickEntryProvider>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
