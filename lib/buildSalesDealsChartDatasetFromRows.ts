import type { SalesDealsMockDataset, SalesFunnelStageRow } from "@/lib/salesDealsMockData";

/**
 * Те же воронка и помесячные агрегаты, что раньше считались в SalesDealsSection из сырого JSON,
 * но из нормализованных строк (единый поток с useMarketingDealsJson).
 */
export function buildSalesDealsChartDatasetFromRows(
  rows: ReadonlyArray<{ monthKey: string }>,
): SalesDealsMockDataset {
  const totalDeals = rows.length;
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    if (!/^\d{4}-\d{2}$/.test(r.monthKey)) continue;
    byMonth.set(r.monthKey, (byMonth.get(r.monthKey) ?? 0) + 1);
  }

  const sortedKeys = [...byMonth.keys()].sort();
  const monthly = sortedKeys.map((periodKey) => {
    const factMonth = byMonth.get(periodKey) ?? 0;
    const [ys, ms] = periodKey.split("-");
    const y = Number(ys);
    const m = Number(ms);
    const label =
      Number.isFinite(y) && Number.isFinite(m)
        ? new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "short", year: "2-digit" })
        : periodKey;
    return {
      periodKey,
      label,
      factMonth,
      leadsMonth: 0,
      conversionPct: 0,
    };
  });

  const funnel: SalesFunnelStageRow[] = [
    { id: "leads", label: "Лиды", count: 0 },
    { id: "meetings", label: "Встречи", count: 0 },
    { id: "reservations", label: "Брони", count: 0 },
    { id: "deals", label: "Сделки", count: totalDeals },
  ];

  return {
    funnel,
    monthly,
    avgDealCycleDays: null,
  };
}
