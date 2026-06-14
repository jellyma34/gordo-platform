/**
 * Mock-данные раздела «Сделки» (воронка, помесячные факты, конверсия).
 * При появлении API заменить выборкой по фильтрам.
 */

export type SalesFunnelStageId = "leads" | "meetings" | "reservations" | "deals";

export type SalesFunnelStageRow = {
  id: SalesFunnelStageId;
  label: string;
  count: number;
};

export type SalesDealsMonthRow = {
  periodKey: string;
  label: string;
  /** Сделки за месяц (факт) */
  factMonth: number;
  /** Лиды за месяц */
  leadsMonth: number;
  /** Сделки / лиды × 100 */
  conversionPct: number;
};

export type SalesDealsMockDataset = {
  funnel: SalesFunnelStageRow[];
  monthly: SalesDealsMonthRow[];
  /** Средний цикл от лида до сделки, дней; null — нет данных */
  avgDealCycleDays: number | null;
};

export const salesDealsMockData: SalesDealsMockDataset = {
  funnel: [
    { id: "leads", label: "Лиды", count: 1840 },
    { id: "meetings", label: "Встречи", count: 612 },
    { id: "reservations", label: "Брони", count: 198 },
    { id: "deals", label: "Сделки", count: 94 },
  ],
  monthly: [
    { periodKey: "2026-01", label: "янв 26", factMonth: 28, leadsMonth: 520, conversionPct: 5.4 },
    { periodKey: "2026-02", label: "фев 26", factMonth: 31, leadsMonth: 548, conversionPct: 5.7 },
    { periodKey: "2026-03", label: "мар 26", factMonth: 35, leadsMonth: 572, conversionPct: 6.1 },
  ],
  avgDealCycleDays: 38,
};

/** Доли перехода между соседними этапами воронки (в процентах). */
export function funnelStepConversionRates(funnel: SalesFunnelStageRow[]): number[] {
  const rates: number[] = [];
  for (let i = 0; i < funnel.length - 1; i++) {
    const a = funnel[i]!.count;
    const b = funnel[i + 1]!.count;
    rates.push(a > 0 ? (b / a) * 100 : 0);
  }
  return rates;
}
