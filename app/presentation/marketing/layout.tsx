import type { ReactNode } from "react";

import { MarketingAppShell } from "@/components/marketing/MarketingAppShell";
import { MarketingPresentationLightRoot } from "@/components/marketing/marketingPresentationLightContext";

/**
 * Светлая тема презентации маркетинга (marketing-presentation-light).
 * Остальные разделы /presentation/* не затрагиваются.
 */
export default function PresentationMarketingLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingPresentationLightRoot>
      <MarketingAppShell variant="presentation">{children}</MarketingAppShell>
    </MarketingPresentationLightRoot>
  );
}
