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
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 items-stretch overflow-hidden">
        <MarketingAppSidebar variant={variant} />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">{children}</main>
      </div>
    </MarketingLayoutChromeProvider>
  );
}
