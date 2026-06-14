import { formatMonthKeyShortRuYY } from "@/lib/normalizeMonthKey";
import { sqmPriceDynamicsMonthTooltipLabel } from "@/lib/sqmPriceDynamicsFromDeals";

export { formatMonthKeyShortRuYY, sqmPriceDynamicsMonthTooltipLabel };

/** Короткая подпись месяца на оси X графиков аналитики («окт 25»). */
export function analyticsChartMonthLabelShort(periodKey: string): string {
  return formatMonthKeyShortRuYY(periodKey);
}

/** Подпись месяца в тултипе («октябрь 2025 г.»). */
export function analyticsChartMonthTooltipLabel(periodKey: string): string {
  return sqmPriceDynamicsMonthTooltipLabel(periodKey);
}
