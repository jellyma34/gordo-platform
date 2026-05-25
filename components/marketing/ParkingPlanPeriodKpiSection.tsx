"use client";

import { useMemo } from "react";

import { ParkingPerformanceAnalyticsSection } from "@/components/marketing/ParkingPerformanceAnalyticsSection";
import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import { PARKING_KPI_THEME } from "@/lib/entityKpiTheme";
import type { ParkingPlanAnalyticsBreakdown } from "@/lib/parkingPlanAnalytics";
import {
  parkingKpiExecutionPercent,
  parkingKpiVolumeCompletionPercent,
  parkingPlanPeriodKpiHasAnyData,
  parkingProjectVolumeFromKpiData,
  parkingProjectVolumeUnit,
  type ParkingPlanPeriodKpiUiData,
} from "@/lib/parkingPlanPeriodKpi";

type Props = {
  data: ParkingPlanPeriodKpiUiData | null | undefined;
  analyticsBreakdown: ParkingPlanAnalyticsBreakdown | null | undefined;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  csvLoading?: boolean;
  /** Пустая строка — заголовок сегмента только в accordion. */
  entityLabel?: string;
  leadingSection?: boolean;
};

export function ParkingPlanPeriodKpiSection({
  data,
  analyticsBreakdown,
  presDark,
  presentation,
  mplPremium,
  csvLoading = false,
  entityLabel = "Машино-места",
  leadingSection = false,
}: Props) {
  const safeData: ParkingPlanPeriodKpiUiData = data ?? { hasCsvPlan: false, factMonth: 0, factCumulative: 0 };
  const hasAnyData = parkingPlanPeriodKpiHasAnyData(safeData, analyticsBreakdown);

  const cardsData = useMemo(() => {
    const hasPlan = safeData.hasCsvPlan;
    const planMonth = hasPlan ? safeData.planMonth : null;
    const planCum = hasPlan ? safeData.planCumulative : null;
    const totalProjectPlan = hasPlan ? safeData.totalProjectPlan : null;
    const pctMonth =
      hasPlan && planMonth != null
        ? parkingKpiExecutionPercent(safeData.factMonth, planMonth)
        : null;
    const pctCum =
      hasPlan && planCum != null ? parkingKpiExecutionPercent(safeData.factCumulative, planCum) : null;
    return {
      hasCsvPlan: hasPlan,
      factMonth: safeData.factMonth,
      factCumulative: safeData.factCumulative,
      planMonth,
      planCumulative: planCum,
      totalProjectPlan,
      pctMonth,
      pctCum,
      pctVolume: null as number | null,
    };
  }, [safeData]);

  const cardsDataWithVolume = useMemo(
    () => ({
      ...cardsData,
      pctVolume: safeData.hasCsvPlan ? parkingKpiVolumeCompletionPercent(safeData) : null,
    }),
    [cardsData, safeData],
  );

  const projectVolumeUnits = useMemo(() => {
    const count = parkingProjectVolumeFromKpiData(safeData);
    if (count == null) return null;
    return { count, unit: parkingProjectVolumeUnit(count) };
  }, [safeData]);

  if (!hasAnyData && !csvLoading) {
    return (
      <EntityPlanPeriodKpiSection
        entityLabel={entityLabel}
        illustrationSegment="parking"
        theme={PARKING_KPI_THEME}
        cardsData={cardsDataWithVolume}
        presDark={presDark}
        presentation={presentation}
        mplPremium={mplPremium}
        projectVolumeUnits={projectVolumeUnits}
        embedded
        leadingSection={leadingSection}
        cardsLayout="ddu-revenue-premium"
        cardsDensity="ddu-revenue-premium"
        showEmpty
        emptyMessage="Нет данных по машино-местам"
      />
    );
  }

  return (
    <EntityPlanPeriodKpiSection
      entityLabel={entityLabel}
      illustrationSegment="parking"
      theme={PARKING_KPI_THEME}
      cardsData={cardsDataWithVolume}
      presDark={presDark}
      presentation={presentation}
      mplPremium={mplPremium}
      projectVolumeUnits={projectVolumeUnits}
      embedded
      leadingSection={leadingSection}
      cardsLayout="ddu-revenue-premium"
      cardsDensity="ddu-revenue-premium"
      skeleton={csvLoading}
    >
      {!presentation ? (
        <ParkingPerformanceAnalyticsSection breakdown={analyticsBreakdown} presDark={presDark} presentation={presentation} />
      ) : null}
    </EntityPlanPeriodKpiSection>
  );
}
