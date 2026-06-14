import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import {
  aggregateSegmentAnalyticsFromDeals,
  DEALS_ANALYTICS_SEGMENT_KEYS,
  type DealsAnalyticsSegmentKey,
} from "@/lib/buildDealsSegmentMonthAnalytics";
import {
  filterDealsForSegmentChartPeriod,
  type FilterDealsForSegmentChartOptions,
  type SegmentChartPeriodMode,
} from "@/lib/filterDealsForSegmentChartPeriod";

export type SegmentFactSeriesByKey = Record<DealsAnalyticsSegmentKey, number>;

/**
 * Факт (₽) по сегментам — только JSON сделок `/api/deals` (sumRub = deal_sum).
 * Не использует CSV segment_execution, units execution, plan_fact.
 */
export function buildSegmentFactSeriesFromDeals(
  dealsRows: readonly NormalizedDealRow[],
  periodMode: SegmentChartPeriodMode,
  filterOptions?: FilterDealsForSegmentChartOptions,
): SegmentFactSeriesByKey {
  const byPeriod =
    periodMode === "all"
      ? dealsRows
      : filterDealsForSegmentChartPeriod(dealsRows, periodMode, filterOptions);
  const aggregated = aggregateSegmentAnalyticsFromDeals(byPeriod);
  return DEALS_ANALYTICS_SEGMENT_KEYS.reduce(
    (acc, key) => {
      acc[key] = aggregated[key].factRevenue;
      return acc;
    },
    {} as SegmentFactSeriesByKey,
  );
}
