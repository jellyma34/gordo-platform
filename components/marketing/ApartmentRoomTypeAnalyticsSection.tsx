"use client";

import { useMemo } from "react";

import { RoomTypePerformanceChart } from "@/components/marketing/RoomTypePerformanceChart";
import { buildRoomTypeChartRows } from "@/lib/apartmentRoomTypeAnalytics";
import type { ApartmentPlanTypeKpiBreakdown } from "@/lib/apartmentPlanTypeKpi";

type Props = {
  breakdown: ApartmentPlanTypeKpiBreakdown;
  presDark: boolean;
  presentation: boolean;
};

export function ApartmentRoomTypeAnalyticsSection({ breakdown, presDark, presentation }: Props) {
  const chartRows = useMemo(() => buildRoomTypeChartRows(breakdown), [breakdown]);

  const shellCls = presDark
    ? "rounded-[20px] border border-white/10 bg-slate-900/40 shadow-[0_6px_24px_rgba(0,0,0,0.2)]"
    : presentation
      ? "rounded-[20px] border border-black/[0.04] bg-white/90 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
      : "rounded-[20px] border border-slate-200/60 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.04)]";

  const titleCls = presDark ? "text-slate-100" : presentation ? "text-mpl-text" : "text-slate-900";

  if (!chartRows.length) return null;

  return (
    <div
      className="mt-6 min-w-0 border-t pt-5 md:mt-7 md:pt-6"
      style={{ borderColor: presDark ? "rgba(255,255,255,0.1)" : "rgba(226,232,240,0.55)" }}
    >
      <h3 className={`mb-3 text-base font-bold tracking-tight sm:text-lg ${titleCls}`}>
        Аналитика выполнения плана по комнатности
      </h3>

      <div className={`min-w-0 px-4 pb-3 pt-3 sm:px-5 sm:pb-3.5 sm:pt-3 ${shellCls}`}>
        <RoomTypePerformanceChart
          rows={chartRows}
          hasCsvPlan={breakdown.hasCsvPlan}
          presDark={presDark}
          presentation={presentation}
        />
      </div>
    </div>
  );
}
