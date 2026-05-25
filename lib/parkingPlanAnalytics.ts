import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import { isApartmentKpiDealSoldStatus } from "@/lib/apartmentPlanFactsFromDeals";
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
import { isParkingRootSummaryRow } from "@/lib/planDataSource/entityRowMatchers";
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
import { normalizeMatchKey } from "@/lib/planDataSource/normalize";
import { quarterKeyToMonthKeys } from "@/lib/planDataSource/selectPlanForKpi";
import type { ApartmentPlanCsvNormalizedRow } from "@/lib/planDataSource/types";
import type { ApartmentPlanCsvParseDiagnostics } from "@/lib/planDataSource/types";
import type { ApartmentPlanKpiPlanSlice } from "@/lib/planDataSource/types";
export type ParkingPlanCategoryKey = "underground" | "surface" | "family" | "moto" | "guest" | "total";

export type ParkingPlanCategoryMeta = {
  key: ParkingPlanCategoryKey;
  label: string;
  shortLabel: string;
};

function canonicalMonthKey(row: NormalizedDealRow): string | null {
  const mk = normalizeMonthKey(row.monthKey) ?? normalizeMonthKey(row.dealDate);
  if (mk && /^\d{4}-\d{2}$/.test(mk)) return mk;
  const head = String(row.dealDate ?? "").trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(head) ? head : null;
}

export const PARKING_PLAN_CATEGORY_ORDER: readonly ParkingPlanCategoryMeta[] = [
  { key: "underground", label: "Подземные", shortLabel: "Подзем." },
  { key: "surface", label: "Наземные", shortLabel: "Назем." },
  { key: "family", label: "Семейные", shortLabel: "Семейн." },
  { key: "moto", label: "Мото", shortLabel: "Мото" },
  { key: "guest", label: "Гостевые", shortLabel: "Гостев." },
] as const;

const TOTAL_PARKING_META: ParkingPlanCategoryMeta = {
  key: "total",
  label: "Машино-места",
  shortLabel: "ММ",
};

