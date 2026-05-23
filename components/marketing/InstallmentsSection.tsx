"use client";

import { InstallmentDduPanel } from "@/components/marketing/InstallmentDduPanel";
import {
  MarketingDealsFeedProvider,
  useMarketingDealsFeedOptional,
} from "@/components/marketing/marketingDealsFeedContext";

function InstallmentsSectionInner() {
  return <InstallmentDduPanel presentation={false} period="month" objectId="all" />;
}

/**
 * Раздел «Рассрочка ДДУ» в рабочем режиме маркетинга.
 * Вне MarketingWorkspace подключает свой `/api/deals` (полная история JSON).
 */
export function InstallmentsSection() {
  const feed = useMarketingDealsFeedOptional();
  if (feed) return <InstallmentsSectionInner />;
  return (
    <MarketingDealsFeedProvider>
      <InstallmentsSectionInner />
    </MarketingDealsFeedProvider>
  );
}
