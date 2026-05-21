import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
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
import { normalizeProjectValueRow } from "@/lib/planDataSource/projectValue/rowHelpers";
import type { ProjectValueNormalizedRow } from "@/lib/planDataSource/projectValue/types";
import { quarterKeyToMonthKeys } from "@/lib/planDataSource/selectPlanForKpi";

export type ProjectValueEntityAnalyticsItem = {
  key: string;
  label: string;
  shortLabel: string;
  planCumulative: number;
  factCumulative: number;
};

export type ProjectValueEntityAnalyticsBreakdown = {
  hasCsvPlan: boolean;
  items: ProjectValueEntityAnalyticsItem[];
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

function dealContractRub(row: NormalizedDealRow): number {
  const v = row.sumRub;
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

function pickValueRow(
  rows: readonly ProjectValueNormalizedRow[],
  match: (segmentNorm: string) => boolean,
): ProjectValueNormalizedRow | null {
  const matched = rows.filter((r) => match(r.segmentNorm));
  if (!matched.length) return null;
  return matched.reduce((best, r) => {
    const score = r.planCumulative * 1_000 + r.factCumulative;
    const bestScore = best.planCumulative * 1_000 + best.factCumulative;
    return score > bestScore ? r : best;
  });
}

function resolveParkingCategories(
  rows: readonly ProjectValueNormalizedRow[],
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
  rows: readonly ProjectValueNormalizedRow[],
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
    .filter((r) => r.dealType === "parking" && isApartmentKpiDealSoldStatus(r.statusLabel, r.dealKindLabel))
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
    const val = dealContractRub(r);
    if (out[cat] != null) out[cat] += val;
    else if (out.total != null) out.total += val;
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
    .filter((r) => r.dealType === "storage" && isApartmentKpiDealSoldStatus(r.statusLabel, r.dealKindLabel))
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
    const val = dealContractRub(r);
    if (out[cat] != null) out[cat] += val;
    else if (out.total != null) out.total += val;
  }
  return out;
}

export function buildProjectValueParkingAnalytics(args: {
  rows: readonly ProjectValueNormalizedRow[] | null | undefined;
  hasCsvPlan: boolean;
  period: "month" | "quarter";
  currentPeriodKey: string;
  dealRows: readonly NormalizedDealRow[];
}): ProjectValueEntityAnalyticsBreakdown {
  const parkingRows = (args.rows ?? []).filter((r) => isParkingPropertyRow(r.segmentNorm, r.segmentNorm));
  const categories = resolveParkingCategories(parkingRows);
  const factsByCat = parkingFactsByCategory(args.dealRows, args.period, args.currentPeriodKey, categories);

  const items: ProjectValueEntityAnalyticsItem[] = categories.map((meta) => {
    let planCumulative = 0;
    let factCumulative = factsByCat[meta.key] ?? 0;
    if (args.hasCsvPlan && parkingRows.length > 0) {
      if (meta.key === "total") {
        const row = pickValueRow(parkingRows, (s) => isBiParkingSummaryRow(s, s));
        if (row) {
          const r = normalizeProjectValueRow(row);
          planCumulative = r.csvFormat === "project_value" ? r.charter : r.planCumulative;
          factCumulative = r.csvFormat === "project_value" ? r.currentPlan : factsByCat[meta.key] ?? 0;
        }
      } else {
        const row = pickValueRow(parkingRows, (s) => matchParkingCategoryKey(s, s) === meta.key);
        if (row) {
          const r = normalizeProjectValueRow(row);
          planCumulative = r.csvFormat === "project_value" ? r.charter : r.planCumulative;
          factCumulative = r.csvFormat === "project_value" ? r.currentPlan : factsByCat[meta.key] ?? 0;
        }
      }
    }
    return {
      key: meta.key,
      label: meta.label,
      shortLabel: meta.shortLabel,
      planCumulative,
      factCumulative,
    };
  });

  return { hasCsvPlan: args.hasCsvPlan, items };
}

export function buildProjectValueStorageAnalytics(args: {
  rows: readonly ProjectValueNormalizedRow[] | null | undefined;
  hasCsvPlan: boolean;
  period: "month" | "quarter";
  currentPeriodKey: string;
  dealRows: readonly NormalizedDealRow[];
}): ProjectValueEntityAnalyticsBreakdown {
  const storageRows = (args.rows ?? []).filter((r) => isStoragePropertyRow(r.segmentNorm, r.segmentNorm));
  const categories = resolveStorageCategories(storageRows);
  const factsByCat = storageFactsByCategory(args.dealRows, args.period, args.currentPeriodKey, categories);

  const items: ProjectValueEntityAnalyticsItem[] = categories.map((meta) => {
    let planCumulative = 0;
    let factCumulative = factsByCat[meta.key] ?? 0;
    if (args.hasCsvPlan && storageRows.length > 0) {
      if (meta.key === "total") {
        const row = pickValueRow(storageRows, (s) => isBiStorageSummaryRow(s, s));
        if (row) {
          const r = normalizeProjectValueRow(row);
          planCumulative = r.csvFormat === "project_value" ? r.charter : r.planCumulative;
          factCumulative = r.csvFormat === "project_value" ? r.currentPlan : factsByCat[meta.key] ?? 0;
        }
      } else {
        const row = pickValueRow(storageRows, (s) => matchStorageCategoryKey(s, s) === meta.key);
        if (row) {
          const r = normalizeProjectValueRow(row);
          planCumulative = r.csvFormat === "project_value" ? r.charter : r.planCumulative;
          factCumulative = r.csvFormat === "project_value" ? r.currentPlan : factsByCat[meta.key] ?? 0;
        }
      }
    }
    return {
      key: meta.key,
      label: meta.label,
      shortLabel: meta.shortLabel,
      planCumulative,
      factCumulative,
    };
  });

  return { hasCsvPlan: args.hasCsvPlan, items };
}

export function buildProjectValueEntityChartRows(
  breakdown: ProjectValueEntityAnalyticsBreakdown | null | undefined,
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

export function projectValueEntityAnalyticsHasData(
  breakdown: ProjectValueEntityAnalyticsBreakdown | null | undefined,
): boolean {
  if (!breakdown?.items.length) return false;
  return breakdown.items.some((i) => i.planCumulative > 0 || i.factCumulative > 0);
}
