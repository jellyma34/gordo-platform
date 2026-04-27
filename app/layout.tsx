import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AuthGateRoot } from "@/components/auth/AuthGateRoot";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ChartSetup } from "@/components/charting/ChartSetup";
import { ModeBarDynamic } from "@/components/mode/ModeBarDynamic";
import { ModeProvider } from "@/components/mode/ModeProvider";

export const metadata: Metadata = {
  title: "ГОРДО. ГПР",
  description: "График производства работ"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ru" className="min-w-0">
      <body className="min-w-0 antialiased">
        <ModeProvider>
          <AuthProvider>
            <ChartSetup />
            <AuthGateRoot>
              <ModeBarDynamic />
              {children}
            </AuthGateRoot>
          </AuthProvider>
        </ModeProvider>
      </body>
    </html>
  );
}
