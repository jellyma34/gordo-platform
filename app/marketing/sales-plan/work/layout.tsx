import type { ReactNode } from "react";

import { MarketingAppShell } from "@/components/marketing/MarketingAppShell";
import { MarketingEditTabProvider } from "@/components/marketing/marketingEditTabContext";

export default function MarketingSalesPlanWorkLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingEditTabProvider>
      {/*
        Высота минус полоса ModeBar — иначе прокрутка на уровне document и сайдбар не фиксируется.
      */}
      <div className="flex h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden">
        <MarketingAppShell variant="edit">{children}</MarketingAppShell>
      </div>
    </MarketingEditTabProvider>
  );
}
