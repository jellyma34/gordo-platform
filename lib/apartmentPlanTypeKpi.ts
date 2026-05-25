import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import { capPlanFields, mergeApartmentPlanCsvWithFacts, type ApartmentPlanPeriodKpiInputs } from "@/lib/apartmentsPlanPeriodKpi";
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
import {
  isApartmentPlanKpiDetailSegment,
  isNonApartmentPropertyRow,
} from "@/lib/planDataSource/apartmentPlanKpiEntity";
import { isRuColumnarPlanCsvType } from "@/lib/planDataSource/apartmentPlanCsvPipeline";
import { getPlanCalculationStrategy } from "@/lib/planDataSource/apartmentPlanKpiStrategy";
import { normalizeMatchKey } from "@/lib/planDataSource/normalize";
import { quarterKeyToMonthKeys } from "@/lib/planDataSource/selectPlanForKpi";
import type { ApartmentPlanCsvNormalizedRow } from "@/lib/planDataSource/types";
import type { ApartmentPlanCsvParseDiagnostics } from "@/lib/planDataSource/types";
import type { ApartmentPlanKpiPlanSlice } from "@/lib/planDataSource/types";

export type ApartmentPlanTypeKey = "apt-1" | "apt-2" | "apt-3" | "apt-4";

export type ApartmentPlanTypeKpiMeta = {
  key: ApartmentPlanTypeKey;
  label: string;
};

export const APARTMENT_PLAN_TYPE_KPI_ORDER: readonly ApartmentPlanTypeKpiMeta[] = [
  { key: "apt-1", label: "1-комнатные" },
  { key: "apt-2", label: "2-комнатные" },
  { key: "apt-3", label: "3-комнатные" },
  { key: "apt-4", label: "4-комнатные+" },
] as const;

/** Подписи сегментов в legacy CSV (не root / не ИТОГО). */
export const APARTMENT_PLAN_TYPE_CSV_SEGMENT_LABELS = [
  "1-ком. квартира",
  "2-ком. квартира",
  "3-ком. квартира",
  "4-ком. и более квар",
] as const;

export type ApartmentPlanTypeKpiSlice = ApartmentPlanPeriodKpiInputs & ApartmentPlanTypeKpiMeta;

export type ApartmentPlanTypeKpiBreakdown = {
  hasCsvPlan: boolean;
  items: ApartmentPlanTypeKpiSlice[];
};

