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
      <div className="flex min-h-0 w-full min-w-0 items-stretch">
        <MarketingAppSidebar variant={variant} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </MarketingLayoutChromeProvider>
  );
}
