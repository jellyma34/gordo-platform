import type { SegmentPlanFactBarRow } from "@/components/marketing/SalesPlanSegmentPlanFactBarChart";
import {
  DEAL_SEGMENT_KEYS,
  DEAL_SEGMENT_LABEL_RU,
  groupDealsBySegment,
  type DealSegmentKey,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";

/**
 * Факт — сумма {@link NormalizedDealRow.sumRub} по сегменту (та же группировка, что карточки «Структура продаж»).
 * План — сумма {@link NormalizedDealRow.planRub} из JSON, если по сделкам есть явные поля;
 * иначе доли `fallbackTotalPlanRub` пропорционально факту по всем сегментам (включая «Прочее»).
 */
export function buildSegmentPlanFactBarDataFromDeals(
  filteredRows: NormalizedDealRow[],
  fallbackTotalPlanRub: number | null | undefined,
): SegmentPlanFactBarRow[] {
  const grouped = groupDealsBySegment(filteredRows);

  const facts: Record<DealSegmentKey, number> = {
    apartment: 0,
    parking: 0,
    storage: 0,
    commercial: 0,
    other: 0,
  };
  const explicitPlans: Record<DealSegmentKey, number> = {
    apartment: 0,
    parking: 0,
    storage: 0,
    commercial: 0,
    other: 0,
  };

  for (const key of DEAL_SEGMENT_KEYS) {
    const list = grouped[key];
    facts[key] = list.reduce((s, r) => s + r.sumRub, 0);
    explicitPlans[key] = list.reduce((s, r) => s + (Number.isFinite(r.planRub) ? r.planRub : 0), 0);
  }

  const explicitSum = DEAL_SEGMENT_KEYS.reduce((s, k) => s + explicitPlans[k], 0);

  if (explicitSum > 0) {
    return DEAL_SEGMENT_KEYS.map((key) => ({
      name: DEAL_SEGMENT_LABEL_RU[key],
      fact: facts[key],
      plan: explicitPlans[key],
    }));
  }

  const totalPlan =
    fallbackTotalPlanRub != null && Number.isFinite(fallbackTotalPlanRub) ? Math.max(0, fallbackTotalPlanRub) : 0;
  const sumFacts = DEAL_SEGMENT_KEYS.reduce((s, k) => s + facts[k], 0);

  if (totalPlan > 0 && sumFacts > 0) {
    return DEAL_SEGMENT_KEYS.map((key) => ({
      name: DEAL_SEGMENT_LABEL_RU[key],
      fact: facts[key],
      plan: Math.round(totalPlan * (facts[key] / sumFacts)),
    }));
  }

  return DEAL_SEGMENT_KEYS.map((key) => ({
    name: DEAL_SEGMENT_LABEL_RU[key],
    fact: facts[key],
    plan: 0,
  }));
}
