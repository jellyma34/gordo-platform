import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import { matchesNormalizedDealSegment } from "@/lib/normalizeDealSegment";
import {
  apartmentPlanKpiDedupKey,
  canonicalMonthKey,
  isApartmentKpiDealSoldStatus,
} from "@/lib/apartmentPlanFactsFromDeals";
import { buildPerformanceChartRows, type PerformanceChartRow } from "@/lib/entityPerformanceChart";
import {
  inferParkingCategoryFromDeal,
  isBiParkingSummaryRow,
  isParkingDetailSegment,
  isParkingPropertyRow,
  matchParkingCategoryKey,
  PARKING_PLAN_CATEGORY_ORDER,
  type ParkingPlanCategoryKey,
  type ParkingPlanCategoryMeta,
} from "@/lib/parkingPlanAnalytics";
import {
  inferStorageCategoryFromDeal,
  isBiStorageSummaryRow,
  isStorageDetailSegment,
  isStoragePropertyRow,
  matchStorageCategoryKey,
  STORAGE_PLAN_CATEGORY_ORDER,
  type StoragePlanCategoryKey,
  type StoragePlanCategoryMeta,
} from "@/lib/storagePlanAnalytics";
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
import type { DduRevenueNormalizedRow } from "@/lib/planDataSource/dduRevenue/types";
import { quarterKeyToMonthKeys } from "@/lib/planDataSource/selectPlanForKpi";

export type DduRevenueEntityAnalyticsItem = {
  key: string;
  label: string;
  shortLabel: string;
  planCumulative: number;
  factCumulative: number;
};

export type DduRevenueEntityAnalyticsBreakdown = {
  hasCsvPlan: boolean;
  items: DduRevenueEntityAnalyticsItem[];
};

const TOTAL_PARKING_META: ParkingPlanCategoryMeta = {
  key: "total",
  label: "Машино-места",
  shortLabel: "ММ",
};

const TOTAL_STORAGE_META: StoragePlanCategoryMeta = {
  key: "total",
  label: "Кладовые",
  shortLabel: "Клд.",
};

function dealRevenueRub(row: NormalizedDealRow): number {
  const v = row.factRevenueRub;
  if (v == null || !Number.isFinite(v) || v <= 0) return 0;
  return v;
}

function resolveKpiMonthWindow(
  period: "month" | "quarter",
  currentPeriodKey: string,
): { endMonthKey: string } {
  if (period === "quarter") {
    const months = quarterKeyToMonthKeys(currentPeriodKey);
    if (months?.length) return { endMonthKey: months[months.length - 1]! };
  }
  const mk = normalizeMonthKey(currentPeriodKey) ?? currentPeriodKey;
  return { endMonthKey: mk };
}

function pickRevenueRow(
  rows: readonly DduRevenueNormalizedRow[],
  match: (segmentNorm: string) => boolean,
): DduRevenueNormalizedRow | null {
  const matched = rows.filter((r) => match(r.segmentNorm));
  if (!matched.length) return null;
  return matched.reduce((best, r) => {
    const score = r.planCumulative * 1_000 + r.factCumulative;
    const bestScore = best.planCumulative * 1_000 + best.factCumulative;
    return score > bestScore ? r : best;
  });
}

function resolveParkingCategories(
  rows: readonly DduRevenueNormalizedRow[],
): readonly ParkingPlanCategoryMeta[] {
  const detailKeys = new Set<ParkingPlanCategoryKey>();
  for (const r of rows) {
    if (!isParkingDetailSegment(r.segmentNorm, r.segmentNorm)) continue;
    const k = matchParkingCategoryKey(r.segmentNorm, r.segmentNorm);
    if (k) detailKeys.add(k);
  }
  if (detailKeys.size > 0) {
    return PARKING_PLAN_CATEGORY_ORDER.filter((m) => detailKeys.has(m.key));
  }
  if (rows.some((r) => isBiParkingSummaryRow(r.segmentNorm, r.segmentNorm))) {
    return [TOTAL_PARKING_META];
  }
  return [];
}

function resolveStorageCategories(
  rows: readonly DduRevenueNormalizedRow[],
): readonly StoragePlanCategoryMeta[] {
  const detailKeys = new Set<StoragePlanCategoryKey>();
  for (const r of rows) {
    if (!isStorageDetailSegment(r.segmentNorm, r.segmentNorm)) continue;
    const k = matchStorageCategoryKey(r.segmentNorm, r.segmentNorm);
    if (k) detailKeys.add(k);
  }
  if (detailKeys.size > 0) {
    return STORAGE_PLAN_CATEGORY_ORDER.filter((m) => detailKeys.has(m.key));
  }
  if (rows.some((r) => isBiStorageSummaryRow(r.segmentNorm, r.segmentNorm))) {
    return [TOTAL_STORAGE_META];
  }
  return [];
}

function parkingFactsByCategory(
  dealRows: readonly NormalizedDealRow[],
  period: "month" | "quarter",
  currentPeriodKey: string,
  categories: readonly ParkingPlanCategoryMeta[],
): Record<ParkingPlanCategoryKey, number> {
  const out = Object.fromEntries(categories.map((c) => [c.key, 0])) as Record<ParkingPlanCategoryKey, number>;
  const { endMonthKey } = resolveKpiMonthWindow(period, currentPeriodKey);

  const sorted = [...dealRows]
    .filter((r) => matchesNormalizedDealSegment(r, "parking") && isApartmentKpiDealSoldStatus(r.statusLabel, r.dealKindLabel))
    .filter((r) => canonicalMonthKey(r) != null)
    .sort((a, b) => {
      const d = a.dealDateMs - b.dealDateMs;
      return d !== 0 ? d : apartmentPlanKpiDedupKey(a).localeCompare(apartmentPlanKpiDedupKey(b));
    });

  const seen = new Set<string>();
  for (const r of sorted) {
    const mk = canonicalMonthKey(r)!;
    if (mk > endMonthKey) continue;
    const cat = inferParkingCategoryFromDeal(r) ?? "total";
    const k = apartmentPlanKpiDedupKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    const rev = dealRevenueRub(r);
    if (out[cat] != null) out[cat] += rev;
    else if (out.total != null) out.total += rev;
  }
  return out;
}

