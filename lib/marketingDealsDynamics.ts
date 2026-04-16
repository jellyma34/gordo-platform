import type { SalesFactRow, SalesRevenueRow } from "@/lib/marketingMockData";

export type DealsDynamicsChartRow = {
  periodKey: string;
  label: string;
  deals: number;
  revenue: number;
  /** null если deals = 0 */
  avgCheck: number | null;
  deltaDeals: number | null;
  deltaRevenue: number | null;
  deltaAvgCheck: number | null;
  /** ΔRevenue ≈ volPart + mixPart; volPart = ΔDeals × AvgCheck_prev */
  volPart: number | null;
  /** mixPart = Deals_prev × ΔAvgCheck */
  mixPart: number | null;
};

export function dealsDeltaTone(d: number | null): "up" | "down" | "flat" {
  if (d == null || d === 0) return "flat";
  return d > 0 ? "up" : "down";
}

export function buildDealsDynamicsSeries(
  factRows: Pick<SalesFactRow, "periodKey" | "label" | "deals">[],
  revenueRows: Pick<SalesRevenueRow, "periodKey" | "revenueRub">[],
): DealsDynamicsChartRow[] {
  const revByKey = new Map(revenueRows.map((r) => [r.periodKey, r.revenueRub]));
  const base = factRows
    .map((f) => {
      const revenue = revByKey.get(f.periodKey) ?? 0;
      const deals = f.deals;
      const avgCheck = deals > 0 ? revenue / deals : null;
      return { periodKey: f.periodKey, label: f.label, deals, revenue, avgCheck };
    })
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));

  return base.map((row, i) => {
    const prev = i > 0 ? base[i - 1]! : null;
    const prevAvgCheck = prev && prev.deals > 0 ? prev.revenue / prev.deals : null;
    const deltaDeals = prev ? row.deals - prev.deals : null;
    const deltaRevenue = prev ? row.revenue - prev.revenue : null;
    const deltaAvgCheck =
      prevAvgCheck != null && row.deals > 0 ? row.revenue / row.deals - prevAvgCheck : null;

    let volPart: number | null = null;
    let mixPart: number | null = null;
    if (prev != null && deltaDeals != null && deltaAvgCheck != null && prevAvgCheck != null) {
      volPart = deltaDeals * prevAvgCheck;
      mixPart = prev.deals * deltaAvgCheck;
    }

    return {
      periodKey: row.periodKey,
      label: row.label,
      deals: row.deals,
      revenue: row.revenue,
      avgCheck: row.avgCheck,
      deltaDeals,
      deltaRevenue,
      deltaAvgCheck,
      volPart,
      mixPart,
    };
  });
}

export function deltaToneClasses(
  t: "up" | "down" | "flat",
  presentation: boolean,
): { text: string; fill: string } {
  if (t === "up")
    return {
      text: presentation ? "text-emerald-300" : "text-emerald-700",
      fill: presentation ? "#6ee7b7" : "#059669",
    };
  if (t === "down")
    return {
      text: presentation ? "text-rose-300" : "text-rose-700",
      fill: presentation ? "#fda4af" : "#e11d48",
    };
  return {
    text: presentation ? "text-slate-400" : "text-slate-500",
    fill: presentation ? "#64748b" : "#94a3b8",
  };
}
