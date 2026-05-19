"use client";

import { useMemo } from "react";

import { CashflowInflowChartLegendToolbar } from "@/components/marketing/CashflowInflowChartLegend";
import { PlanExecutionMonthlyPlanFactLineCard } from "@/components/marketing/PlanExecutionMonthlyPlanFactLineCard";
import { UploadPlanFactCsvButton } from "@/components/marketing/UploadPlanFactCsvButton";
import type { MarketingLeadsCsvChartBundle } from "@/lib/marketingLeadsCsv";
import type { PlanVsFactMonthlyRubPoint } from "@/lib/planExecutionPlanVsFactChart";

type Props = {
  presentation: boolean;
  presDark: boolean;
  mplPremium: boolean;
  isEditMode?: boolean;
  charts: MarketingLeadsCsvChartBundle;
  csvHydrated: boolean;
  csvLoading: boolean;
  hasCsv: boolean;
  onCsvUpload?: (file: File) => Promise<void>;
  onCsvClear?: () => Promise<void>;
};

function seriesHasPoints(rows: readonly PlanVsFactMonthlyRubPoint[] | undefined): boolean {
  return Array.isArray(rows) && rows.length > 0;
}

export function MarketingLeadsCsvSection({
  presentation,
  presDark,
  mplPremium,
  isEditMode = false,
  charts,
  csvHydrated,
  csvLoading,
  hasCsv,
  onCsvUpload,
  onCsvClear,
}: Props) {
  const showUpload = isEditMode && !presentation && onCsvUpload != null && onCsvClear != null;

  const hasAnyChart = useMemo(
    () =>
      seriesHasPoints(charts.adSpend) ||
      seriesHasPoints(charts.leads) ||
      seriesHasPoints(charts.deals),
    [charts],
  );

  const titleCls = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-900";
  const mutedCls = presDark ? "text-slate-400" : presentation ? "text-mpl-muted" : "text-slate-500";

  const sharedCardProps = {
    presentation,
    presDark,
    mplPremium,
    isEditMode,
    hideCsvUpload: true,
    hideLegend: true,
    chartDescription: null as null,
    planFactCsvHydrated: csvHydrated,
    planFactCsvLoading: csvLoading,
    hasPlanFactCsv: hasCsv,
  };

  return (
    <div
      className={`mt-6 w-full min-w-0 border-t pt-6 ${
        presDark ? "border-white/10" : presentation ? "border-mpl-border/70" : "border-slate-200/70"
      }`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className={`text-sm font-semibold tracking-tight sm:text-base ${titleCls}`}>Маркетинг</h3>
          {!presentation ? (
            <p className={`mt-1 text-[11px] leading-relaxed ${mutedCls}`}>
              Данные из файла <span className="font-medium">лиды.csv</span> (расходы на рекламу, лиды, сделки).
            </p>
          ) : null}
        </div>
        {showUpload ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <UploadPlanFactCsvButton
              hasCsv={hasCsv}
              loading={!csvHydrated || csvLoading}
              presDark={presDark}
              onUploadFile={onCsvUpload}
              onClear={onCsvClear}
            />
          </div>
        ) : null}
      </div>

      {!csvHydrated ? (
        <p className={`flex h-[200px] items-center justify-center px-3 text-center text-sm ${mutedCls}`}>Загрузка…</p>
      ) : !hasAnyChart ? (
        <div
          className={`flex h-[280px] items-center justify-center rounded-xl border px-4 text-center text-sm ${
            presDark
              ? "border-white/10 bg-slate-900/25 text-slate-400"
              : "border-slate-200/70 bg-white/50 text-slate-500"
          }`}
        >
          Загрузите CSV файл маркетинга
        </div>
      ) : (
        <>
          <div className="mb-3 flex justify-end">
            <CashflowInflowChartLegendToolbar chrome={{ presDark, presentation }} className="sm:justify-end" />
          </div>
          <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
            <PlanExecutionMonthlyPlanFactLineCard
              {...sharedCardProps}
              chartTitle="Расходы на рекламу"
              monthlyPlanVsFact={charts.adSpend}
              valueMode="rub_mln"
              emptyStateMessage="Нет данных по расходам на рекламу"
            />
            <PlanExecutionMonthlyPlanFactLineCard
              {...sharedCardProps}
              chartTitle="Лиды"
              monthlyPlanVsFact={charts.leads}
              valueMode="integer"
              emptyStateMessage="Нет данных по лидам"
            />
            <PlanExecutionMonthlyPlanFactLineCard
              {...sharedCardProps}
              chartTitle="Сделки"
              monthlyPlanVsFact={charts.deals}
              valueMode="integer"
              emptyStateMessage="Нет данных по сделкам"
            />
          </div>
        </>
      )}
    </div>
  );
}
