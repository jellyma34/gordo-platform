"use client";

import { useMemo } from "react";

import { EntityPerformanceAnalyticsSection } from "@/components/marketing/EntityPerformanceAnalyticsSection";
import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import type { EntityKpiTheme } from "@/lib/entityKpiTheme";
import { marketingAnalyticsSegmentBorderColor } from "@/lib/marketingAnalyticsSectionShell";
import {
  buildInstallmentAreaEntityAreaChartRows,
  installmentAreaEntityAnalyticsHasData,
  type InstallmentAreaEntityAnalyticsBreakdown,
} from "@/lib/installmentAreaEntityAreaAnalytics";
import {
  formatInstallmentAreaSqm,
  installmentAreaPeriodKpiHasData,
  installmentAreaProjectVolumeRail,
  installmentAreaSliceToCardsData,
  type InstallmentAreaPeriodKpiUiData,
} from "@/lib/installmentAreaPeriodKpi";

type Props = {
  entityLabel: string;
  theme: EntityKpiTheme;
  kpiData: InstallmentAreaPeriodKpiUiData;
  analyticsBreakdown: InstallmentAreaEntityAnalyticsBreakdown;
  analyticsTitle: string;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  skeleton?: boolean;
  showEmpty?: boolean;
  emptyMessage?: string;
};

/** KPI площади сущности + аналитика (как блок «Квартиры» в Рассрочка ДДУ). */
export function InstallmentAreaEntityKpiSection({
  entityLabel,
  theme,
  kpiData,
  analyticsBreakdown,
  analyticsTitle,
  presDark,
  presentation,
  mplPremium,
  skeleton = false,
  showEmpty = false,
  emptyMessage = "Нет данных",
}: Props) {
  const cardsData = useMemo(() => installmentAreaSliceToCardsData(kpiData), [kpiData]);
  const projectVolume = useMemo(() => installmentAreaProjectVolumeRail(kpiData), [kpiData]);
  const chartRows = useMemo(
    () => buildInstallmentAreaEntityAreaChartRows(analyticsBreakdown),
    [analyticsBreakdown],
  );
  const showAnalytics = installmentAreaEntityAnalyticsHasData(analyticsBreakdown);
  const hasKpi = installmentAreaPeriodKpiHasData(kpiData) || (showAnalytics && !presentation);

  if (!hasKpi && !skeleton && !showEmpty) return null;

  return (
    <div
      className="mt-6 min-w-0 border-t pt-6 md:mt-7 md:pt-7"
      style={{ borderColor: marketingAnalyticsSegmentBorderColor(presDark) }}
    >
      <EntityPlanPeriodKpiSection
        embedded
        entityLabel={entityLabel}
        theme={theme}
        cardsData={cardsData}
        presDark={presDark}
        presentation={presentation}
        mplPremium={mplPremium}
        sectionTitle="Общая площадь, кв.м"
        formatMetric={formatInstallmentAreaSqm}
        projectVolume={projectVolume}
        cardsDensity="installment-area-entity"
        skeleton={skeleton}
        showEmpty={showEmpty && !hasKpi}
        emptyMessage={emptyMessage}
      />

      {showAnalytics && !skeleton && !presentation ? (
        <EntityPerformanceAnalyticsSection
          title={analyticsTitle}
          rows={chartRows}
          hasCsvPlan={analyticsBreakdown.hasCsvPlan}
          presDark={presDark}
          presentation={presentation}
          emptyMessage={emptyMessage}
          unitSuffix="кв.м"
        />
      ) : null}
    </div>
  );
}
