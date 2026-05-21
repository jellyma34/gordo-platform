"use client";

import { useMemo } from "react";

import { EntityPerformanceAnalyticsSection } from "@/components/marketing/EntityPerformanceAnalyticsSection";
import { EntityPlanPeriodKpiSection } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiSection";
import type { EntityKpiTheme } from "@/lib/entityKpiTheme";
import {
  buildProjectValueEntityChartRows,
  projectValueEntityAnalyticsHasData,
  type ProjectValueEntityAnalyticsBreakdown,
} from "@/lib/projectValueEntityAnalytics";
import {
  formatProjectValueRub,
  projectValuePeriodKpiHasData,
  projectValueProjectVolumeRail,
  projectValueSliceToCardsData,
  type ProjectValuePeriodKpiUiData,
} from "@/lib/projectValuePeriodKpi";

type Props = {
  entityLabel: string;
  theme: EntityKpiTheme;
  kpiData: ProjectValuePeriodKpiUiData;
  analyticsBreakdown: ProjectValueEntityAnalyticsBreakdown;
  analyticsTitle: string;
  presDark: boolean;
  presentation: boolean;
  mplPremium: boolean;
  skeleton?: boolean;
  showEmpty?: boolean;
  emptyMessage?: string;
};

export function ProjectValueEntityKpiSection({
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
  const cardsData = useMemo(() => projectValueSliceToCardsData(kpiData), [kpiData]);
  const projectVolumeCompactCurrency = useMemo(() => projectValueProjectVolumeRail(kpiData), [kpiData]);
  const chartRows = useMemo(
    () => buildProjectValueEntityChartRows(analyticsBreakdown),
    [analyticsBreakdown],
  );
  const showAnalytics = projectValueEntityAnalyticsHasData(analyticsBreakdown);
  const hasKpi = projectValuePeriodKpiHasData(kpiData) || showAnalytics;

  if (!hasKpi && !skeleton && !showEmpty) return null;

  return (
    <div
      className="mt-6 min-w-0 border-t pt-6 md:mt-7 md:pt-7"
      style={{ borderColor: presDark ? "rgba(255,255,255,0.1)" : "rgba(226,232,240,0.55)" }}
    >
      <EntityPlanPeriodKpiSection
        entityLabel={entityLabel}
        theme={theme}
        cardsData={cardsData}
        presDark={presDark}
        presentation={presentation}
        mplPremium={mplPremium}
        sectionTitle="Общая стоимость проекта"
        formatMetric={formatProjectValueRub}
        projectVolumeCompactCurrency={projectVolumeCompactCurrency}
        cardsDensity="project-value-entity"
        skeleton={skeleton}
        showEmpty={showEmpty && !hasKpi}
        emptyMessage={emptyMessage}
      />

      {showAnalytics && !skeleton ? (
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
