"use client";

import { useMemo } from "react";

import { EntityPerformanceAnalyticsSection } from "@/components/marketing/EntityPerformanceAnalyticsSection";
import {
  buildStoragePerformanceChartRows,
  type StoragePlanAnalyticsBreakdown,
} from "@/lib/storagePlanAnalytics";

type Props = {
  breakdown: StoragePlanAnalyticsBreakdown | null | undefined;
  presDark: boolean;
  presentation: boolean;
};

export function StoragePerformanceAnalyticsSection({ breakdown, presDark, presentation }: Props) {
  const chartRows = useMemo(() => buildStoragePerformanceChartRows(breakdown), [breakdown]);

  return (
    <EntityPerformanceAnalyticsSection
      title="Аналитика выполнения плана по кладовым"
      rows={chartRows}
      hasCsvPlan={breakdown?.hasCsvPlan ?? false}
      presDark={presDark}
      presentation={presentation}
      emptyMessage="Нет данных по кладовым"
    />
  );
}
