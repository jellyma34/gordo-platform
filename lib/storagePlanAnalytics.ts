import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import { matchesNormalizedDealSegment } from "@/lib/normalizeDealSegment";
import { buildPerformanceChartRows, type PerformanceChartRow } from "@/lib/entityPerformanceChart";
import {
  isBiApartmentsSummaryRow,
  isBiGrandTotalRow,
} from "@/lib/planDataSource/apartmentPlanKpiEntity";
import { isRuColumnarPlanCsvType } from "@/lib/planDataSource/apartmentPlanCsvPipeline";
import { getPlanCalculationStrategy } from "@/lib/planDataSource/apartmentPlanKpiStrategy";
import {
  entityKpiCumulativePlanFromSummary,
  mergeEntitySummaryWithCsvRow,
} from "@/lib/planDataSource/entitySummaryPlanSlice";
import { isStorageRootSummaryRow } from "@/lib/planDataSource/entityRowMatchers";
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
import { normalizeMatchKey } from "@/lib/planDataSource/normalize";
import { quarterKeyToMonthKeys } from "@/lib/planDataSource/selectPlanForKpi";
import type { ApartmentPlanCsvNormalizedRow } from "@/lib/planDataSource/types";
import type { ApartmentPlanCsvParseDiagnostics } from "@/lib/planDataSource/types";
import type { ApartmentPlanKpiPlanSlice } from "@/lib/planDataSource/types";

function canonicalMonthKey(row: NormalizedDealRow): string | null {
  const mk = normalizeMonthKey(row.monthKey) ?? normalizeMonthKey(row.dealDate);
  if (mk && /^\d{4}-\d{2}$/.test(mk)) return mk;
  const head = String(row.dealDate ?? "").trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(head) ? head : null;
}

export type StoragePlanCategoryKey = "small" | "medium" | "large" | "premium" | "basement" | "total";

export type StoragePlanCategoryMeta = {
  key: StoragePlanCategoryKey;
  label: string;
  shortLabel: string;
};

export const STORAGE_PLAN_CATEGORY_ORDER: readonly StoragePlanCategoryMeta[] = [
  { key: "small", label: "Маленькие", shortLabel: "Мал." },
  { key: "medium", label: "Средние", shortLabel: "Сред." },
  { key: "large", label: "Большие", shortLabel: "Бол." },
  { key: "premium", label: "Premium", shortLabel: "Prem." },
  { key: "basement", label: "Подвал", shortLabel: "Подв." },
] as const;

const TOTAL_STORAGE_META: StoragePlanCategoryMeta = {
  key: "total",
  label: "Кладовые",
  shortLabel: "Клд.",
};