function segmentBlob(segmentNorm: string, rawLabel: string): string {
  return `${segmentNorm} ${rawLabel}`.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

/** CSV «1-ком. квартира» → apt-1 и т.д. */
export function matchApartmentPlanTypeKey(segmentNorm: string, rawLabel = segmentNorm): ApartmentPlanTypeKey | null {
  const blob = segmentBlob(segmentNorm, rawLabel);
  if (!blob) return null;
  if (/4\s*[-–]?\s*ком|4\s*\+|и\s+более|четырехкомн|5\s*[-–]?\s*ком|6\s*[-–]?\s*ком/.test(blob)) return "apt-4";
  if (/3\s*[-–]?\s*ком|трехкомн|трёхкомн/.test(blob)) return "apt-3";
  if (/2\s*[-–]?\s*ком|двухкомн/.test(blob)) return "apt-2";
  if (/1\s*[-–]?\s*ком|однокомн|\bстуди/.test(blob)) return "apt-1";
  return null;
}

function roomCountToTypeKey(roomCount: number): ApartmentPlanTypeKey | null {
  if (!Number.isFinite(roomCount) || roomCount < 1) return null;
  if (roomCount >= 4) return "apt-4";
  if (roomCount === 3) return "apt-3";
  if (roomCount === 2) return "apt-2";
  return "apt-1";
}

/** Факт: `estate_rooms` из JSON, затем подписи / CSV-алиасы. */
export function inferApartmentPlanTypeKeyFromDeal(row: NormalizedDealRow): ApartmentPlanTypeKey | null {
  if (row.apartmentRoomCount != null) {
    const fromRooms = roomCountToTypeKey(row.apartmentRoomCount);
    if (fromRooms) return fromRooms;
  }
  const hints = [row.objectParams.type, row.objectLabel, row.objectUnitLabel, row.typeLabel]
    .filter((s) => s != null && String(s).trim() !== "")
    .join(" ");
  return matchApartmentPlanTypeKey(normalizeMatchKey(hints), hints);
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

function filterTypeRows(
  rows: readonly ApartmentPlanCsvNormalizedRow[],
  typeKey: ApartmentPlanTypeKey,
  objectId: string,
  objects: readonly { id: string; name: string }[],
): ApartmentPlanCsvNormalizedRow[] {
  return rows.filter((r) => {
    const raw = r.segmentNorm;
    if (!segmentMatchesObject(r, objectId, objects)) return false;
    if (isNonApartmentPropertyRow(r.segmentNorm, raw)) return false;
    if (!isApartmentPlanKpiDetailSegment(r.segmentNorm, raw)) return false;
    return matchApartmentPlanTypeKey(r.segmentNorm, raw) === typeKey;
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

/**
 * План KPI по одному типу квартир (строки 1–4-ком. из CSV).
 * Накопительно: BI — колонка plan_cumulative; wide — сумма plan_month ≤ конец периода.
 */
export function selectPlanSliceForApartmentTypeKpi(
  rows: readonly ApartmentPlanCsvNormalizedRow[],
  typeKey: ApartmentPlanTypeKey,
  opts: {
    period: "month" | "quarter";
    currentPeriodKey: string;
    objectId: string;
    objects: readonly { id: string; name: string }[];
    csvType?: ApartmentPlanCsvParseDiagnostics["csvType"];
  },
): ApartmentPlanKpiPlanSlice | null {
  const typeRows = filterTypeRows(rows, typeKey, opts.objectId, opts.objects);
  if (!typeRows.length) return null;

  const { cumulativeMode } = getPlanCalculationStrategy(opts.csvType);
  const isColumnarCsv = isRuColumnarPlanCsvType(opts.csvType);
  const qMonths = quarterKeyToMonthKeys(opts.currentPeriodKey);
  const endMonthKey =
    opts.period === "quarter" && qMonths?.length ? qMonths[qMonths.length - 1]! : opts.currentPeriodKey;

  if (opts.period === "month") {
    const monthRows = isColumnarCsv
      ? typeRows
      : typeRows.filter((r) => r.monthKey === opts.currentPeriodKey);
    const planMonth = sumPlanMonthRows(monthRows);

    let planCumulative: number;
    if (cumulativeMode === "bi_report_ready_column") {
      planCumulative = maxPlanCumulative(monthRows.length ? monthRows : typeRows);
    } else {
      const throughMonth = isColumnarCsv
        ? typeRows
        : typeRows.filter((r) => r.monthKey <= opts.currentPeriodKey);
      planCumulative = sumPlanMonthRows(throughMonth);
    }

    const totalVolume = typeRows.reduce((m, r) => Math.max(m, r.totalVolume), 0);
    return { planMonth, planCumulative, totalVolume, cumulativeMode };
  }

  const inQuarter = isColumnarCsv
    ? typeRows
    : qMonths != null
      ? typeRows.filter((r) => qMonths.includes(r.monthKey))
      : typeRows.filter((r) => r.monthKey === opts.currentPeriodKey);

  const planMonth = sumPlanMonthRows(inQuarter);

  let planCumulative: number;
  if (cumulativeMode === "bi_report_ready_column") {
    planCumulative = maxPlanCumulative(inQuarter.length ? inQuarter : typeRows);
  } else {
    const throughMonth = isColumnarCsv
      ? typeRows
      : typeRows.filter((r) => r.monthKey <= endMonthKey);
    planCumulative = sumPlanMonthRows(throughMonth);
  }

  const totalVolume = typeRows.reduce((m, r) => Math.max(m, r.totalVolume), 0);
  return { planMonth, planCumulative, totalVolume, cumulativeMode };
}

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

/**
 * Факт по типам квартир из JSON (как «Структура продаж»: все квартиры в выгрузке).
 * Накопительно — все сделки-квартиры с известной комнатностью; месяц — сделки отчётного периода.
 */
export function apartmentPlanFactsFromDealsByTypeForKpi(
  rows: readonly NormalizedDealRow[],
  opts: { period: "month" | "quarter"; currentPeriodKey: string },
): Record<ApartmentPlanTypeKey, { factMonth: number; factCumulative: number }> {
  const empty = (): Record<ApartmentPlanTypeKey, { factMonth: number; factCumulative: number }> => ({
    "apt-1": { factMonth: 0, factCumulative: 0 },
    "apt-2": { factMonth: 0, factCumulative: 0 },
    "apt-3": { factMonth: 0, factCumulative: 0 },
    "apt-4": { factMonth: 0, factCumulative: 0 },
  });

  const { endMonthKey, monthKeysInPeriod } = resolveKpiMonthWindow(opts.period, opts.currentPeriodKey);
  const result = empty();

  for (const r of rows) {
    if (r.dealType !== "apartment") continue;
    const typeKey = inferApartmentPlanTypeKeyFromDeal(r);
    if (!typeKey) continue;

    const mk = canonicalMonthKey(r);
    if (!mk) continue;

    if (mk <= endMonthKey) {
      result[typeKey].factCumulative += 1;
    }
    if (monthKeysInPeriod.has(mk)) {
      result[typeKey].factMonth += 1;
    }
  }

  return result;
}

/** Свод «Квартиры» = сумма KPI по комнатностям (1к + 2к + 3к + 4к+), не отдельная строка CSV «apartments». */
export function buildApartmentTotals(
  breakdown: ApartmentPlanTypeKpiBreakdown,
): Pick<ApartmentPlanPeriodKpiInputs, "planMonth" | "factMonth" | "planCumulative" | "factCumulative"> {
  let planMonth = 0;
  let factMonth = 0;
  let planCumulative = 0;
  let factCumulative = 0;
  for (const item of breakdown.items) {
    planMonth += item.planMonth;
    factMonth += item.factMonth;
    planCumulative += item.planCumulative;
    factCumulative += item.factCumulative;
  }
  return { planMonth, factMonth, planCumulative, factCumulative };
}

export function buildApartmentPlanTypeKpiBreakdown(args: {
  rows: readonly ApartmentPlanCsvNormalizedRow[] | null | undefined;
  hasCsvPlan: boolean;
  csvType?: ApartmentPlanCsvParseDiagnostics["csvType"];
  period: "month" | "quarter";
  currentPeriodKey: string;
  objectId: string;
  objects: readonly { id: string; name: string }[];
  dealRows: readonly NormalizedDealRow[];
}): ApartmentPlanTypeKpiBreakdown {
  const factsByType = apartmentPlanFactsFromDealsByTypeForKpi(args.dealRows, {
    period: args.period,
    currentPeriodKey: args.currentPeriodKey,
  });

  const items: ApartmentPlanTypeKpiSlice[] = APARTMENT_PLAN_TYPE_KPI_ORDER.map((meta) => {
    const facts = factsByType[meta.key];
    if (args.hasCsvPlan && Array.isArray(args.rows) && args.rows.length > 0) {
      const planSlice = selectPlanSliceForApartmentTypeKpi(args.rows, meta.key, {
        period: args.period,
        currentPeriodKey: args.currentPeriodKey,
        objectId: args.objectId,
        objects: args.objects,
        csvType: args.csvType,
      });
      if (planSlice) {
        return {
          ...meta,
          ...mergeApartmentPlanCsvWithFacts(planSlice, facts),
        };
      }
      return {
        ...meta,
        ...capPlanFields(
          { planMonth: 0, planCumulative: 0, factMonth: facts.factMonth, factCumulative: facts.factCumulative },
          0,
        ),
        totalVolume: 0,
      };
    }

    return {
      ...meta,
      planMonth: 0,
      planCumulative: 0,
      factMonth: facts.factMonth,
      factCumulative: facts.factCumulative,
      totalVolume: 0,
    };
  });

  return { hasCsvPlan: args.hasCsvPlan, items };
}
