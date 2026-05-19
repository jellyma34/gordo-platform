import type { SegmentPlanFactBarRow } from "@/components/marketing/SalesPlanSegmentPlanFactBarChart";
import type { SegmentExecutionChartsPayload } from "@/lib/marketingSegmentExecutionCsv";

/** Строки bar chart «Выполнение плана продаж по сегментам» из CSV segment_execution. */
export function segmentExecutionChartsToBarRows(
  payload: SegmentExecutionChartsPayload | null | undefined,
): SegmentPlanFactBarRow[] | null {
  const rows = payload?.planFactRows;
  if (!rows?.length) return null;
  return rows.map((r) => ({
    name: r.segment,
    fact: r.fact,
    plan: r.plan,
  }));
}