function segmentBlob(segmentNorm: string, rawLabel: string): string {
  return `${segmentNorm} ${rawLabel}`.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

function isParkingBlob(blob: string): boolean {
  return (
    blob.includes("парков") ||
    blob.includes("машиномест") ||
    blob.includes("машино-мест") ||
    blob.includes("parking") ||
    blob.includes("паркинг") ||
    blob.includes("гараж")
  );
}

function isCommercialBlob(blob: string): boolean {
  return (
    blob.includes("коммерц") ||
    blob.includes("нежил") ||
    blob.includes("офис") ||
    blob.includes("ритейл") ||
    blob.includes("commercial")
  );
}

function isApartmentBlob(blob: string): boolean {
  return (
    /[1-4]\s*[-–]?\s*ком/.test(blob) ||
    (blob.includes("квартир") && !blob.includes("парков")) ||
    blob.includes("студи")
  );
}

/** Строка CSV: только кладовые (не квартиры, parking, коммерция). */
export function isStoragePropertyRow(segmentNorm: string, rawLabel = segmentNorm): boolean {
  if (isBiGrandTotalRow(segmentNorm, rawLabel) || isBiApartmentsSummaryRow(segmentNorm, rawLabel)) {
    return false;
  }
  const blob = segmentBlob(segmentNorm, rawLabel);
  if (isParkingBlob(blob)) return false;
  if (isCommercialBlob(blob)) return false;
  if (isApartmentBlob(blob)) return false;
  return (
    blob.includes("кладов") ||
    blob.includes("кладовк") ||
    blob.includes("storage") ||
    blob.includes("storages")
  );
}

/** Свод «Кладовые» в BI-отчёте. */
export function isBiStorageSummaryRow(segmentNorm: string, rawLabel = segmentNorm): boolean {
  if (!isStoragePropertyRow(segmentNorm, rawLabel)) return false;
  return isStorageRootSummaryRow(segmentNorm, rawLabel);
}

export function isStorageDetailSegment(segmentNorm: string, rawLabel = segmentNorm): boolean {
  if (!isStoragePropertyRow(segmentNorm, rawLabel)) return false;
  if (isBiStorageSummaryRow(segmentNorm, rawLabel)) return false;
  return matchStorageCategoryKey(segmentNorm, rawLabel) != null;
}

export function matchStorageCategoryKey(
  segmentNorm: string,
  rawLabel = segmentNorm,
): StoragePlanCategoryKey | null {
  const blob = segmentBlob(segmentNorm, rawLabel);
  if (!isStoragePropertyRow(segmentNorm, rawLabel)) return null;
  if (/маленьк|small/.test(blob)) return "small";
  if (/средн|medium/.test(blob)) return "medium";
  if (/больш|large/.test(blob)) return "large";
  if (/premium|премиум/.test(blob)) return "premium";
  if (/подвал|basement|цоколь/.test(blob)) return "basement";
  return null;
}

export function inferStorageCategoryFromDeal(row: NormalizedDealRow): StoragePlanCategoryKey | null {
  if (!matchesNormalizedDealSegment(row, "storage")) return null;
  const hints = [row.objectParams.type, row.objectLabel, row.objectUnitLabel, row.typeLabel]
    .filter((s) => s != null && String(s).trim() !== "")
    .join(" ");
  const fromHints = matchStorageCategoryKey(normalizeMatchKey(hints), hints);
  if (fromHints) return fromHints;
  return "total";
}

function segmentMatchesObject(
  row: ApartmentPlanCsvNormalizedRow,
  objectId: string,
  objects: readonly { id: string; name: string }[],
): boolean {
  if (!objectId || objectId === "all") return true;
  const obj = objects.find((o) => o.id === objectId);
  const candidates: string[] = [];
  const idNorm = normalizeMatchKey(objectId);
  if (idNorm) candidates.push(idNorm);
  if (obj) {
    const nn = normalizeMatchKey(obj.name);
    const iid = normalizeMatchKey(obj.id);
    if (nn) candidates.push(nn);
    if (iid) candidates.push(iid);
  }
  for (const c of candidates) {
    if (row.segmentNorm === c) return true;
    if (c.length >= 3 && (row.segmentNorm.includes(c) || c.includes(row.segmentNorm))) return true;
  }
  return false;
}

function filterCategoryRows(
  rows: readonly ApartmentPlanCsvNormalizedRow[],
  categoryKey: StoragePlanCategoryKey,
  objectId: string,
  objects: readonly { id: string; name: string }[],
): ApartmentPlanCsvNormalizedRow[] {
  return rows.filter((r) => {
    const raw = r.segmentNorm;
    if (!segmentMatchesObject(r, objectId, objects)) return false;
    if (!isStoragePropertyRow(r.segmentNorm, raw)) return false;
    if (categoryKey === "total") {
      return isBiStorageSummaryRow(r.segmentNorm, raw);
    }
    return matchStorageCategoryKey(r.segmentNorm, raw) === categoryKey;
  });
}

function sumPlanMonthRows(rows: readonly ApartmentPlanCsvNormalizedRow[]): number {
  return rows.reduce((s, r) => {
    const v = r.planMonth;
    return s + (Number.isFinite(v) && v > 0 ? v : 0);
  }, 0);
}

function maxPlanCumulative(rows: readonly ApartmentPlanCsvNormalizedRow[]): number {
  return rows.reduce((m, r) => Math.max(m, Number.isFinite(r.planCumulative) ? r.planCumulative : 0), 0);
}

function selectPlanSliceForStorageCategory(
  rows: readonly ApartmentPlanCsvNormalizedRow[],
  categoryKey: StoragePlanCategoryKey,
  opts: {
    period: "month" | "quarter";
    currentPeriodKey: string;
    objectId: string;
    objects: readonly { id: string; name: string }[];
    csvType?: ApartmentPlanCsvParseDiagnostics["csvType"];
    storageSummary?: { planCumulative: number; planMonth: number } | null;
  },
): ApartmentPlanKpiPlanSlice | null {
  const typeRows = filterCategoryRows(rows, categoryKey, opts.objectId, opts.objects);

  if (!typeRows.length && !opts.storageSummary) return null;

  const { cumulativeMode } = getPlanCalculationStrategy(opts.csvType);
  const isColumnarCsv = isRuColumnarPlanCsvType(opts.csvType);
  const qMonths = quarterKeyToMonthKeys(opts.currentPeriodKey);
  const endMonthKey =
    opts.period === "quarter" && qMonths?.length ? qMonths[qMonths.length - 1]! : opts.currentPeriodKey;

  let planMonth = 0;
  let planCumulative = 0;

  if (categoryKey === "total" && opts.storageSummary && opts.storageSummary.planCumulative > 0) {
    planMonth = opts.storageSummary.planMonth;
    planCumulative = opts.storageSummary.planCumulative;
  } else if (typeRows.length) {
    if (opts.period === "month") {
      const monthRows = isColumnarCsv
        ? typeRows
        : typeRows.filter((r) => r.monthKey === opts.currentPeriodKey);
      planMonth = sumPlanMonthRows(monthRows);
      if (cumulativeMode === "bi_report_ready_column") {
        planCumulative = maxPlanCumulative(monthRows.length ? monthRows : typeRows);
      } else {
        const through = isColumnarCsv
          ? typeRows
          : typeRows.filter((r) => r.monthKey <= opts.currentPeriodKey);
        planCumulative = sumPlanMonthRows(through);
      }
    } else {
      const inQuarter = isColumnarCsv
        ? typeRows
        : qMonths != null
          ? typeRows.filter((r) => qMonths.includes(r.monthKey))
          : typeRows.filter((r) => r.monthKey === opts.currentPeriodKey);
      planMonth = sumPlanMonthRows(inQuarter);
      if (cumulativeMode === "bi_report_ready_column") {
        planCumulative = maxPlanCumulative(inQuarter.length ? inQuarter : typeRows);
      } else {
        const through = isColumnarCsv
          ? typeRows
          : typeRows.filter((r) => r.monthKey <= endMonthKey);
        planCumulative = sumPlanMonthRows(through);
      }
    }
  }

  if (planMonth <= 0 && planCumulative <= 0) return null;
  return { planMonth, planCumulative, totalVolume: 0, cumulativeMode };
}

function filterStorageKpiRows(
  rows: readonly ApartmentPlanCsvNormalizedRow[],
  objectId: string,
  objects: readonly { id: string; name: string }[],
): ApartmentPlanCsvNormalizedRow[] {
  return rows.filter((r) => {
    const raw = r.segmentNorm;
    if (!segmentMatchesObject(r, objectId, objects)) return false;
    return isStoragePropertyRow(r.segmentNorm, raw);
  });
}

function sumStoragePlanMonthRows(rows: readonly ApartmentPlanCsvNormalizedRow[]): number {
  return rows.reduce((s, r) => {
    const v = r.planMonth;
    return s + (Number.isFinite(v) && v > 0 ? v : 0);
  }, 0);
}

function resolveStorageProjectPlanVolume(
  summary: ReturnType<typeof mergeEntitySummaryWithCsvRow>,
): number {
  if (summary && summary.planProject > 0) return summary.planProject;
  return 0;
}

/** Свод KPI кладовых (план месяца / накопительно / объём проекта). */
export function selectPlanSliceForStorageKpi(
  rows: readonly ApartmentPlanCsvNormalizedRow[],
  opts: {
    period: "month" | "quarter";
    currentPeriodKey: string;
    objectId: string;
    objects: readonly { id: string; name: string }[];
    csvType?: ApartmentPlanCsvParseDiagnostics["csvType"];
  },
): ApartmentPlanKpiPlanSlice | null {
  if (!rows.length) return null;

  const filteredByObj = rows.filter((r) => segmentMatchesObject(r, opts.objectId, opts.objects));
  const storageRows = filterStorageKpiRows(rows, opts.objectId, opts.objects);

  const qMonths = quarterKeyToMonthKeys(opts.currentPeriodKey);
  const endMonthKey =
    opts.period === "quarter" && qMonths?.length ? qMonths[qMonths.length - 1]! : opts.currentPeriodKey;
  const summaryMonthKey = opts.period === "month" ? opts.currentPeriodKey : endMonthKey;

  const isColumnarCsv = isRuColumnarPlanCsvType(opts.csvType);

  const summary = mergeEntitySummaryWithCsvRow(
    rows,
    null,
    isBiStorageSummaryRow,
    isColumnarCsv ? undefined : summaryMonthKey,
  );

  if (!storageRows.length && !summary) return null;

  const { cumulativeMode } = getPlanCalculationStrategy(opts.csvType);

  if (opts.period === "month") {
    const monthRows = isColumnarCsv
      ? storageRows
      : storageRows.filter((r) => r.monthKey === opts.currentPeriodKey);
    const planMonth =
      summary && summary.planMonth > 0 ? summary.planMonth : sumStoragePlanMonthRows(monthRows);
    const throughMonth = isColumnarCsv
      ? storageRows
      : storageRows.filter((r) => r.monthKey <= opts.currentPeriodKey);
    const planCumulative = entityKpiCumulativePlanFromSummary(summary, cumulativeMode, throughMonth);
    const totalVolume = resolveStorageProjectPlanVolume(summary);
    return { planMonth, planCumulative, totalVolume, cumulativeMode };
  }

  const inQuarter = isColumnarCsv
    ? storageRows
    : qMonths != null
      ? storageRows.filter((r) => qMonths.includes(r.monthKey))
      : storageRows.filter((r) => r.monthKey === opts.currentPeriodKey);

  const planMonth = summary && summary.planMonth > 0 ? summary.planMonth : sumStoragePlanMonthRows(inQuarter);
  const throughMonth = isColumnarCsv
    ? storageRows
    : storageRows.filter((r) => r.monthKey <= endMonthKey);
  const planCumulative = entityKpiCumulativePlanFromSummary(summary, cumulativeMode, throughMonth);
  const totalVolume = resolveStorageProjectPlanVolume(summary);

  return { planMonth, planCumulative, totalVolume, cumulativeMode };
}

function resolveStorageChartCategories(
  rows: readonly ApartmentPlanCsvNormalizedRow[] | null | undefined,
  dealRows: readonly NormalizedDealRow[],
): readonly StoragePlanCategoryMeta[] {
  const detailKeys = new Set<StoragePlanCategoryKey>();
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (!isStorageDetailSegment(r.segmentNorm, r.segmentNorm)) continue;
      const k = matchStorageCategoryKey(r.segmentNorm, r.segmentNorm);
      if (k) detailKeys.add(k);
    }
  }
  if (detailKeys.size > 0) {
    return STORAGE_PLAN_CATEGORY_ORDER.filter((m) => detailKeys.has(m.key));
  }

  const hasStorageCsv = Array.isArray(rows) && rows.some((r) => isStoragePropertyRow(r.segmentNorm, r.segmentNorm));
  if (hasStorageCsv) return [TOTAL_STORAGE_META];

  const dealCats = new Set<StoragePlanCategoryKey>();
  for (const r of dealRows) {
    if (!matchesNormalizedDealSegment(r, "storage")) continue;
    const k = inferStorageCategoryFromDeal(r);
    if (k && k !== "total") dealCats.add(k);
  }
  if (dealCats.size > 0) {
    return STORAGE_PLAN_CATEGORY_ORDER.filter((m) => dealCats.has(m.key));
  }

  const hasStorageDeals = dealRows.some((r) => matchesNormalizedDealSegment(r, "storage"));
  if (hasStorageDeals) return [TOTAL_STORAGE_META];

  return [];
}

