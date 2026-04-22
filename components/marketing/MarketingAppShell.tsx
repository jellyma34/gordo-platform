"use client";

import type { ReactNode } from "react";

import { MarketingLayoutChromeProvider } from "@/components/marketing/marketingLayoutChromeContext";
import { MarketingAppSidebar } from "@/components/marketing/MarketingAppSidebar";

export function MarketingAppShell({
  variant,
  children,
}: {
  variant: "presentation" | "edit";
  children: ReactNode;
}) {
  return (
    <MarketingLayoutChromeProvider>
      <div className="flex min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <MarketingAppSidebar variant={variant} />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </MarketingLayoutChromeProvider>
  );
}
