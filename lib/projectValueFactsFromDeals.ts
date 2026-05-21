import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
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

export type ProjectValueDealFacts = {
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

function dealContractRub(row: NormalizedDealRow): number {
  const v = row.sumRub;
  if (v == null || !Number.isFinite(v) || v <= 0) return 0;
  return v;
}

export function projectValueFactsFromDealsForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): ProjectValueDealFacts {
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

  const firstByKey = new Map<string, { monthKey: string; value: number }>();

  for (const r of sorted) {
    const mk = canonicalMonthKey(r)!;
    const k = apartmentPlanKpiDedupKey(r);
    if (firstByKey.has(k)) continue;
    firstByKey.set(k, { monthKey: mk, value: dealContractRub(r) });
  }

  let factMonth = 0;
  let factCumulative = 0;
  for (const u of firstByKey.values()) {
    if (u.monthKey <= endMonthKey) factCumulative += u.value;
    if (monthKeysInPeriod.has(u.monthKey)) factMonth += u.value;
  }

  return { factMonth, factCumulative };
}

export function projectValueFactsFromDealsByTypeForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): Record<ApartmentPlanTypeKey, ProjectValueDealFacts> {
  const empty = (): Record<ApartmentPlanTypeKey, ProjectValueDealFacts> => ({
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

  const firstByKey = new Map<string, { monthKey: string; value: number; typeKey: ApartmentPlanTypeKey }>();

  for (const r of sorted) {
    const typeKey = inferApartmentPlanTypeKeyFromDeal(r);
    if (!typeKey) continue;
    const mk = canonicalMonthKey(r)!;
    const k = apartmentPlanKpiDedupKey(r);
    if (firstByKey.has(k)) continue;
    firstByKey.set(k, { monthKey: mk, value: dealContractRub(r), typeKey });
  }

  for (const u of firstByKey.values()) {
    if (u.monthKey <= endMonthKey) result[u.typeKey].factCumulative += u.value;
    if (monthKeysInPeriod.has(u.monthKey)) result[u.typeKey].factMonth += u.value;
  }

  return result;
}

function projectValueFactsForDealType(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
  dealType: "parking" | "storage",
): ProjectValueDealFacts {
  const { endMonthKey, monthKeysInPeriod } = resolveKpiMonthWindow(opts.period, opts.currentPeriodKey);

  const typedRows = rows.filter((r) => r.dealType === dealType);
  const candidates = typedRows.filter((r) => {
    if (!isApartmentKpiDealSoldStatus(r.statusLabel, r.dealKindLabel)) return false;
    return canonicalMonthKey(r) != null;
  });

  const sorted = [...candidates].sort((a, b) => {
    const d = a.dealDateMs - b.dealDateMs;
    return d !== 0 ? d : apartmentPlanKpiDedupKey(a).localeCompare(apartmentPlanKpiDedupKey(b));
  });

  const firstByKey = new Map<string, { monthKey: string; value: number }>();

  for (const r of sorted) {
    const mk = canonicalMonthKey(r)!;
    const k = apartmentPlanKpiDedupKey(r);
    if (firstByKey.has(k)) continue;
    firstByKey.set(k, { monthKey: mk, value: dealContractRub(r) });
  }

  let factMonth = 0;
  let factCumulative = 0;
  for (const u of firstByKey.values()) {
    if (u.monthKey <= endMonthKey) factCumulative += u.value;
    if (monthKeysInPeriod.has(u.monthKey)) factMonth += u.value;
  }

  return { factMonth, factCumulative };
}

export function projectValueParkingFactsFromDealsForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): ProjectValueDealFacts {
  return projectValueFactsForDealType(rows, opts, "parking");
}

export function projectValueStorageFactsFromDealsForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): ProjectValueDealFacts {
  return projectValueFactsForDealType(rows, opts, "storage");
}
