"use client";

import { useMemo } from "react";

import {
  analyticsDashboardShellClass,
  ANALYTICS_SECTION_SPACING_CLASS,
  resolveAnalyticsSegmentSurface,
} from "@/components/marketing/analytics/analyticsDashboardShell";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";
import { UploadPlanFactCsvButton } from "@/components/marketing/UploadPlanFactCsvButton";
import { PlanFactChart } from "@/components/marketing/salesPlanExecution/PlanFactChart";
import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import type { PlanVsFactMonthlyRubPoint } from "@/lib/planExecutionPlanVsFactChart";
import {
  useSalesPlanExecutionBlock,
  type UseSalesPlanExecutionBlockArgs,
} from "@/lib/salesPlanExecution/useSalesPlanExecutionBlock";

type Props = UseSalesPlanExecutionBlockArgs & {
  presentation: boolean;
  presDark: boolean;
  mplPremium?: boolean;
  className?: string;
  monthlyPlanVsFact?: readonly PlanVsFactMonthlyRubPoint[] | null;
  dealRows?: readonly NormalizedDealRow[];
  hasPlanFactCsv?: boolean;
  isEditMode?: boolean;
  planFactCsvHydrated?: boolean;
  planFactCsvLoading?: boolean;
  onPlanFactCsvUpload?: (file: File) => Promise<void>;
  onPlanFactCsvClear?: () => Promise<void>;
};

/**
 * Блок «Исполнение плана продаж»: заголовок, режим графика, легенда, plan/fact line chart.
 * Не путать с PlanExecutionMonthlyPlanFactLineCard (только график).
 */
export function SalesPlanExecutionSection({
  presentation,
  presDark,
  mplPremium = false,
  period = "month",
  objectId = "all",
  currentPeriodKey,
  monthlyPlanVsFact = null,
  dealRows = [],
  hasPlanFactCsv = false,
  isEditMode = false,
  planFactCsvHydrated = true,
  planFactCsvLoading = false,
  onPlanFactCsvUpload,
  onPlanFactCsvClear,
  className = "",
}: Props) {
  const block = useSalesPlanExecutionBlock({
    period,
    objectId,
    currentPeriodKey,
    monthlyPlanVsFact,
    dealRows: dealRows.length > 0 ? dealRows : null,
    hasPlanFactCsv,
  });
  const { chartMode, setChartMode, chartRows, hasData, currentPeriodKey: periodKey } = block;

  const shellCls = analyticsDashboardShellClass(presDark, presentation, mplPremium);
  const segmentSurface = resolveAnalyticsSegmentSurface(presDark, presentation, mplPremium);
  const titleCls = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-950";
  const pillsWrapCls = presDark
    ? "flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    : "flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  const chartAnimKey = `${periodKey}-${chartMode}`;

  const showDashboard = useMemo(
    () => hasData || (monthlyPlanVsFact?.length ?? 0) > 0,
    [hasData, monthlyPlanVsFact],
  );

  const showPlanFactCsvUpload =
    isEditMode &&
    !presentation &&
    onPlanFactCsvUpload != null &&
    onPlanFactCsvClear != null;

  return (
    <section
      className={`sales-plan-execution w-full min-w-0 max-w-none ${ANALYTICS_SECTION_SPACING_CLASS} ${className}`.trim()}
      aria-labelledby="sales-plan-execution-heading"
      data-analytics-section="sales-plan-execution-full"
    >
      <div
        className={`relative min-w-0 overflow-hidden px-4 pt-3.5 pb-3 sm:px-5 sm:pt-4 sm:pb-3.5 md:px-6 md:pt-4 md:pb-3.5 ${shellCls}`}
      >
        <header className="mb-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2
              id="sales-plan-execution-heading"
              className={`text-sm font-bold leading-snug tracking-tight sm:text-[15px] ${titleCls}`}
            >
              Исполнение плана продаж
            </h2>
          </div>
          <div className="flex min-w-0 shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
            {showPlanFactCsvUpload ? (
              <UploadPlanFactCsvButton
                hasCsv={hasPlanFactCsv}
                loading={!planFactCsvHydrated || planFactCsvLoading}
                presDark={presDark}
                onUploadFile={onPlanFactCsvUpload}
                onClear={onPlanFactCsvClear}
              />
            ) : null}
            <div className={pillsWrapCls} role="tablist" aria-label="Режим графика">
              <button
                type="button"
                role="tab"
                aria-selected={chartMode === "monthly"}
                onClick={() => setChartMode("monthly")}
                className={segmentedControlTabClass(chartMode === "monthly", segmentSurface)}
              >
                Помесячно
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={chartMode === "cumulative"}
                onClick={() => setChartMode("cumulative")}
                className={segmentedControlTabClass(chartMode === "cumulative", segmentSurface)}
              >
                Нарастающим итогом
              </button>
            </div>
          </div>
        </header>

        {showDashboard ? (
          <PlanFactChart
            rows={chartRows}
            chartMode={chartMode}
            chartKey={chartAnimKey}
            presDark={presDark}
            presentation={presentation}
            mplPremium={mplPremium}
          />
        ) : (
          <p className={`py-6 text-center text-sm ${presDark ? "text-slate-400" : "text-slate-500"}`}>
            Нет данных плана и факта продаж для выбранного среза. Загрузите CSV «поступления_план_факт» в режиме
            редактирования.
          </p>
        )}
      </div>
    </section>
  );
}
