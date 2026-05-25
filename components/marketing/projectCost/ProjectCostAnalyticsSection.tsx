"use client";

import { useMemo, useState } from "react";

import { AnalyticsKpiCard } from "@/components/marketing/analytics/AnalyticsKpiCard";
import { AnalyticsPlanFactCard } from "@/components/marketing/analytics/AnalyticsPlanFactCard";
import {
  AnalyticsSegmentLayout,
  type AnalyticsObjectTab,
} from "@/components/marketing/analytics/AnalyticsSegmentLayout";
import { ANALYTICS_SECTION_SPACING_CLASS } from "@/components/marketing/analytics/analyticsDashboardShell";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { PROJECT_VALUE_KPI_THEME } from "@/lib/entityKpiTheme";
import { resolveProjectValueEntityAnalytics } from "@/lib/projectCost/resolveProjectValueEntityAnalytics";
import {
  useProjectCostSalesBlock,
  type UseProjectCostSalesBlockArgs,
} from "@/lib/projectCost/useProjectCostSalesBlock";
import { formatProjectValueWithoutCurrency } from "@/lib/projectValuePeriodKpi";
import { SALES_PLAN_OBJECT_TYPE_TAB_ORDER, type SalesPlanObjectTypeKey } from "@/lib/salesPlanByObjectType";

type Props = UseProjectCostSalesBlockArgs & {
  presentation: boolean;
  presDark: boolean;
  mplPremium?: boolean;
  className?: string;
};

/** Блок «Общая стоимость проекта» на дашборде плана продаж (изолированный state, без комнатности). */
export function ProjectCostAnalyticsSection({
  presentation,
  presDark,
  mplPremium = false,
  period = "month",
  objectId = "all",
  currentPeriodKey,
  className = "",
}: Props) {
  const block = useProjectCostSalesBlock({ period, objectId, currentPeriodKey });

  const [activeObjectType, setActiveObjectType] = useState<SalesPlanObjectTypeKey>("all");

  const {
    error,
    showSkeleton,
    showEmpty,
    salesPlanByObjectType,
    doc,
    periodGran,
    currentPeriodKey: resolvedPeriodKey,
    dealRowsForFact,
  } = block;

  const activeSlice = salesPlanByObjectType[activeObjectType];

  const objectTabs: AnalyticsObjectTab[] = useMemo(
    () =>
      SALES_PLAN_OBJECT_TYPE_TAB_ORDER.map((key) => ({
        key,
        label: salesPlanByObjectType[key].definition.label,
        hasData: salesPlanByObjectType[key].hasData,
      })),
    [salesPlanByObjectType],
  );

  const entityAnalytics = useMemo(
    () =>
      resolveProjectValueEntityAnalytics({
        objectType: activeObjectType,
        doc,
        dealRows: dealRowsForFact,
        periodGran,
        currentPeriodKey: resolvedPeriodKey,
      }),
    [activeObjectType, resolvedPeriodKey, dealRowsForFact, doc, periodGran],
  );

  const tabEmpty = !showSkeleton && !activeSlice.hasData;
  const panelKey = activeObjectType;

  const kpiProps = {
    entityLabel: activeSlice.definition.label,
    illustrationSegment: activeSlice.definition.illustrationSegment,
    theme: PROJECT_VALUE_KPI_THEME,
    cardsData: activeSlice.cardsData,
    presDark,
    presentation,
    mplPremium,
    sectionTitle: "Общая стоимость проекта",
    formatMetric: formatProjectValueWithoutCurrency,
    metricIncludesCurrency: false,
    projectPlanFullNumber: true,
    compactBarLabels: true,
    projectVolumeCompactCurrency: activeSlice.projectVolumeCompactCurrency,
  };

  const showPlanFactAnalytics =
    entityAnalytics?.hasData && !showSkeleton && !presentation && activeObjectType !== "commercial";

  return (
    <div className={`project-cost-analytics ${ANALYTICS_SECTION_SPACING_CLASS} ${className}`.trim()}>
      <AnalyticsSegmentLayout
        title="Общая стоимость проекта"
        presDark={presDark}
        presentation={presentation}
        mplPremium={mplPremium}
        showRoomTypeFilter={false}
        objectTabs={objectTabs}
        activeObjectType={activeObjectType}
        onObjectTypeChange={setActiveObjectType}
        error={error}
        panelKey={panelKey}
      >
        {showSkeleton ? (
          <AnalyticsKpiCard {...kpiProps} skeleton />
        ) : showEmpty ? (
          <AnalyticsKpiCard
            {...kpiProps}
            showEmpty
            emptyMessage="Подгрузите CSV стоимости проекта в разделе «Рассрочки ДДУ» или дождитесь данных системы"
          />
        ) : tabEmpty ? (
          <AnalyticsKpiCard
            {...kpiProps}
            showEmpty
            emptyMessage={`Нет данных по сегменту «${activeSlice.definition.label}» в текущем срезе`}
          />
        ) : (
          <>
            <AnalyticsKpiCard {...kpiProps} />
            {showPlanFactAnalytics && entityAnalytics ? (
              <AnalyticsPlanFactCard
                title={entityAnalytics.title}
                rows={entityAnalytics.rows}
                hasCsvPlan={entityAnalytics.hasCsvPlan}
                presDark={presDark}
                presentation={presentation}
                unitSuffix=""
              />
            ) : null}
          </>
        )}
      </AnalyticsSegmentLayout>
    </div>
  );
}
