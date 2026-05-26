"use client";

import { useMemo, useState } from "react";

import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import type { PlanVsFactMonthlyRubPoint } from "@/lib/planExecutionPlanVsFactChart";
import {
  buildSalesPlanExecutionChartRows,
  resolveSalesPlanExecutionMergedRows,
  resolveSalesPlanExecutionPeriodSummary,
  salesPlanExecutionHasData,
  type SalesPlanExecutionChartMode,
} from "@/lib/salesPlanExecution/buildSalesPlanExecutionData";

export type UseSalesPlanExecutionBlockArgs = {
  period?: MarketingPeriodGranularity;
  objectId?: string;
  currentPeriodKey?: string;
  /** Помесячный план/факт (₽) из CSV — тот же ряд, что у legacy PlanExecutionMonthlyPlanFactLineCard. */
  monthlyPlanVsFact?: readonly PlanVsFactMonthlyRubPoint[] | null;
  /** Сделки JSON: в режиме «Помесячно» обнуляют факт в месяцах без новых продаж. */
  dealRows?: readonly { dealDateMs: number }[] | null;
  hasPlanFactCsv?: boolean;
};

function defaultDashboardPeriodKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Изолированный datasource: CSV plan_fact → fallback salesPlan + salesFact + salesRevenue. */
export function useSalesPlanExecutionBlock({
  period = "month",
  objectId = "all",
  currentPeriodKey = defaultDashboardPeriodKey(),
  monthlyPlanVsFact = null,
  dealRows = null,
  hasPlanFactCsv = false,
}: UseSalesPlanExecutionBlockArgs = {}) {
  const [chartMode, setChartMode] = useState<SalesPlanExecutionChartMode>("monthly");
  const resolvedPeriodKey = currentPeriodKey ?? defaultDashboardPeriodKey();
  const periodGran: "month" | "quarter" = period === "quarter" ? "quarter" : "month";

  const mergedRows = useMemo(
    () => resolveSalesPlanExecutionMergedRows(periodGran, objectId, monthlyPlanVsFact, dealRows),
    [monthlyPlanVsFact, dealRows, objectId, periodGran],
  );

  const chartRows = useMemo(
    () => buildSalesPlanExecutionChartRows(mergedRows, chartMode, dealRows),
    [chartMode, dealRows, mergedRows],
  );

  const summary = useMemo(
    () => resolveSalesPlanExecutionPeriodSummary(mergedRows, resolvedPeriodKey),
    [mergedRows, resolvedPeriodKey],
  );

  const hasData = salesPlanExecutionHasData(mergedRows);

  return {
    chartMode,
    setChartMode,
    mergedRows,
    chartRows,
    summary,
    hasData,
    hasPlanFactCsv,
    periodGran,
    currentPeriodKey: resolvedPeriodKey,
  };
}

export type SalesPlanExecutionBlockState = ReturnType<typeof useSalesPlanExecutionBlock>;
