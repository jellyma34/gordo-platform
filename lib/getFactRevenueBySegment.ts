import {
  groupDealsBySegment,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";
import {
  DEALS_ANALYTICS_SEGMENT_KEYS,
  type DealsAnalyticsSegmentKey,
} from "@/lib/buildDealsSegmentMonthAnalytics";

export type FactRevenueBySegment = Record<DealsAnalyticsSegmentKey, number>;

/**
 * Сумма фактических поступлений по 4 сегментам недвижимости из нормализованных сделок JSON.
 * Использует {@link NormalizedDealRow.factRevenueRub} (не sumRub / plan / цену объекта).
 */
export function getFactRevenueBySegment(rows: readonly NormalizedDealRow[]): FactRevenueBySegment {
  const grouped = groupDealsBySegment(rows);
  return DEALS_ANALYTICS_SEGMENT_KEYS.reduce(
    (acc, key) => {
      const list = grouped[key];
      acc[key] = list.reduce(
        (s, r) => s + (Number.isFinite(r.factRevenueRub) ? r.factRevenueRub : 0),
        0,
      );
      return acc;
    },
    {
      apartment: 0,
      parking: 0,
      storage: 0,
      commercial: 0,
    } as FactRevenueBySegment,
  );
}
