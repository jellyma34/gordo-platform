"use client";

import { useMemo } from "react";

import type { DealSegmentKey } from "@/components/marketing/DealsSection";
import { EntityPerformanceAnalyticsSection } from "@/components/marketing/EntityPerformanceAnalyticsSection";
import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import type { EntityKpiTheme } from "@/lib/entityKpiTheme";
import { marketingAnalyticsSegmentBorderColor } from "@/lib/marketingAnalyticsSectionShell";
import {
  buildDduRevenueEntityChartRows,
  dduRevenueEntityAnalyticsHasData,
  type DduRevenueEntityAnalyticsBreakdown,
} from "@/lib/dduRevenueEntityAnalytics";
import {
  dduRevenuePeriodKpiHasData,
  dduRevenueProjectVolumeRail,
  dduRevenueSliceToCardsData,
  formatDduRevenueRub,
  type DduRevenuePeriodKpiUiData,
} from "@/lib/dduRevenuePeriodKpi";

type Props = {
  entityLabel: string;
  illustrationSegment: DealSegmentKey;
  theme: EntityKpiTheme;
  kpiData: DduRevenuePeriodKpiUiData;
  analyticsBreakdown: DduRevenueEntityAnalyticsBreakdown;
  analyticsTitle: string;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  skeleton?: boolean;
  showEmpty?: boolean;
  emptyMessage?: string;
};

export function DduRevenueEntityKpiSection({
  entityLabel,
  illustrationSegment,
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
  const cardsData = useMemo(() => dduRevenueSliceToCardsData(kpiData), [kpiData]);
  const projectVolumeCompactCurrency = useMemo(() => dduRevenueProjectVolumeRail(kpiData), [kpiData]);
  const chartRows = useMemo(
    () => buildDduRevenueEntityChartRows(analyticsBreakdown),
    [analyticsBreakdown],
  );
  const showAnalytics = dduRevenueEntityAnalyticsHasData(analyticsBreakdown);
  const hasKpi = dduRevenuePeriodKpiHasData(kpiData) || (showAnalytics && !presentation);

  if (!hasKpi && !skeleton && !showEmpty) return null;

  return (
    <div
      className="mt-6 min-w-0 border-t pt-6 md:mt-7 md:pt-7"
      style={{ borderColor: marketingAnalyticsSegmentBorderColor(presDark) }}
    >
      <EntityPlanPeriodKpiSection
        embedded
        entityLabel={entityLabel}
        illustrationSegment={illustrationSegment}
        theme={theme}
        cardsData={cardsData}
        presDark={presDark}
        presentation={presentation}
        mplPremium={mplPremium}
        sectionTitle="Продажи по заключенным ДДУ, руб."
        formatMetric={formatDduRevenueRub}
        projectVolumeCompactCurrency={projectVolumeCompactCurrency}
        cardsLayout="ddu-revenue-premium"
        cardsDensity="ddu-revenue-premium"
        skeleton={skeleton}
        showEmpty={showEmpty && !hasKpi}
        emptyMessage={emptyMessage}
      />

      {showAnalytics && !skeleton && !presentation ? (
        <EntityPerformanceAnalyticsSection
          title={analyticsTitle}
          rows={chartRows}
          hasCsvPlan={cardsData.hasCsvPlan}
          presDark={presDark}
          presentation={presentation}
          unitSuffix="₽"
        />
      ) : null}
    </div>
  );
}