export function storagePlanFactsFromDealsByCategory(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
  categories: readonly StoragePlanCategoryMeta[],
): Record<StoragePlanCategoryKey, { factMonth: number; factCumulative: number }> {
  const result = Object.fromEntries(
    categories.map((c) => [c.key, { factMonth: 0, factCumulative: 0 }]),
  ) as Record<StoragePlanCategoryKey, { factMonth: number; factCumulative: number }>;
  const useTotalOnly = categories.length === 1 && categories[0]!.key === "total";

  const qMonths = quarterKeyToMonthKeys(opts.currentPeriodKey);
  const endMonthKey =
    opts.period === "quarter" && qMonths?.length ? qMonths[qMonths.length - 1]! : opts.currentPeriodKey;
  const monthKeysInPeriod =
    opts.period === "quarter" && qMonths?.length ? new Set(qMonths) : new Set([opts.currentPeriodKey]);

  for (const r of rows) {
    if (!matchesNormalizedDealSegment(r, "storage")) continue;
    const cat = useTotalOnly ? "total" : inferStorageCategoryFromDeal(r);
    if (!cat || !(cat in result)) continue;
    const mk = canonicalMonthKey(r);
    if (!mk) continue;
    if (mk <= endMonthKey) result[cat].factCumulative += 1;
    if (monthKeysInPeriod.has(mk)) result[cat].factMonth += 1;
  }

  return result;
}

