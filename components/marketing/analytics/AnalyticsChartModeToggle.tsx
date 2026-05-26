"use client";

import {
  resolveAnalyticsSegmentSurface,
} from "@/components/marketing/analytics/analyticsDashboardShell";
import { segmentedControlTabClass } from "@/components/marketing/marketingSegmentedControlClasses";

export type AnalyticsChartMode = "monthly" | "cumulative";

type Props = {
  mode: AnalyticsChartMode;
  onModeChange: (mode: AnalyticsChartMode) => void;
  presDark: boolean;
  presentation: boolean;
  mplPremium?: boolean;
  monthlyLabel?: string;
  cumulativeLabel?: string;
  className?: string;
};

/** Переключатель «Помесячно» / «Нарастающим итогом» (как исполнение плана / динамика поступлений). */
export function AnalyticsChartModeToggle({
  mode,
  onModeChange,
  presDark,
  presentation,
  mplPremium = false,
  monthlyLabel = "Помесячно",
  cumulativeLabel = "Нарастающим итогом",
  className = "",
}: Props) {
  const segmentSurface = resolveAnalyticsSegmentSurface(presDark, presentation, mplPremium);
  const pillsWrapCls = presDark
    ? "flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    : "flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  return (
    <div className={`${pillsWrapCls} ${className}`.trim()} role="tablist" aria-label="Режим графика">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "monthly"}
        onClick={() => onModeChange("monthly")}
        className={segmentedControlTabClass(mode === "monthly", segmentSurface)}
      >
        {monthlyLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "cumulative"}
        onClick={() => onModeChange("cumulative")}
        className={segmentedControlTabClass(mode === "cumulative", segmentSurface)}
      >
        {cumulativeLabel}
      </button>
    </div>
  );
}
