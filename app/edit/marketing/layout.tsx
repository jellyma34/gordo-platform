import type { ReactNode } from "react";

import { MarketingAppShell } from "@/components/marketing/MarketingAppShell";
import { MarketingEditTabProvider } from "@/components/marketing/marketingEditTabContext";

export default function EditMarketingLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingEditTabProvider>
      <MarketingAppShell variant="edit">{children}</MarketingAppShell>
    </MarketingEditTabProvider>
  );
}