export type StoragePlanAnalyticsItem = StoragePlanCategoryMeta & {
  planMonth: number;
  planCumulative: number;
  factMonth: number;
  factCumulative: number;
};

/** Свод кладовых = сумма по категориям (детальным строкам CSV / JSON). */
export function buildStorageTotals(breakdown: StoragePlanAnalyticsBreakdown): {
  planMonth: number;
  planCumulative: number;
  factMonth: number;
  factCumulative: number;
} {
  let planMonth = 0;
  let planCumulative = 0;
  let factMonth = 0;
  let factCumulative = 0;
  for (const item of breakdown.items) {
    planMonth += item.planMonth;
    planCumulative += item.planCumulative;
    factMonth += item.factMonth;
    factCumulative += item.factCumulative;
  }
  return { planMonth, planCumulative, factMonth, factCumulative };
}

export type StoragePlanAnalyticsBreakdown = {
  hasCsvPlan: boolean;
  items: StoragePlanAnalyticsItem[];
};

export function buildStoragePlanAnalyticsBreakdown(args: {
  rows: readonly ApartmentPlanCsvNormalizedRow[] | null | undefined;
  hasCsvPlan: boolean;
  csvType?: ApartmentPlanCsvParseDiagnostics["csvType"];
  period: "month" | "quarter";
  currentPeriodKey: string;
  objectId: string;
  objects: readonly { id: string; name: string }[];
  dealRows: readonly NormalizedDealRow[];
}): StoragePlanAnalyticsBreakdown {
  const categories = resolveStorageChartCategories(args.rows, args.dealRows);
  const qMonths = quarterKeyToMonthKeys(args.currentPeriodKey);
  const endMonthKey =
    args.period === "quarter" && qMonths?.length ? qMonths[qMonths.length - 1]! : args.currentPeriodKey;
  const summaryMonthKey = args.period === "month" ? args.currentPeriodKey : endMonthKey;
  const summaryEntity = mergeEntitySummaryWithCsvRow(
    args.rows ?? [],
    null,
    isBiStorageSummaryRow,
    summaryMonthKey,
  );
  const storageSummary = summaryEntity
    ? { planMonth: summaryEntity.planMonth, planCumulative: summaryEntity.planCumulative }
    : null;
  const factsByCat = storagePlanFactsFromDealsByCategory(
    args.dealRows,
    {
      period: args.period,
      currentPeriodKey: args.currentPeriodKey,
    },
    categories,
  );

  const items: StoragePlanAnalyticsItem[] = categories.map((meta) => {
    let planMonth = 0;
    let planCumulative = 0;
    if (args.hasCsvPlan && Array.isArray(args.rows) && args.rows.length > 0) {
      const slice = selectPlanSliceForStorageCategory(args.rows, meta.key, {
        period: args.period,
        currentPeriodKey: args.currentPeriodKey,
        objectId: args.objectId,
        objects: args.objects,
        csvType: args.csvType,
        storageSummary: meta.key === "total" ? storageSummary : null,
      });
      planMonth = slice?.planMonth ?? 0;
      planCumulative = slice?.planCumulative ?? 0;
    }
    const facts = factsByCat[meta.key] ?? { factMonth: 0, factCumulative: 0 };
    return {
      ...meta,
      planMonth,
      planCumulative,
      factMonth: facts.factMonth,
      factCumulative: facts.factCumulative,
    };
  });

  return { hasCsvPlan: args.hasCsvPlan, items };
}

export function buildStoragePerformanceChartRows(
  breakdown: StoragePlanAnalyticsBreakdown | null | undefined,
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
