"use client";

import { useMemo } from "react";

import { EntityPerformanceAnalyticsSection } from "@/components/marketing/EntityPerformanceAnalyticsSection";
import {
  buildParkingPerformanceChartRows,
  type ParkingPlanAnalyticsBreakdown,
} from "@/lib/parkingPlanAnalytics";

type Props = {
  breakdown: ParkingPlanAnalyticsBreakdown | null | undefined;
  presDark: boolean;
  presentation: boolean;
};

export function ParkingPerformanceAnalyticsSection({ breakdown, presDark, presentation }: Props) {
  const chartRows = useMemo(() => buildParkingPerformanceChartRows(breakdown), [breakdown]);

  return (
    <EntityPerformanceAnalyticsSection
      title="Аналитика выполнения плана по машино-местам"
      rows={chartRows}
      hasCsvPlan={breakdown?.hasCsvPlan ?? false}
      presDark={presDark}
      presentation={presentation}
      emptyMessage="Нет данных по машино-местам"
    />
  );
}