function segmentBlob(segmentNorm: string, rawLabel: string): string {
  return `${segmentNorm} ${rawLabel}`.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

function isStorageOrCommercial(blob: string): boolean {
  return (
    blob.includes("кладов") ||
    blob.includes("коммерц") ||
    blob.includes("нежил") ||
    blob.includes("офис") ||
    blob.includes("ритейл") ||
    (blob.includes("storage") && !blob.includes("parking"))
  );
}

/** Строка CSV относится к парковкам / машино-местам (не квартиры, не кладовые, не коммерция). */
export function isParkingPropertyRow(segmentNorm: string, rawLabel = segmentNorm): boolean {
  if (isBiGrandTotalRow(segmentNorm, rawLabel) || isBiApartmentsSummaryRow(segmentNorm, rawLabel)) {
    return false;
  }
  const blob = segmentBlob(segmentNorm, rawLabel);
  if (isStorageOrCommercial(blob)) return false;
  if (/[1-4]\s*[-–]?\s*ком/.test(blob) || (blob.includes("квартир") && !blob.includes("парков"))) {
    return false;
  }
  return (
    blob.includes("парков") ||
    blob.includes("машиномест") ||
    blob.includes("машино-мест") ||
    blob.includes("мм ") ||
    blob.includes("parking") ||
    blob.includes("паркинг") ||
    blob.includes("гараж")
  );
}

/** Свод «Парковки» / «Машино-места» в BI-отчёте. */
export function isBiParkingSummaryRow(segmentNorm: string, rawLabel = segmentNorm): boolean {
  if (!isParkingPropertyRow(segmentNorm, rawLabel)) return false;
  return isParkingRootSummaryRow(segmentNorm, rawLabel);
}

/** Детальная строка типа парковки (подземные, наземные, …). */
export function isParkingDetailSegment(segmentNorm: string, rawLabel = segmentNorm): boolean {
  if (!isParkingPropertyRow(segmentNorm, rawLabel)) return false;
  if (isBiParkingSummaryRow(segmentNorm, rawLabel)) return false;
  return matchParkingCategoryKey(segmentNorm, rawLabel) != null;
}

export function matchParkingCategoryKey(
  segmentNorm: string,
  rawLabel = segmentNorm,
): ParkingPlanCategoryKey | null {
  const blob = segmentBlob(segmentNorm, rawLabel);
  if (!isParkingPropertyRow(segmentNorm, rawLabel)) return null;
  if (/подзем|underground|under\s*ground/.test(blob)) return "underground";
  if (/назем|надзем|надземн|surface|на\s*земл/.test(blob)) return "surface";
  if (/семейн|family/.test(blob)) return "family";
  if (/мото|moto|байк|bike/.test(blob)) return "moto";
  if (/гостев|guest/.test(blob)) return "guest";
  return null;
}

export function inferParkingCategoryFromDeal(row: NormalizedDealRow): ParkingPlanCategoryKey | null {
  if (row.dealType !== "parking") return null;
  const hints = [row.objectParams.type, row.objectLabel, row.objectUnitLabel, row.typeLabel]
    .filter((s) => s != null && String(s).trim() !== "")
    .join(" ");
  const fromHints = matchParkingCategoryKey(normalizeMatchKey(hints), hints);
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
  categoryKey: ParkingPlanCategoryKey,
  objectId: string,
  objects: readonly { id: string; name: string }[],
): ApartmentPlanCsvNormalizedRow[] {
  return rows.filter((r) => {
    const raw = r.segmentNorm;
    if (!segmentMatchesObject(r, objectId, objects)) return false;
    if (!isParkingPropertyRow(r.segmentNorm, raw)) return false;
    if (categoryKey === "total") {
      return isBiParkingSummaryRow(r.segmentNorm, raw);
    }
    return matchParkingCategoryKey(r.segmentNorm, raw) === categoryKey;
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

function selectPlanSliceForParkingCategory(
  rows: readonly ApartmentPlanCsvNormalizedRow[],
  categoryKey: ParkingPlanCategoryKey,
  opts: {
    period: "month" | "quarter";
    currentPeriodKey: string;
    objectId: string;
    objects: readonly { id: string; name: string }[];
    csvType?: ApartmentPlanCsvParseDiagnostics["csvType"];
    parkingSummary?: { planCumulative: number; planMonth: number } | null;
  },
): ApartmentPlanKpiPlanSlice | null {
  const typeRows = filterCategoryRows(rows, categoryKey, opts.objectId, opts.objects);

  if (!typeRows.length && !opts.parkingSummary) return null;

  const { cumulativeMode } = getPlanCalculationStrategy(opts.csvType);
  const isColumnarCsv = isRuColumnarPlanCsvType(opts.csvType);
  const qMonths = quarterKeyToMonthKeys(opts.currentPeriodKey);
  const endMonthKey =
    opts.period === "quarter" && qMonths?.length ? qMonths[qMonths.length - 1]! : opts.currentPeriodKey;

  let planMonth = 0;
  let planCumulative = 0;

  if (categoryKey === "total" && opts.parkingSummary && opts.parkingSummary.planCumulative > 0) {
    planMonth = opts.parkingSummary.planMonth;
    planCumulative = opts.parkingSummary.planCumulative;
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

function filterParkingKpiRows(
  rows: readonly ApartmentPlanCsvNormalizedRow[],
  objectId: string,
  objects: readonly { id: string; name: string }[],
): ApartmentPlanCsvNormalizedRow[] {
  return rows.filter((r) => {
    const raw = r.segmentNorm;
    if (!segmentMatchesObject(r, objectId, objects)) return false;
    return isParkingPropertyRow(r.segmentNorm, raw);
  });
}

function sumParkingPlanMonthRows(rows: readonly ApartmentPlanCsvNormalizedRow[]): number {
  return rows.reduce((s, r) => {
    const v = r.planMonth;
    return s + (Number.isFinite(v) && v > 0 ? v : 0);
  }, 0);
}

function resolveParkingProjectPlanVolume(
  summary: ReturnType<typeof mergeEntitySummaryWithCsvRow>,
): number {
  if (summary && summary.planProject > 0) return summary.planProject;
  return 0;
}

/** Свод KPI машино-мест (план месяца / накопительно / объём проекта). */
export function selectPlanSliceForParkingKpi(
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
  const parkingRows = filterParkingKpiRows(rows, opts.objectId, opts.objects);

  const qMonths = quarterKeyToMonthKeys(opts.currentPeriodKey);
  const endMonthKey =
    opts.period === "quarter" && qMonths?.length ? qMonths[qMonths.length - 1]! : opts.currentPeriodKey;
  const summaryMonthKey = opts.period === "month" ? opts.currentPeriodKey : endMonthKey;

  const isColumnarCsv = isRuColumnarPlanCsvType(opts.csvType);

  const summary = mergeEntitySummaryWithCsvRow(
    rows,
    null,
    isBiParkingSummaryRow,
    isColumnarCsv ? undefined : summaryMonthKey,
  );

  if (!parkingRows.length && !summary) return null;

  const { cumulativeMode } = getPlanCalculationStrategy(opts.csvType);

  if (opts.period === "month") {
    const monthRows = isColumnarCsv
      ? parkingRows
      : parkingRows.filter((r) => r.monthKey === opts.currentPeriodKey);
    const planMonth =
      summary && summary.planMonth > 0 ? summary.planMonth : sumParkingPlanMonthRows(monthRows);
    const throughMonth = isColumnarCsv
      ? parkingRows
      : parkingRows.filter((r) => r.monthKey <= opts.currentPeriodKey);
    const planCumulative = entityKpiCumulativePlanFromSummary(summary, cumulativeMode, throughMonth);
    const totalVolume = resolveParkingProjectPlanVolume(summary);
    return { planMonth, planCumulative, totalVolume, cumulativeMode };
  }

  const inQuarter = isColumnarCsv
    ? parkingRows
    : qMonths != null
      ? parkingRows.filter((r) => qMonths.includes(r.monthKey))
      : parkingRows.filter((r) => r.monthKey === opts.currentPeriodKey);

  const planMonth = summary && summary.planMonth > 0 ? summary.planMonth : sumParkingPlanMonthRows(inQuarter);
  const throughMonth = isColumnarCsv
    ? parkingRows
    : parkingRows.filter((r) => r.monthKey <= endMonthKey);
  const planCumulative = entityKpiCumulativePlanFromSummary(summary, cumulativeMode, throughMonth);
  const totalVolume = resolveParkingProjectPlanVolume(summary);

  return { planMonth, planCumulative, totalVolume, cumulativeMode };
}

function resolveParkingChartCategories(
  rows: readonly ApartmentPlanCsvNormalizedRow[] | null | undefined,
  dealRows: readonly NormalizedDealRow[],
): readonly ParkingPlanCategoryMeta[] {
  const detailKeys = new Set<ParkingPlanCategoryKey>();
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (!isParkingDetailSegment(r.segmentNorm, r.segmentNorm)) continue;
      const k = matchParkingCategoryKey(r.segmentNorm, r.segmentNorm);
      if (k) detailKeys.add(k);
    }
  }
  if (detailKeys.size > 0) {
    return PARKING_PLAN_CATEGORY_ORDER.filter((m) => detailKeys.has(m.key));
  }

  const hasParkingCsv = Array.isArray(rows) && rows.some((r) => isParkingPropertyRow(r.segmentNorm, r.segmentNorm));
  if (hasParkingCsv) return [TOTAL_PARKING_META];

  const dealCats = new Set<ParkingPlanCategoryKey>();
  for (const r of dealRows) {
    if (r.dealType !== "parking") continue;
    if (!isApartmentKpiDealSoldStatus(r.statusLabel, r.dealKindLabel)) continue;
    const k = inferParkingCategoryFromDeal(r);
    if (k && k !== "total") dealCats.add(k);
  }
  if (dealCats.size > 0) {
    return PARKING_PLAN_CATEGORY_ORDER.filter((m) => dealCats.has(m.key));
  }

  const hasParkingDeals = dealRows.some(
    (r) => r.dealType === "parking" && isApartmentKpiDealSoldStatus(r.statusLabel, r.dealKindLabel),
  );
  if (hasParkingDeals) return [TOTAL_PARKING_META];

  return [];
}

export function parkingPlanFactsFromDealsByCategory(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
  categories: readonly ParkingPlanCategoryMeta[],
): Record<ParkingPlanCategoryKey, { factMonth: number; factCumulative: number }> {
  const result = Object.fromEntries(
    categories.map((c) => [c.key, { factMonth: 0, factCumulative: 0 }]),
  ) as Record<ParkingPlanCategoryKey, { factMonth: number; factCumulative: number }>;
  const useTotalOnly = categories.length === 1 && categories[0]!.key === "total";

  const qMonths = quarterKeyToMonthKeys(opts.currentPeriodKey);
  const endMonthKey =
    opts.period === "quarter" && qMonths?.length ? qMonths[qMonths.length - 1]! : opts.currentPeriodKey;
  const monthKeysInPeriod =
    opts.period === "quarter" && qMonths?.length ? new Set(qMonths) : new Set([opts.currentPeriodKey]);

  for (const r of rows) {
    if (r.dealType !== "parking") continue;
    if (!isApartmentKpiDealSoldStatus(r.statusLabel, r.dealKindLabel)) continue;
    const cat = useTotalOnly ? "total" : inferParkingCategoryFromDeal(r);
    if (!cat || !(cat in result)) continue;
    const mk = canonicalMonthKey(r);
    if (!mk) continue;
    if (mk <= endMonthKey) result[cat].factCumulative += 1;
    if (monthKeysInPeriod.has(mk)) result[cat].factMonth += 1;
  }

  return result;
}

export type ParkingPlanAnalyticsItem = ParkingPlanCategoryMeta & {
  planMonth: number;
  planCumulative: number;
  factMonth: number;
  factCumulative: number;
};

/** Свод машино-мест = сумма по категориям (детальным строкам CSV / JSON). */
export function buildParkingTotals(breakdown: ParkingPlanAnalyticsBreakdown): {
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

export type ParkingPlanAnalyticsBreakdown = {
  hasCsvPlan: boolean;
  items: ParkingPlanAnalyticsItem[];
};

export function buildParkingPlanAnalyticsBreakdown(args: {
  rows: readonly ApartmentPlanCsvNormalizedRow[] | null | undefined;
  hasCsvPlan: boolean;
  csvType?: ApartmentPlanCsvParseDiagnostics["csvType"];
  period: "month" | "quarter";
  currentPeriodKey: string;
  objectId: string;
  objects: readonly { id: string; name: string }[];
  dealRows: readonly NormalizedDealRow[];
}): ParkingPlanAnalyticsBreakdown {
  const categories = resolveParkingChartCategories(args.rows, args.dealRows);
  const qMonths = quarterKeyToMonthKeys(args.currentPeriodKey);
  const endMonthKey =
    args.period === "quarter" && qMonths?.length ? qMonths[qMonths.length - 1]! : args.currentPeriodKey;
  const summaryMonthKey = args.period === "month" ? args.currentPeriodKey : endMonthKey;
  const summaryEntity = mergeEntitySummaryWithCsvRow(
    args.rows ?? [],
    null,
    isBiParkingSummaryRow,
    summaryMonthKey,
  );
  const parkingSummary = summaryEntity
    ? { planMonth: summaryEntity.planMonth, planCumulative: summaryEntity.planCumulative }
    : null;
  const factsByCat = parkingPlanFactsFromDealsByCategory(args.dealRows, {
    period: args.period,
    currentPeriodKey: args.currentPeriodKey,
  }, categories);

  const items: ParkingPlanAnalyticsItem[] = categories.map((meta) => {
    let planMonth = 0;
    let planCumulative = 0;
    if (args.hasCsvPlan && Array.isArray(args.rows) && args.rows.length > 0) {
      const slice = selectPlanSliceForParkingCategory(args.rows, meta.key, {
        period: args.period,
        currentPeriodKey: args.currentPeriodKey,
        objectId: args.objectId,
        objects: args.objects,
        csvType: args.csvType,
        parkingSummary: meta.key === "total" ? parkingSummary : null,
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

export function buildParkingPerformanceChartRows(
  breakdown: ParkingPlanAnalyticsBreakdown | null | undefined,
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
