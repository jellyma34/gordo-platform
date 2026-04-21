import type { ReactNode } from "react";

import { MarketingPresentationLightRoot } from "@/components/marketing/marketingPresentationLightContext";

/**
 * Светлая тема презентации маркетинга (marketing-presentation-light).
 * Остальные разделы /presentation/* не затрагиваются.
 */
export default function PresentationMarketingLayout({ children }: { children: ReactNode }) {
  return <MarketingPresentationLightRoot>{children}</MarketingPresentationLightRoot>;
}
