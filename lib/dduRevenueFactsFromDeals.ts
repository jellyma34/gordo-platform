import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import { matchesNormalizedDealSegment } from "@/lib/normalizeDealSegment";
import {
  apartmentPlanKpiDedupKey,
  canonicalMonthKey,
  isApartmentKpiDealSoldStatus,
} from "@/lib/apartmentPlanFactsFromDeals";
import {
  inferApartmentPlanTypeKeyFromDeal,
  type ApartmentPlanTypeKey,
} from "@/lib/apartmentPlanTypeKpi";
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
import { quarterKeyToMonthKeys } from "@/lib/planDataSource/selectPlanForKpi";

export type DduRevenueDealFacts = {
  factMonth: number;
  factCumulative: number;
};

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
  return {
    endMonthKey: mk,
    monthKeysInPeriod: new Set([mk]),
  };
}

function dealRevenueRub(row: NormalizedDealRow): number {
  const v = row.factRevenueRub;
  if (v == null || !Number.isFinite(v) || v <= 0) return 0;
  return v;
}

export function dduRevenueFactsFromDealsForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): DduRevenueDealFacts {
  const { endMonthKey, monthKeysInPeriod } = resolveKpiMonthWindow(opts.period, opts.currentPeriodKey);

  const apartmentRows = rows.filter((r) => r.dealType === "apartment");
  const candidates = apartmentRows.filter((r) => {
    if (!isApartmentKpiDealSoldStatus(r.statusLabel, r.dealKindLabel)) return false;
    return canonicalMonthKey(r) != null;
  });

  const sorted = [...candidates].sort((a, b) => {
    const d = a.dealDateMs - b.dealDateMs;
    return d !== 0 ? d : apartmentPlanKpiDedupKey(a).localeCompare(apartmentPlanKpiDedupKey(b));
  });

  const firstByKey = new Map<string, { monthKey: string; revenue: number }>();

  for (const r of sorted) {
    const mk = canonicalMonthKey(r)!;
    const k = apartmentPlanKpiDedupKey(r);
    if (firstByKey.has(k)) continue;
    firstByKey.set(k, { monthKey: mk, revenue: dealRevenueRub(r) });
  }

  let factMonth = 0;
  let factCumulative = 0;
  for (const u of firstByKey.values()) {
    if (u.monthKey <= endMonthKey) factCumulative += u.revenue;
    if (monthKeysInPeriod.has(u.monthKey)) factMonth += u.revenue;
  }

  return { factMonth, factCumulative };
}

export function dduRevenueFactsFromDealsByTypeForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): Record<ApartmentPlanTypeKey, DduRevenueDealFacts> {
  const empty = (): Record<ApartmentPlanTypeKey, DduRevenueDealFacts> => ({
    "apt-1": { factMonth: 0, factCumulative: 0 },
    "apt-2": { factMonth: 0, factCumulative: 0 },
    "apt-3": { factMonth: 0, factCumulative: 0 },
    "apt-4": { factMonth: 0, factCumulative: 0 },
  });

  const { endMonthKey, monthKeysInPeriod } = resolveKpiMonthWindow(opts.period, opts.currentPeriodKey);
  const result = empty();

  const apartmentRows = rows.filter((r) => r.dealType === "apartment");
  const candidates = apartmentRows.filter((r) => {
    if (!isApartmentKpiDealSoldStatus(r.statusLabel, r.dealKindLabel)) return false;
    return canonicalMonthKey(r) != null;
  });

  const sorted = [...candidates].sort((a, b) => {
    const d = a.dealDateMs - b.dealDateMs;
    return d !== 0 ? d : apartmentPlanKpiDedupKey(a).localeCompare(apartmentPlanKpiDedupKey(b));
  });

  const firstByKey = new Map<string, { monthKey: string; revenue: number; typeKey: ApartmentPlanTypeKey }>();

  for (const r of sorted) {
    const typeKey = inferApartmentPlanTypeKeyFromDeal(r);
    if (!typeKey) continue;
    const mk = canonicalMonthKey(r)!;
    const k = apartmentPlanKpiDedupKey(r);
    if (firstByKey.has(k)) continue;
    firstByKey.set(k, { monthKey: mk, revenue: dealRevenueRub(r), typeKey });
  }

  for (const u of firstByKey.values()) {
    if (u.monthKey <= endMonthKey) result[u.typeKey].factCumulative += u.revenue;
    if (monthKeysInPeriod.has(u.monthKey)) result[u.typeKey].factMonth += u.revenue;
  }

  return result;
}

function dduRevenueFactsForDealType(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
  dealType: "parking" | "storage",
): DduRevenueDealFacts {
  const { endMonthKey, monthKeysInPeriod } = resolveKpiMonthWindow(opts.period, opts.currentPeriodKey);

  const typedRows = rows.filter((r) => matchesNormalizedDealSegment(r, dealType));
  const candidates = typedRows.filter((r) => {
    if (!isApartmentKpiDealSoldStatus(r.statusLabel, r.dealKindLabel)) return false;
    return canonicalMonthKey(r) != null;
  });

  const sorted = [...candidates].sort((a, b) => {
    const d = a.dealDateMs - b.dealDateMs;
    return d !== 0 ? d : apartmentPlanKpiDedupKey(a).localeCompare(apartmentPlanKpiDedupKey(b));
  });

  const firstByKey = new Map<string, { monthKey: string; revenue: number }>();

  for (const r of sorted) {
    const mk = canonicalMonthKey(r)!;
    const k = apartmentPlanKpiDedupKey(r);
    if (firstByKey.has(k)) continue;
    firstByKey.set(k, { monthKey: mk, revenue: dealRevenueRub(r) });
  }

  let factMonth = 0;
  let factCumulative = 0;
  for (const u of firstByKey.values()) {
    if (u.monthKey <= endMonthKey) factCumulative += u.revenue;
    if (monthKeysInPeriod.has(u.monthKey)) factMonth += u.revenue;
  }

  return { factMonth, factCumulative };
}

export function dduRevenueParkingFactsFromDealsForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): DduRevenueDealFacts {
  return dduRevenueFactsForDealType(rows, opts, "parking");
}

export function dduRevenueStorageFactsFromDealsForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): DduRevenueDealFacts {
  return dduRevenueFactsForDealType(rows, opts, "storage");
}
