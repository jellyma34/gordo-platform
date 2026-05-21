"use client";

import { EntityPerformanceChart } from "@/components/marketing/EntityPerformanceChart";
import type { PerformanceChartRow } from "@/lib/entityPerformanceChart";

/** @deprecated Используйте {@link EntityPerformanceChart}. */
type Props = {
  rows: readonly PerformanceChartRow[];
  hasCsvPlan: boolean;
  presDark: boolean;
  presentation: boolean;
};

export function RoomTypePerformanceChart(props: Props) {
  return <EntityPerformanceChart {...props} />;
}
