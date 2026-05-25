"use client";

import { useMemo } from "react";

import { StoragePerformanceAnalyticsSection } from "@/components/marketing/StoragePerformanceAnalyticsSection";
import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import { STORAGE_KPI_THEME } from "@/lib/entityKpiTheme";
import type { StoragePlanAnalyticsBreakdown } from "@/lib/storagePlanAnalytics";
import {
  storageKpiExecutionPercent,
  storageKpiVolumeCompletionPercent,
  storagePlanPeriodKpiHasAnyData,
  storageProjectVolumeFromKpiData,
  storageProjectVolumeUnit,
  type StoragePlanPeriodKpiUiData,
} from "@/lib/storagePlanPeriodKpi";

type Props = {
  data: StoragePlanPeriodKpiUiData | null | undefined;
  analyticsBreakdown: StoragePlanAnalyticsBreakdown | null | undefined;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  csvLoading?: boolean;
};

export function StoragePlanPeriodKpiSection({
  data,
  analyticsBreakdown,
  presDark,
  presentation,
  mplPremium,
  csvLoading = false,
}: Props) {
  const safeData: StoragePlanPeriodKpiUiData = data ?? { hasCsvPlan: false, factMonth: 0, factCumulative: 0 };
  const hasAnyData = storagePlanPeriodKpiHasAnyData(safeData, analyticsBreakdown);

  const cardsData = useMemo(() => {
    const hasPlan = safeData.hasCsvPlan;
    const planMonth = hasPlan ? safeData.planMonth : null;
    const planCum = hasPlan ? safeData.planCumulative : null;
    const totalProjectPlan = hasPlan ? safeData.totalProjectPlan : null;
    const pctMonth =
      hasPlan && planMonth != null
        ? storageKpiExecutionPercent(safeData.factMonth, planMonth)
        : null;
    const pctCum =
      hasPlan && planCum != null ? storageKpiExecutionPercent(safeData.factCumulative, planCum) : null;
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
      pctVolume: safeData.hasCsvPlan ? storageKpiVolumeCompletionPercent(safeData) : null,
    }),
    [cardsData, safeData],
  );

  const projectVolumeUnits = useMemo(() => {
    const count = storageProjectVolumeFromKpiData(safeData);
    if (count == null) return null;
    return { count, unit: storageProjectVolumeUnit(count) };
  }, [safeData]);

  if (!hasAnyData && !csvLoading) {
    return (
      <EntityPlanPeriodKpiSection
        entityLabel="Кладовые"
        theme={STORAGE_KPI_THEME}
        cardsData={cardsDataWithVolume}
        presDark={presDark}
        presentation={presentation}
        mplPremium={mplPremium}
        projectVolumeUnits={projectVolumeUnits}
        showEmpty
        emptyMessage="Нет данных по кладовым"
      />
    );
  }

  return (
    <EntityPlanPeriodKpiSection
      entityLabel="Кладовые"
      theme={STORAGE_KPI_THEME}
      cardsData={cardsDataWithVolume}
      presDark={presDark}
      presentation={presentation}
      mplPremium={mplPremium}
      projectVolumeUnits={projectVolumeUnits}
      skeleton={csvLoading}
    >
      {!presentation ? (
        <StoragePerformanceAnalyticsSection breakdown={analyticsBreakdown} presDark={presDark} presentation={presentation} />
      ) : null}
    </EntityPlanPeriodKpiSection>
  );
}
