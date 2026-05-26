import type { SegmentPlanFactBarRow } from "@/components/marketing/SalesPlanSegmentPlanFactBarChart";
import {
  segmentExecutionPlanFactBarRowsForChartPeriod,
  type SegmentExecutionChartsPayload,
} from "@/lib/marketingSegmentExecutionCsv";

/** Строки bar chart «Выполнение плана продаж по сегментам» из CSV segment_execution (все периоды). */
export function segmentExecutionChartsToBarRows(
  payload: SegmentExecutionChartsPayload | null | undefined,
): SegmentPlanFactBarRow[] | null {
  return segmentExecutionPlanFactBarRowsForChartPeriod(payload, { periodMode: "all" });
}
