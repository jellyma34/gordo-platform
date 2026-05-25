"use client";

import { DduRevenueSection } from "@/components/marketing/dduRevenue/DduRevenueSection";
import { MarketingAnalyticsSectionIsland } from "@/components/marketing/MarketingAnalyticsSectionIsland";
import { InventoryDepletionSection } from "@/components/marketing/inventoryDepletion/InventoryDepletionSection";
import { InstallmentForecastSection } from "@/components/marketing/installmentForecast/InstallmentForecastSection";
import { ProjectValueSection } from "@/components/marketing/projectValue/ProjectValueSection";
import { SqmPriceDynamicsSection } from "@/components/marketing/sqmPriceDynamics/SqmPriceDynamicsSection";
import { useMarketingPresentationLight } from "@/components/marketing/marketingPresentationLightContext";
import type { MarketingPeriodGranularity } from "./MarketingFilters";

type Props = {
  presentation: boolean;
  period: MarketingPeriodGranularity;
  objectId: string;
};

export function InstallmentDduPanel({ presentation, period, objectId }: Props) {
  const mplLight = useMarketingPresentationLight();
  const presDark = presentation && !mplLight;

  return (
    <div className="flex flex-col">
      <DduRevenueSection
        presentation={presentation}
        presDark={presDark}
        mplPremium={mplLight}
        isEditMode={!presentation}
        period={period}
        objectId={objectId}
      />

      <MarketingAnalyticsSectionIsland presDark={presDark} id="marketing-project-value">
        <ProjectValueSection
          presentation={presentation}
          presDark={presDark}
          mplPremium={mplLight}
          isEditMode={!presentation}
          period={period}
          objectId={objectId}
        />
      </MarketingAnalyticsSectionIsland>

      <MarketingAnalyticsSectionIsland presDark={presDark} id="marketing-inventory-depletion">
        <InventoryDepletionSection
          presentation={presentation}
          presDark={presDark}
          mplPremium={mplLight}
          period={period}
          objectId={objectId}
        />
      </MarketingAnalyticsSectionIsland>

      <MarketingAnalyticsSectionIsland presDark={presDark} id="marketing-installment-forecast">
        <InstallmentForecastSection
          presentation={presentation}
          presDark={presDark}
          mplPremium={mplLight}
          isEditMode={!presentation}
          period={period}
        />
      </MarketingAnalyticsSectionIsland>

      <MarketingAnalyticsSectionIsland presDark={presDark} id="marketing-sqm-price-dynamics">
        <SqmPriceDynamicsSection
          presentation={presentation}
          presDark={presDark}
          mplPremium={mplLight}
          period={period}
          objectId={objectId}
        />
      </MarketingAnalyticsSectionIsland>
    </div>
  );
}
