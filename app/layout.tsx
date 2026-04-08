import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/lib/chartSetup";
import "./globals.css";
import { AuthGate } from "@/components/auth/AuthGate";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { LogApiUrl } from "@/components/dev/LogApiUrl";
import { ModeBar } from "@/components/mode/ModeBar";
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
            <LogApiUrl />
            <AuthGate>
              <ModeBar />
              {children}
            </AuthGate>
          </AuthProvider>
        </ModeProvider>
      </body>
    </html>
  );
}
