"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { marketingMockData } from "@/lib/marketingMockData";
import { MarketingDealsFeedProvider } from "./marketingDealsFeedContext";
import { InstallmentDduPanel } from "./InstallmentDduPanel";
import { MarketingFilters, type MarketingPeriodGranularity } from "./MarketingFilters";
import { SalesDealsSection } from "./SalesDealsSection";
import { SalesPlanPanel, type PlanScenario } from "./SalesPlanPanel";
import type { MarketingTab } from "./marketingTypes";
import { useRegisterMarketingLayoutChrome } from "@/components/marketing/marketingLayoutChromeContext";
import { useMarketingEditTabOptional } from "@/components/marketing/marketingEditTabContext";
import { MPL_PREMIUM_GLASS_MAIN } from "@/lib/marketingPremiumUi";
import { useMarketingPresentationLight, useMarketingPresVisual } from "./marketingPresentationLightContext";

export type { MarketingTab } from "./marketingTypes";

type Props = {
  modeLabel: string;
  presentation: boolean;
  onBackToBlocks: () => void;
  /** В презентации по маршруту /presentation/marketing/* — какой блок показать. */
  presentationActiveTab?: MarketingTab;
  /** Синхронизация с URL при открытии из пояснения. */
  initialPeriod?: MarketingPeriodGranularity;
  initialObjectId?: string;
  initialPlanScenario?: PlanScenario;
};

export function MarketingWorkspace({
  modeLabel,
  presentation,
  onBackToBlocks,
  presentationActiveTab,
  initialPeriod,
  initialObjectId,
  initialPlanScenario,
}: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const mplLight = useMarketingPresentationLight();
  const presDark = useMarketingPresVisual(presentation) === "presDark";
  const editCtx = useMarketingEditTabOptional();

  const [period, setPeriod] = useState<MarketingPeriodGranularity>(initialPeriod ?? "month");
  const [objectId, setObjectId] = useState(initialObjectId ?? "all");

  const activeTab = presentation
    ? (presentationActiveTab ?? "sales")
    : (editCtx?.activeTab ?? "sales");

  const chromeRegistration = useMemo(
    () => ({ modeLabel, presentation, onBackToBlocks }),
    [modeLabel, presentation, onBackToBlocks],
  );
  useRegisterMarketingLayoutChrome(chromeRegistration);

  useEffect(() => {
    if (!presentation) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("period", period);
    next.set("objectId", objectId);
    next.delete("dealTypeId");
    const newQs = next.toString();
    if (newQs !== searchParams.toString()) {
      router.replace(newQs ? `${pathname}?${newQs}` : pathname, { scroll: false });
    }
  }, [presentation, period, objectId, pathname, router, searchParams]);

  const outer = "mx-auto w-full min-w-0 max-w-[1400px]";

  const premiumLight = presentation && mplLight && !presDark;

  const filterWell = presDark
    ? "rounded-2xl border border-slate-700/60 bg-[#1e293b]/80 p-4 sm:p-5"
    : premiumLight
      ? `${MPL_PREMIUM_GLASS_MAIN} p-5 sm:p-6`
      : presentation
        ? "rounded-2xl border border-mpl-border bg-mpl-card p-5 sm:p-6"
        : "rounded-2xl border border-slate-200/70 bg-white p-5 sm:p-6 shadow-[0_4px_24px_rgba(15,23,42,0.04)]";

  return (
    <MarketingDealsFeedProvider>
      <section className={outer}>
        <div className={filterWell}>
          <MarketingFilters
            presentation={presentation}
            period={period}
            onPeriodChange={setPeriod}
            objectId={objectId}
            onObjectIdChange={setObjectId}
            objects={marketingMockData.objects}
            showPeriod={presentation || activeTab !== "deals"}
          />

          <div className="mt-6 min-w-0">
            {activeTab === "sales" ? (
              <SalesPlanPanel
                presentation={presentation}
                period={period}
                objectId={objectId}
                initialPlanScenario={initialPlanScenario}
              />
            ) : activeTab === "deals" ? (
              <SalesDealsSection presentation={presentation} period={period} objectId={objectId} />
            ) : (
              <InstallmentDduPanel presentation={presentation} period={period} objectId={objectId} />
            )}
          </div>
        </div>
      </section>
    </MarketingDealsFeedProvider>
  );
}