function storageFactsByCategory(
  dealRows: readonly NormalizedDealRow[],
  period: "month" | "quarter",
  currentPeriodKey: string,
  categories: readonly StoragePlanCategoryMeta[],
): Record<StoragePlanCategoryKey, number> {
  const out = Object.fromEntries(categories.map((c) => [c.key, 0])) as Record<StoragePlanCategoryKey, number>;
  const { endMonthKey } = resolveKpiMonthWindow(period, currentPeriodKey);

  const sorted = [...dealRows]
    .filter((r) => matchesNormalizedDealSegment(r, "storage") && isApartmentKpiDealSoldStatus(r.statusLabel, r.dealKindLabel))
    .filter((r) => canonicalMonthKey(r) != null)
    .sort((a, b) => {
      const d = a.dealDateMs - b.dealDateMs;
      return d !== 0 ? d : apartmentPlanKpiDedupKey(a).localeCompare(apartmentPlanKpiDedupKey(b));
    });

  const seen = new Set<string>();
  for (const r of sorted) {
    const mk = canonicalMonthKey(r)!;
    if (mk > endMonthKey) continue;
    const cat = inferStorageCategoryFromDeal(r) ?? "total";
    const k = apartmentPlanKpiDedupKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    const rev = dealRevenueRub(r);
    if (out[cat] != null) out[cat] += rev;
    else if (out.total != null) out.total += rev;
  }
  return out;
}

export function buildDduRevenueParkingAnalytics(args: {
  rows: readonly DduRevenueNormalizedRow[] | null | undefined;
  hasCsvPlan: boolean;
  period: "month" | "quarter";
  currentPeriodKey: string;
  dealRows: readonly NormalizedDealRow[];
}): DduRevenueEntityAnalyticsBreakdown {
  const parkingRows = (args.rows ?? []).filter((r) => isParkingPropertyRow(r.segmentNorm, r.segmentNorm));
  const categories = resolveParkingCategories(parkingRows);
  const factsByCat = parkingFactsByCategory(args.dealRows, args.period, args.currentPeriodKey, categories);

  const items: DduRevenueEntityAnalyticsItem[] = categories.map((meta) => {
    let planCumulative = 0;
    if (args.hasCsvPlan && parkingRows.length > 0) {
      if (meta.key === "total") {
        const row = pickRevenueRow(parkingRows, (s) => isBiParkingSummaryRow(s, s));
        planCumulative = row?.planCumulative ?? 0;
      } else {
        const row = pickRevenueRow(parkingRows, (s) => matchParkingCategoryKey(s, s) === meta.key);
        planCumulative = row?.planCumulative ?? 0;
      }
    }
    return {
      key: meta.key,
      label: meta.label,
      shortLabel: meta.shortLabel,
      planCumulative,
      factCumulative: factsByCat[meta.key] ?? 0,
    };
  });

  return { hasCsvPlan: args.hasCsvPlan, items };
}

export function buildDduRevenueStorageAnalytics(args: {
  rows: readonly DduRevenueNormalizedRow[] | null | undefined;
  hasCsvPlan: boolean;
  period: "month" | "quarter";
  currentPeriodKey: string;
  dealRows: readonly NormalizedDealRow[];
}): DduRevenueEntityAnalyticsBreakdown {
  const storageRows = (args.rows ?? []).filter((r) => isStoragePropertyRow(r.segmentNorm, r.segmentNorm));
  const categories = resolveStorageCategories(storageRows);
  const factsByCat = storageFactsByCategory(args.dealRows, args.period, args.currentPeriodKey, categories);

  const items: DduRevenueEntityAnalyticsItem[] = categories.map((meta) => {
    let planCumulative = 0;
    if (args.hasCsvPlan && storageRows.length > 0) {
      if (meta.key === "total") {
        const row = pickRevenueRow(storageRows, (s) => isBiStorageSummaryRow(s, s));
        planCumulative = row?.planCumulative ?? 0;
      } else {
        const row = pickRevenueRow(storageRows, (s) => matchStorageCategoryKey(s, s) === meta.key);
        planCumulative = row?.planCumulative ?? 0;
      }
    }
    return {
      key: meta.key,
      label: meta.label,
      shortLabel: meta.shortLabel,
      planCumulative,
      factCumulative: factsByCat[meta.key] ?? 0,
    };
  });

  return { hasCsvPlan: args.hasCsvPlan, items };
}

export function buildDduRevenueEntityChartRows(
  breakdown: DduRevenueEntityAnalyticsBreakdown | null | undefined,
): PerformanceChartRow[] {
  if (!breakdown?.items?.length) return [];
  return buildPerformanceChartRows(
    breakdown.items.map((i) => ({
      key: i.key,
      label: i.label,
      shortLabel: i.shortLabel,
      planCumulative: i.planCumulative,
      factCumulative: i.factCumulative,
    })),
  );
}

export function dduRevenueEntityAnalyticsHasData(
  breakdown: DduRevenueEntityAnalyticsBreakdown | null | undefined,
): boolean {
  if (!breakdown?.items.length) return false;
  return breakdown.items.some((i) => i.planCumulative > 0 || i.factCumulative > 0);
}
