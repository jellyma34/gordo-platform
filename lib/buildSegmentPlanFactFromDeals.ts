import type { SegmentPlanFactBarRow } from "@/components/marketing/SalesPlanSegmentPlanFactBarChart";
import {
  DEAL_SEGMENT_KEYS,
  DEAL_SEGMENT_LABEL_RU,
  groupDealsBySegment,
  type DealSegmentKey,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";

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
 * Факт — сумма {@link NormalizedDealRow.sumRub} по сегменту (та же группировка, что карточки «Структура продаж»).
 * План — сумма {@link NormalizedDealRow.planRub} из JSON, если по сделкам есть явные поля;
 * иначе доли `fallbackTotalPlanRub` пропорционально факту по всем сегментам (включая «Прочее»).
 *
 * При `showZeroSalesSegments` не используем fallback для плана: факт только из JSON (нули — валидные данные).
 */
export function buildSegmentPlanFactBarDataFromDeals(
  filteredRows: NormalizedDealRow[],
  fallbackTotalPlanRub: number | null | undefined,
  options?: BuildSegmentPlanFactFromDealsOptions,
): SegmentPlanFactBarRow[] {
  const showZero = options?.showZeroSalesSegments === true;
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
    facts[key] = list.reduce((s, r) => s + (Number.isFinite(r.sumRub) ? r.sumRub : 0), 0);
    explicitPlans[key] = list.reduce((s, r) => {
      const p = r.planRub;
      return s + (typeof p === "number" && Number.isFinite(p) ? p : 0);
    }, 0);
  }

  const explicitSum = DEAL_SEGMENT_KEYS.reduce((s, k) => s + explicitPlans[k], 0);

  const keep = (row: SegmentPlanFactBarRow) => showZero || segmentRowHasData(row);

  if (explicitSum > 0) {
    return DEAL_SEGMENT_KEYS.map((key) => ({
      name: DEAL_SEGMENT_LABEL_RU[key],
      fact: Number.isFinite(facts[key]) ? facts[key] : 0,
      plan: Number.isFinite(explicitPlans[key]) ? explicitPlans[key] : 0,
    })).filter(keep);
  }

  const totalPlan =
    !showZero && fallbackTotalPlanRub != null && Number.isFinite(fallbackTotalPlanRub)
      ? Math.max(0, fallbackTotalPlanRub)
      : 0;
  const sumFacts = DEAL_SEGMENT_KEYS.reduce((s, k) => s + (Number.isFinite(facts[k]) ? facts[k] : 0), 0);

  if (showZero && sumFacts === 0) {
    return DEAL_SEGMENT_KEYS.map((key) => ({
      name: DEAL_SEGMENT_LABEL_RU[key],
      fact: 0,
      plan: 0,
    }));
  }

  if (totalPlan > 0 && sumFacts > 0) {
    return DEAL_SEGMENT_KEYS.map((key) => {
      const f = Number.isFinite(facts[key]) ? facts[key] : 0;
      const ratio = f / sumFacts;
      const plan = Number.isFinite(ratio) ? Math.round(totalPlan * ratio) : 0;
      return {
        name: DEAL_SEGMENT_LABEL_RU[key],
        fact: f,
        plan,
      };
    }).filter(keep);
  }

  return DEAL_SEGMENT_KEYS.map((key) => ({
    name: DEAL_SEGMENT_LABEL_RU[key],
    fact: Number.isFinite(facts[key]) ? facts[key] : 0,
    plan: 0,
  })).filter(keep);
}
