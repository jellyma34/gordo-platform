"use client";

import { EntityPerformanceChart } from "@/components/marketing/EntityPerformanceChart";
import { performanceChartHasData, type PerformanceChartRow } from "@/lib/entityPerformanceChart";

type Props = {
  title: string;
  rows: readonly PerformanceChartRow[];
  hasCsvPlan: boolean;
  presDark: boolean;
  presentation: boolean;
  emptyMessage?: string;
  unitSuffix?: string;
};

/** Breakdown-графики плана/факта — только режим редактирования. */
const PLAN_EXECUTION_ANALYTICS_HIDDEN_IN_PRESENTATION = new Set([
  "Аналитика выполнения плана по комнатности",
  "Аналитика выполнения плана по машино-местам",
  "Аналитика выполнения плана по кладовым",
]);

export function EntityPerformanceAnalyticsSection({
  title,
  rows,
  hasCsvPlan,
  presDark,
  presentation,
  emptyMessage = "Нет данных для графика",
  unitSuffix,
}: Props) {
  if (presentation && PLAN_EXECUTION_ANALYTICS_HIDDEN_IN_PRESENTATION.has(title)) {
    return null;
  }

  const shellCls = presDark
    ? "rounded-[20px] border border-white/10 bg-slate-900/40 shadow-[0_6px_24px_rgba(0,0,0,0.2)]"
    : presentation
      ? "rounded-[20px] border border-black/[0.04] bg-white/90 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
      : "rounded-[20px] border border-slate-200/60 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.04)]";

  const titleCls = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-900";
  const hasData = performanceChartHasData(rows);

  return (
    <div
      className="mt-6 min-w-0 border-t pt-5 md:mt-7 md:pt-6"
      style={{ borderColor: presDark ? "rgba(255,255,255,0.1)" : "rgba(226,232,240,0.55)" }}
    >
      <h3 className={`mb-3 text-base font-bold tracking-tight sm:text-lg ${titleCls}`}>{title}</h3>

      <div className={`min-w-0 px-4 pb-3 pt-3 sm:px-5 sm:pb-3.5 sm:pt-3 ${shellCls}`}>
        {hasData ? (
          <EntityPerformanceChart
            rows={rows}
            hasCsvPlan={hasCsvPlan}
            presDark={presDark}
            presentation={presentation}
            emptyMessage={emptyMessage}
            unitSuffix={unitSuffix}
          />
        ) : (
          <p className={`py-10 text-center text-sm ${presDark ? "text-slate-400" : "text-slate-500"}`}>
            {emptyMessage}
          </p>
        )}
      </div>
    </div>
  );
}
