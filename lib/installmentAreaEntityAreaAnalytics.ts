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
import type { InstallmentAreaCsvNormalizedRow } from "@/lib/planDataSource/installmentArea/types";
import { quarterKeyToMonthKeys } from "@/lib/planDataSource/selectPlanForKpi";

export type InstallmentAreaEntityAnalyticsItem = {
  key: string;
  label: string;
  shortLabel: string;
  planCumulative: number;
  factCumulative: number;
};

export type InstallmentAreaEntityAnalyticsBreakdown = {
  hasCsvPlan: boolean;
  items: InstallmentAreaEntityAnalyticsItem[];
};

const TOTAL_PARKING_AREA_META: ParkingPlanCategoryMeta = {
  key: "total",
  label: "Машино-места",
  shortLabel: "ММ",
};

const TOTAL_STORAGE_AREA_META: StoragePlanCategoryMeta = {
  key: "total",
  label: "Кладовые",
  shortLabel: "Клд.",
};

function dealAreaM2(row: NormalizedDealRow): number {
  const a = row.objectParams.areaTotal;
  if (a == null || !Number.isFinite(a) || a <= 0) return 0;
  return a;
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

function pickAreaRow(
  rows: readonly InstallmentAreaCsvNormalizedRow[],
  match: (segmentNorm: string) => boolean,
): InstallmentAreaCsvNormalizedRow | null {
  const matched = rows.filter((r) => match(r.segmentNorm));
  if (!matched.length) return null;
  return matched.reduce((best, r) => {
    const score = r.planCumulativeArea * 1_000 + r.factCumulativeArea;
    const bestScore = best.planCumulativeArea * 1_000 + best.factCumulativeArea;
    return score > bestScore ? r : best;
  });
}

function resolveParkingAreaCategories(
  rows: readonly InstallmentAreaCsvNormalizedRow[],
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
    return [TOTAL_PARKING_AREA_META];
  }
  return [];
}

function resolveStorageAreaCategories(
  rows: readonly InstallmentAreaCsvNormalizedRow[],
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
    return [TOTAL_STORAGE_AREA_META];
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
    const area = dealAreaM2(r);
    if (out[cat] != null) out[cat] += area;
    else if (out.total != null) out.total += area;
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
    const area = dealAreaM2(r);
    if (out[cat] != null) out[cat] += area;
    else if (out.total != null) out.total += area;
  }
  return out;
}

export function buildInstallmentAreaParkingAreaAnalytics(args: {
  rows: readonly InstallmentAreaCsvNormalizedRow[] | null | undefined;
  hasCsvPlan: boolean;
  period: "month" | "quarter";
  currentPeriodKey: string;
  dealRows: readonly NormalizedDealRow[];
}): InstallmentAreaEntityAnalyticsBreakdown {
  const parkingRows = (args.rows ?? []).filter((r) => isParkingPropertyRow(r.segmentNorm, r.segmentNorm));
  const categories = resolveParkingAreaCategories(parkingRows);
  const factsByCat = parkingFactsByCategory(args.dealRows, args.period, args.currentPeriodKey, categories);

  const items: InstallmentAreaEntityAnalyticsItem[] = categories.map((meta) => {
    let planCumulative = 0;
    if (args.hasCsvPlan && parkingRows.length > 0) {
      if (meta.key === "total") {
        const row = pickAreaRow(parkingRows, (s) => isBiParkingSummaryRow(s, s));
        planCumulative = row?.planCumulativeArea ?? 0;
      } else {
        const row = pickAreaRow(
          parkingRows,
          (s) => matchParkingCategoryKey(s, s) === meta.key,
        );
        planCumulative = row?.planCumulativeArea ?? 0;
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

export function buildInstallmentAreaStorageAreaAnalytics(args: {
  rows: readonly InstallmentAreaCsvNormalizedRow[] | null | undefined;
  hasCsvPlan: boolean;
  period: "month" | "quarter";
  currentPeriodKey: string;
  dealRows: readonly NormalizedDealRow[];
}): InstallmentAreaEntityAnalyticsBreakdown {
  const storageRows = (args.rows ?? []).filter((r) => isStoragePropertyRow(r.segmentNorm, r.segmentNorm));
  const categories = resolveStorageAreaCategories(storageRows);
  const factsByCat = storageFactsByCategory(args.dealRows, args.period, args.currentPeriodKey, categories);

  const items: InstallmentAreaEntityAnalyticsItem[] = categories.map((meta) => {
    let planCumulative = 0;
    if (args.hasCsvPlan && storageRows.length > 0) {
      if (meta.key === "total") {
        const row = pickAreaRow(storageRows, (s) => isBiStorageSummaryRow(s, s));
        planCumulative = row?.planCumulativeArea ?? 0;
      } else {
        const row = pickAreaRow(
          storageRows,
          (s) => matchStorageCategoryKey(s, s) === meta.key,
        );
        planCumulative = row?.planCumulativeArea ?? 0;
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

export function buildInstallmentAreaEntityAreaChartRows(
  breakdown: InstallmentAreaEntityAnalyticsBreakdown | null | undefined,
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

export function installmentAreaEntityAnalyticsHasData(
  breakdown: InstallmentAreaEntityAnalyticsBreakdown | null | undefined,
): boolean {
  if (!breakdown?.items.length) return false;
  return breakdown.items.some((i) => i.planCumulative > 0 || i.factCumulative > 0);
}
