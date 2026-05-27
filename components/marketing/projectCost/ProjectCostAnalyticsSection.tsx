"use client";

import { useEffect, useMemo, useState } from "react";

import { BlockMonthSelector } from "@/components/marketing/BlockMonthSelector";
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
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
import { formatProjectValueWithoutCurrency } from "@/lib/projectValuePeriodKpi";
import { SALES_PLAN_OBJECT_TYPE_TAB_ORDER, type SalesPlanObjectTypeKey } from "@/lib/salesPlanByObjectType";
import type { MarketingPdfRenderProps } from "@/utils/pdf/marketingPdfRenderProps";

type Props = UseProjectCostSalesBlockArgs &
  MarketingPdfRenderProps & {
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
  pdfRender = false,
  forcedObjectType,
  hideInteractiveControls = false,
}: Props) {
  const [blockMonthKey, setBlockMonthKey] = useState<string>(() => {
    const mk = typeof currentPeriodKey === "string" ? normalizeMonthKey(currentPeriodKey) : null;
    if (mk) return mk;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const block = useProjectCostSalesBlock({ period, objectId, currentPeriodKey: blockMonthKey });

  const [activeObjectType, setActiveObjectType] = useState<SalesPlanObjectTypeKey>(forcedObjectType ?? "all");
  const resolvedObjectType = forcedObjectType ?? activeObjectType;

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

  const activeSlice = salesPlanByObjectType[resolvedObjectType];

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
        objectType: resolvedObjectType,
        doc,
        dealRows: dealRowsForFact,
        periodGran,
        currentPeriodKey: resolvedPeriodKey,
      }),
    [resolvedObjectType, resolvedPeriodKey, dealRowsForFact, doc, periodGran],
  );

  const tabEmpty = !showSkeleton && !activeSlice.hasData;
  const panelKey = resolvedObjectType;

  const monthOptions = useMemo(() => {
    const out = new Set<string>();
    for (const r of dealRowsForFact) {
      const mk = normalizeMonthKey((r as { monthKey?: string | null }).monthKey ?? null);
      if (mk) out.add(mk);
    }
    const cur = normalizeMonthKey(blockMonthKey);
    if (cur) out.add(cur);
    return [...out].sort();
  }, [blockMonthKey, dealRowsForFact]);

  useEffect(() => {
    if (!monthOptions.length) return;
    if (!monthOptions.includes(blockMonthKey)) {
      setBlockMonthKey(monthOptions[monthOptions.length - 1]!);
    }
  }, [blockMonthKey, monthOptions]);

  const kpiProps = {
    entityLabel: "",
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
    entityAnalytics?.hasData && !showSkeleton && !presentation && resolvedObjectType !== "commercial";

  return (
    <div className={`project-cost-analytics ${ANALYTICS_SECTION_SPACING_CLASS} ${className}`.trim()}>
      <AnalyticsSegmentLayout
        title="Общая стоимость проекта"
        presDark={presDark}
        presentation={presentation}
        mplPremium={mplPremium}
        headerControls={
          hideInteractiveControls || !monthOptions.length ? null : (
            <BlockMonthSelector
              value={blockMonthKey}
              options={monthOptions}
              onChange={setBlockMonthKey}
              presDark={presDark}
              presentation={presentation}
              mplPremium={presentation && mplPremium}
            />
          )
        }
        showRoomTypeFilter={false}
        objectTabs={objectTabs}
        activeObjectType={resolvedObjectType}
        onObjectTypeChange={setActiveObjectType}
        error={error}
        panelKey={panelKey}
        pdfRender={pdfRender}
        forcedObjectType={forcedObjectType}
        hideInteractiveControls={hideInteractiveControls}
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
