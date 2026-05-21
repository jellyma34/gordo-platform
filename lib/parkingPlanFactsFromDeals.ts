import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import { isApartmentKpiDealSoldStatus } from "@/lib/apartmentPlanFactsFromDeals";
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
import { quarterKeyToMonthKeys } from "@/lib/planDataSource/selectPlanForKpi";

export type ParkingPlanKpiDealFacts = {
  factMonth: number;
  factCumulative: number;
};

function canonicalMonthKey(row: NormalizedDealRow): string | null {
  const mk = normalizeMonthKey(row.monthKey) ?? normalizeMonthKey(row.dealDate);
  if (mk && /^\d{4}-\d{2}$/.test(mk)) return mk;
  const head = String(row.dealDate ?? "").trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(head) ? head : null;
}

function resolveKpiMonthWindow(
  period: "month" | "quarter",
  currentPeriodKey: string,
): { endMonthKey: string; monthKeysInPeriod: Set<string> } {
  if (period === "quarter") {
    const months = quarterKeyToMonthKeys(currentPeriodKey);
    if (months?.length) {
      return {
        endMonthKey: months[months.length - 1]!,
        monthKeysInPeriod: new Set(months),
      };
    }
  }
  const mk = normalizeMonthKey(currentPeriodKey) ?? currentPeriodKey;
  return { endMonthKey: mk, monthKeysInPeriod: new Set([mk]) };
}

/** Факт KPI машино-мест из JSON: накопительно — все parking-сделки с monthKey ≤ конец периода. */
export function parkingPlanFactsFromDealsForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): ParkingPlanKpiDealFacts {
  const { endMonthKey, monthKeysInPeriod } = resolveKpiMonthWindow(opts.period, opts.currentPeriodKey);

  let factMonth = 0;
  let factCumulative = 0;

  for (const r of rows) {
    if (r.dealType !== "parking") continue;
    if (!isApartmentKpiDealSoldStatus(r.statusLabel, r.dealKindLabel)) continue;
    const mk = canonicalMonthKey(r);
    if (!mk) continue;
    if (mk <= endMonthKey) factCumulative += 1;
    if (monthKeysInPeriod.has(mk)) factMonth += 1;
  }

  return { factMonth, factCumulative };
}
