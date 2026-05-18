import type { SegmentPlanFactBarRow } from "@/components/marketing/SalesPlanSegmentPlanFactBarChart";
import { DEAL_SEGMENT_LABEL_RU, type NormalizedDealRow } from "@/components/marketing/DealsSection";
import {
  aggregateSegmentAnalyticsFromDeals,
  DEALS_ANALYTICS_SEGMENT_KEYS,
  type DealsAnalyticsSegmentKey,
} from "@/lib/buildDealsSegmentMonthAnalytics";

function segmentRowHasData(row: SegmentPlanFactBarRow): boolean {
  return row.fact !== 0 || row.plan !== 0;
}

export type BuildSegmentPlanFactFromDealsOptions = {
  /**
   * Период выбран, но факт продаж по JSON = 0 (пустой отбор по месяцу / «застой» cumulative deals):
   * показываем все сегменты с нулевым фактом, без скрытия строк и без распределения плана из fallback-мока.
   */
  showZeroSalesSegments?: boolean;
};

/**
 * Факт — {@link aggregateSegmentAnalyticsFromDeals} (sumRub по сегменту, тот же источник, что блок «Сделки»).
 * План — сумма {@link NormalizedDealRow.planRub} по сделкам сегмента в JSON;
 * иначе доли `fallbackTotalPlanRub` пропорционально факту по 4 сегментам.
 *
 * Не использует investors CSV, plan_fact macro charts, units execution, completionChartRows.
 */
export function buildSegmentPlanFactBarDataFromDeals(
  filteredRows: NormalizedDealRow[],
  fallbackTotalPlanRub: number | null | undefined,
  options?: BuildSegmentPlanFactFromDealsOptions,
): SegmentPlanFactBarRow[] {
  const showZero = options?.showZeroSalesSegments === true;
  const segmentFacts = aggregateSegmentAnalyticsFromDeals(filteredRows);

  const explicitPlans: Record<DealsAnalyticsSegmentKey, number> = {
    apartment: 0,
    parking: 0,
    storage: 0,
    commercial: 0,
  };

  for (const r of filteredRows) {
    const seg = r.dealType;
    if (seg === "other") continue;
    const p = r.planRub;
    explicitPlans[seg] += typeof p === "number" && Number.isFinite(p) ? p : 0;
  }

  const explicitSum = DEALS_ANALYTICS_SEGMENT_KEYS.reduce((s, k) => s + explicitPlans[k], 0);
  const keep = (row: SegmentPlanFactBarRow) => showZero || segmentRowHasData(row);

  if (explicitSum > 0) {
    return DEALS_ANALYTICS_SEGMENT_KEYS.map((key) => ({
      name: DEAL_SEGMENT_LABEL_RU[key],
      fact: segmentFacts[key].factRevenue,
      plan: explicitPlans[key],
    })).filter(keep);
  }

  const totalPlan =
    !showZero && fallbackTotalPlanRub != null && Number.isFinite(fallbackTotalPlanRub)
      ? Math.max(0, fallbackTotalPlanRub)
      : 0;
  const sumFacts = DEALS_ANALYTICS_SEGMENT_KEYS.reduce((s, k) => s + segmentFacts[k].factRevenue, 0);

  if (showZero && sumFacts === 0) {
    return DEALS_ANALYTICS_SEGMENT_KEYS.map((key) => ({
      name: DEAL_SEGMENT_LABEL_RU[key],
      fact: 0,
      plan: 0,
    }));
  }

  if (totalPlan > 0 && sumFacts > 0) {
    return DEALS_ANALYTICS_SEGMENT_KEYS.map((key) => {
      const f = segmentFacts[key].factRevenue;
      const ratio = f / sumFacts;
      const plan = Number.isFinite(ratio) ? Math.round(totalPlan * ratio) : 0;
      return {
        name: DEAL_SEGMENT_LABEL_RU[key],
        fact: f,
        plan,
      };
    }).filter(keep);
  }

  return DEALS_ANALYTICS_SEGMENT_KEYS.map((key) => ({
    name: DEAL_SEGMENT_LABEL_RU[key],
    fact: segmentFacts[key].factRevenue,
    plan: 0,
  })).filter(keep);
}
