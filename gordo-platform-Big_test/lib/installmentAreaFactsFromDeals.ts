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

export type InstallmentAreaDealFacts = {
  factMonthArea: number;
  factCumulativeArea: number;
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

function dealAreaM2(row: NormalizedDealRow): number {
  const a = row.objectParams.areaTotal;
  if (a == null || !Number.isFinite(a) || a <= 0) return 0;
  return a;
}

/**
 * Факт площади квартир из JSON сделок (без CSV плана).
 * Дедупликация по лоту; накопительно — сумма площадей с monthKey ≤ конец периода.
 */
export function installmentAreaFactsFromDealsForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): InstallmentAreaDealFacts {
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

  const firstByKey = new Map<string, { monthKey: string; area: number }>();

  for (const r of sorted) {
    const mk = canonicalMonthKey(r)!;
    const k = apartmentPlanKpiDedupKey(r);
    if (firstByKey.has(k)) continue;
    firstByKey.set(k, { monthKey: mk, area: dealAreaM2(r) });
  }

  let factMonthArea = 0;
  let factCumulativeArea = 0;
  for (const u of firstByKey.values()) {
    if (u.monthKey <= endMonthKey) factCumulativeArea += u.area;
    if (monthKeysInPeriod.has(u.monthKey)) factMonthArea += u.area;
  }

  return { factMonthArea, factCumulativeArea };
}

/** Факт площади по комнатности из JSON сделок. */
export function installmentAreaFactsFromDealsByTypeForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): Record<ApartmentPlanTypeKey, InstallmentAreaDealFacts> {
  const empty = (): Record<ApartmentPlanTypeKey, InstallmentAreaDealFacts> => ({
    "apt-1": { factMonthArea: 0, factCumulativeArea: 0 },
    "apt-2": { factMonthArea: 0, factCumulativeArea: 0 },
    "apt-3": { factMonthArea: 0, factCumulativeArea: 0 },
    "apt-4": { factMonthArea: 0, factCumulativeArea: 0 },
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

  const firstByKey = new Map<string, { monthKey: string; area: number; typeKey: ApartmentPlanTypeKey }>();

  for (const r of sorted) {
    const typeKey = inferApartmentPlanTypeKeyFromDeal(r);
    if (!typeKey) continue;
    const mk = canonicalMonthKey(r)!;
    const k = apartmentPlanKpiDedupKey(r);
    if (firstByKey.has(k)) continue;
    firstByKey.set(k, { monthKey: mk, area: dealAreaM2(r), typeKey });
  }

  for (const u of firstByKey.values()) {
    if (u.monthKey <= endMonthKey) result[u.typeKey].factCumulativeArea += u.area;
    if (monthKeysInPeriod.has(u.monthKey)) result[u.typeKey].factMonthArea += u.area;
  }

  return result;
}

function installmentAreaFactsForDealType(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
  dealType: "parking" | "storage",
): InstallmentAreaDealFacts {
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

  const firstByKey = new Map<string, { monthKey: string; area: number }>();

  for (const r of sorted) {
    const mk = canonicalMonthKey(r)!;
    const k = apartmentPlanKpiDedupKey(r);
    if (firstByKey.has(k)) continue;
    firstByKey.set(k, { monthKey: mk, area: dealAreaM2(r) });
  }

  let factMonthArea = 0;
  let factCumulativeArea = 0;
  for (const u of firstByKey.values()) {
    if (u.monthKey <= endMonthKey) factCumulativeArea += u.area;
    if (monthKeysInPeriod.has(u.monthKey)) factMonthArea += u.area;
  }

  return { factMonthArea, factCumulativeArea };
}

export function installmentAreaParkingFactsFromDealsForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): InstallmentAreaDealFacts {
  return installmentAreaFactsForDealType(rows, opts, "parking");
}

export function installmentAreaStorageFactsFromDealsForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): InstallmentAreaDealFacts {
  return installmentAreaFactsForDealType(rows, opts, "storage");
}
