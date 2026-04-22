import type { ReactNode } from "react";

import { MarketingAppShell } from "@/components/marketing/MarketingAppShell";
import { MarketingEditTabProvider } from "@/components/marketing/marketingEditTabContext";

export default function EditMarketingLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingEditTabProvider>
      <div className="flex h-screen max-h-screen min-h-0 flex-col overflow-hidden">
        <MarketingAppShell variant="edit">{children}</MarketingAppShell>
      </div>
    </MarketingEditTabProvider>
  );
}
