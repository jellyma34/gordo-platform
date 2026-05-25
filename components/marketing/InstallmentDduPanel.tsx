"use client";

import { DduRevenueSection } from "@/components/marketing/dduRevenue/DduRevenueSection";
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
    <div className="flex flex-col gap-4">
      <DduRevenueSection
        presentation={presentation}
        presDark={presDark}
        mplPremium={mplLight}
        isEditMode={!presentation}
        period={period}
        objectId={objectId}
      />

      <ProjectValueSection
        presentation={presentation}
        presDark={presDark}
        mplPremium={mplLight}
        isEditMode={!presentation}
        period={period}
        objectId={objectId}
      />

      <InventoryDepletionSection
        presentation={presentation}
        presDark={presDark}
        mplPremium={mplLight}
        period={period}
        objectId={objectId}
      />

      <InstallmentForecastSection
        presentation={presentation}
        presDark={presDark}
        mplPremium={mplLight}
        isEditMode={!presentation}
        period={period}
      />

      <SqmPriceDynamicsSection
        presentation={presentation}
        presDark={presDark}
        mplPremium={mplLight}
        period={period}
        objectId={objectId}
      />
    </div>
  );
}
