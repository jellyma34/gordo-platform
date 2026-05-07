import type { ReactNode } from "react";

import { MarketingAppShell } from "@/components/marketing/MarketingAppShell";
import { MarketingEditTabProvider } from "@/components/marketing/marketingEditTabContext";

export default function EditMarketingLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingEditTabProvider>
      {/*
        Высота минус полоса ModeBar (sticky под корневым layout), иначе body скроллится целиком и уезжает сайдбар.
      */}
      <div className="flex h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden">
        <MarketingAppShell variant="edit">{children}</MarketingAppShell>
      </div>
    </MarketingEditTabProvider>
  );
}
