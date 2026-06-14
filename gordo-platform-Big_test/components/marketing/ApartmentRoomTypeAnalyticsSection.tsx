"use client";

import { useMemo } from "react";

import { EntityPerformanceAnalyticsSection } from "@/components/marketing/EntityPerformanceAnalyticsSection";
import { buildRoomTypeChartRows } from "@/lib/apartmentRoomTypeAnalytics";
import type { ApartmentPlanTypeKpiBreakdown } from "@/lib/apartmentPlanTypeKpi";

type Props = {
  breakdown: ApartmentPlanTypeKpiBreakdown;
  presDark: boolean;
  presentation: boolean;
};

export function ApartmentRoomTypeAnalyticsSection({ breakdown, presDark, presentation }: Props) {
  const chartRows = useMemo(() => buildRoomTypeChartRows(breakdown), [breakdown]);

  if (!chartRows.length) return null;

  return (
    <EntityPerformanceAnalyticsSection
      title="Аналитика выполнения плана по комнатности"
      rows={chartRows}
      hasCsvPlan={breakdown.hasCsvPlan}
      presDark={presDark}
      presentation={presentation}
    />
  );
}
