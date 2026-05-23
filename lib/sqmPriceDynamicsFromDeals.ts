import {
  dealEffectiveObjectPriceRub,
  type NormalizedDealRow,
} from "@/components/marketing/DealsSection";
import { canonicalMonthKey } from "@/lib/apartmentPlanFactsFromDeals";
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
import { inferApartmentPlanTypeKeyFromDeal, type ApartmentPlanTypeKey } from "@/lib/apartmentPlanTypeKpi";
import type { DealsAnalyticsSegmentKey } from "@/lib/buildDealsSegmentMonthAnalytics";
import { formatMonthKeyShortRuYY } from "@/lib/normalizeMonthKey";

export type SqmPriceDynamicsSeriesKey = ApartmentPlanTypeKey | DealsAnalyticsSegmentKey;

export type SqmPriceDynamicsMonthPoint = {
  monthKey: string;
  labelShort: string;
  /** Взвешенная средняя ₽/м²: Σ цена / Σ площадь. */
  avgPricePerSqmRub: number | null;
  dealCount: number;
  totalPriceRub: number;
  totalAreaM2: number;
};

export type SqmPriceDynamicsSeriesModel = {
  key: SqmPriceDynamicsSeriesKey;
  label: string;
  accentHex: string;
  months: SqmPriceDynamicsMonthPoint[];
  /** Средняя ₽/м² за весь период (взвешенная). */
  overallAvgPricePerSqmRub: number | null;
  totalDeals: number;
};

/** Фиксированный порядок строк sparkline (без коммерции). */
export type SqmPriceDynamicsDisplaySegmentId = ApartmentPlanTypeKey | "parking" | "storage";

export type SqmPriceDynamicsDisplayRowMeta = {
  id: SqmPriceDynamicsDisplaySegmentId;
  label: string;
  stroke: string;
};

export const SQM_PRICE_DYNAMICS_DISPLAY_ROWS: readonly SqmPriceDynamicsDisplayRowMeta[] = [
  { id: "apt-1", label: "1-комнатные", stroke: "#F59E0B" },
  { id: "apt-2", label: "2-комнатные", stroke: "#10B981" },
  { id: "apt-3", label: "3-комнатные", stroke: "#2563EB" },
  { id: "apt-4", label: "4-комнатные+", stroke: "#9333EA" },
  { id: "parking", label: "Паркинг", stroke: "#8B5CF6" },
  { id: "storage", label: "Кладовые", stroke: "#0F172A" },
] as const;

export type SqmPriceDynamicsBundle = {
  timelineMonthKeys: string[];
  rows: SqmPriceDynamicsSeriesModel[];
};

type MonthCell = { priceSum: number; areaSum: number; dealCount: number };

/** Подпись для тултипа: «Янв 2026». */
export function sqmPriceDynamicsMonthTooltipLabel(monthKey: string): string {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return monthKey;
  const raw = new Date(y, mo - 1, 1).toLocaleDateString("ru-RU", { month: "short", year: "numeric" });
  const cleaned = raw.replace(/\s*г\.?\s*$/i, "").replace(/\./g, "");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function nextMonthKey(ym: string): string {
  const [ys, ms] = ym.split("-");
  let y = Number(ys);
  let mo = Number(ms);
  mo += 1;
  if (mo > 12) {
    mo = 1;
    y += 1;
  }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/** Непрерывный ряд месяцев `YYYY-MM` от min до max включительно. */
export function buildSqmDynamicsMonthRange(fromMonthKey: string, toMonthKey: string): string[] {
  if (fromMonthKey > toMonthKey) return [];
  const out: string[] = [];
  let cur = fromMonthKey;
  while (cur <= toMonthKey) {
    out.push(cur);
    cur = nextMonthKey(cur);
  }
  return out;
}

/**
 * Единый timeline по всем сделкам JSON: min/max месяц продажи (без среза по сегменту).
 */
export function globalTimelineFromAllDeals(rows: readonly NormalizedDealRow[]): string[] {
  const months: string[] = [];
  for (const r of rows) {
    const mk = resolveSqmDynamicsMonthKey(r);
    if (mk) months.push(mk);
  }
  if (months.length === 0) return [];
  months.sort();
  return buildSqmDynamicsMonthRange(months[0]!, months[months.length - 1]!);
}

function dealPriceAndArea(row: NormalizedDealRow): { priceRub: number; areaM2: number } | null {
  const areaM2 = row.objectParams.areaTotal;
  if (areaM2 == null || !Number.isFinite(areaM2) || areaM2 <= 0) return null;
  const priceRub = dealEffectiveObjectPriceRub(row);
  if (!Number.isFinite(priceRub) || priceRub <= 0) return null;
  return { priceRub, areaM2 };
}

function weightedAvg(cell: MonthCell): number | null {
  if (cell.areaSum <= 0) return null;
  return Math.round(cell.priceSum / cell.areaSum);
}

/** Канонический ключ месяца для ₽/м²: только `YYYY-MM`. */
export function normalizeSqmDynamicsMonthKey(input: string | null | undefined): string | null {
  const mk = normalizeMonthKey(input);
  if (mk && /^\d{4}-\d{2}$/.test(mk)) return mk;
  return null;
}

/** Месяц продажи — `monthKey` из JSON, иначе дата сделки (всегда `YYYY-MM`). */
export function resolveSqmDynamicsMonthKey(row: NormalizedDealRow): string | null {
  return (
    normalizeSqmDynamicsMonthKey(row.monthKey) ??
    normalizeSqmDynamicsMonthKey(row.dealDate) ??
    canonicalMonthKey(row)
  );
}

function buildSingleSeriesModel(
  key: SqmPriceDynamicsSeriesKey,
  label: string,
  accentHex: string,
  perMonth: Map<string, MonthCell>,
  timelineMonthKeys: readonly string[],
): SqmPriceDynamicsSeriesModel {
  const months: SqmPriceDynamicsMonthPoint[] = timelineMonthKeys.map((mk) => {
    const cell = perMonth.get(mk) ?? { priceSum: 0, areaSum: 0, dealCount: 0 };
    return {
      monthKey: mk,
      labelShort: formatMonthKeyShortRuYY(mk),
      avgPricePerSqmRub: weightedAvg(cell),
      dealCount: cell.dealCount,
      totalPriceRub: cell.priceSum,
      totalAreaM2: cell.areaSum,
    };
  });
  let totalPriceRub = 0;
  let totalAreaM2 = 0;
  let totalDeals = 0;
  for (const m of months) {
    totalPriceRub += m.totalPriceRub;
    totalAreaM2 += m.totalAreaM2;
    totalDeals += m.dealCount;
  }
  return {
    key,
    label,
    accentHex,
    months,
    overallAvgPricePerSqmRub: totalAreaM2 > 0 ? Math.round(totalPriceRub / totalAreaM2) : null,
    totalDeals,
  };
}

/**
 * Динамика ₽/м² по всей истории JSON-сделок (без среза KPI-периода дашборда).
 * Каждая сделка с ценой и площадью → помесячная взвешенная средняя по сегменту.
 */
export function buildSqmPriceDynamicsBundle(rows: readonly NormalizedDealRow[]): SqmPriceDynamicsBundle {
  const aptCellsByType: Record<ApartmentPlanTypeKey, Map<string, MonthCell>> = {
    "apt-1": new Map(),
    "apt-2": new Map(),
    "apt-3": new Map(),
    "apt-4": new Map(),
  };
  const propCellsByType: Record<"parking" | "storage", Map<string, MonthCell>> = {
    parking: new Map(),
    storage: new Map(),
  };

  const bumpCell = (map: Map<string, MonthCell>, mkRaw: string, inputs: { priceRub: number; areaM2: number }) => {
    const mk = normalizeSqmDynamicsMonthKey(mkRaw) ?? mkRaw;
    if (!/^\d{4}-\d{2}$/.test(mk)) return;
    let cell = map.get(mk);
    if (!cell) {
      cell = { priceSum: 0, areaSum: 0, dealCount: 0 };
      map.set(mk, cell);
    }
    cell.priceSum += inputs.priceRub;
    cell.areaSum += inputs.areaM2;
    cell.dealCount += 1;
  };

  for (const r of rows) {
    const mk = resolveSqmDynamicsMonthKey(r);
    if (!mk) continue;
    const inputs = dealPriceAndArea(r);
    if (!inputs) continue;

    if (r.dealType === "apartment") {
      const typeKey = inferApartmentPlanTypeKeyFromDeal(r);
      if (!typeKey) continue;
      bumpCell(aptCellsByType[typeKey], mk, inputs);
      continue;
    }

    if (r.dealType === "parking" || r.dealType === "storage") {
      bumpCell(propCellsByType[r.dealType], mk, inputs);
    }
  }

  const timelineMonthKeys = globalTimelineFromAllDeals(rows);

  const seriesRows: SqmPriceDynamicsSeriesModel[] = SQM_PRICE_DYNAMICS_DISPLAY_ROWS.map((meta) => {
    if (meta.id === "parking" || meta.id === "storage") {
      return buildSingleSeriesModel(meta.id, meta.label, meta.stroke, propCellsByType[meta.id], timelineMonthKeys);
    }
    return buildSingleSeriesModel(meta.id, meta.label, meta.stroke, aptCellsByType[meta.id], timelineMonthKeys);
  });

  return { timelineMonthKeys, rows: seriesRows };
}

export function sqmPriceDynamicsBundleHasData(bundle: SqmPriceDynamicsBundle): boolean {
  return bundle.rows.some((r) => r.totalDeals > 0);
}

export type SqmPriceDynamicsFeedDebug = {
  dealCount: number;
  minMonthKey: string | null;
  maxMonthKey: string | null;
  maxDealDateYmd: string | null;
  /** Сделки без распознанного месяца (часто — битая дата на этапе normalizeDeal). */
  skippedMonthKeyCount: number;
};

/** Временная диагностика пайплайна: охват дат в feed до агрегации ₽/м². */
export function buildSqmPriceDynamicsFeedDebug(rows: readonly NormalizedDealRow[]): SqmPriceDynamicsFeedDebug {
  let minMonthKey: string | null = null;
  let maxMonthKey: string | null = null;
  let maxDealDateYmd: string | null = null;
  let skippedMonthKeyCount = 0;

  for (const r of rows) {
    const mk = resolveSqmDynamicsMonthKey(r);
    if (!mk) {
      skippedMonthKeyCount += 1;
      continue;
    }
    if (minMonthKey == null || mk < minMonthKey) minMonthKey = mk;
    if (maxMonthKey == null || mk > maxMonthKey) maxMonthKey = mk;

    const d = r.dealDate?.trim();
    if (d && (maxDealDateYmd == null || d > maxDealDateYmd)) maxDealDateYmd = d;
  }

  return {
    dealCount: rows.length,
    minMonthKey,
    maxMonthKey,
    maxDealDateYmd,
    skippedMonthKeyCount,
  };
}

function formatMonthKeyRangeRu(minMk: string | null, maxMk: string | null): string {
  if (!minMk && !maxMk) return "—";
  if (!minMk || !maxMk) return formatMonthKeyShortRuYY(minMk ?? maxMk!);
  if (minMk === maxMk) return formatMonthKeyShortRuYY(minMk);
  return `${formatMonthKeyShortRuYY(minMk)} → ${formatMonthKeyShortRuYY(maxMk)}`;
}

/** Точка line chart: value = Σ price / Σ area за месяц (null — нет сделок в сегменте). */
export type SqmPriceChartDatum = {
  month: string;
  value: number | null;
  labelShort: string;
  monthLabel: string;
};

/** Данные графика на общем timeline (все месяцы globalMin…globalMax). */
export function buildSqmPriceChartData(
  series: SqmPriceDynamicsSeriesModel,
  timelineMonthKeys: readonly string[],
): SqmPriceChartDatum[] {
  const valueByMonth = new Map<string, number | null>();
  for (const m of series.months) {
    if (
      m.dealCount > 0 &&
      m.avgPricePerSqmRub != null &&
      Number.isFinite(m.avgPricePerSqmRub) &&
      m.avgPricePerSqmRub > 0
    ) {
      valueByMonth.set(m.monthKey, m.avgPricePerSqmRub);
    }
  }

  return timelineMonthKeys.map((mk) => ({
    month: mk,
    value: valueByMonth.get(mk) ?? null,
    labelShort: formatMonthKeyShortRuYY(mk),
    monthLabel: sqmPriceDynamicsMonthTooltipLabel(mk),
  }));
}

/** Изменение ₽/м²: последний месяц с value vs первый (на общем timeline). */
export function sqmPricePeriodChangePct(data: readonly SqmPriceChartDatum[]): number | null {
  const withValue = data.filter((d): d is SqmPriceChartDatum & { value: number } => d.value != null);
  if (withValue.length < 2) return null;
  const first = withValue[0]!.value;
  const last = withValue[withValue.length - 1]!.value;
  if (!Number.isFinite(first) || first <= 0) return null;
  return ((last - first) / first) * 100;
}

export function sqmPriceDynamicsFeedDebugLine(debug: SqmPriceDynamicsFeedDebug): string {
  const months = formatMonthKeyRangeRu(debug.minMonthKey, debug.maxMonthKey);
  const maxDate = debug.maxDealDateYmd ?? "—";
  const skip =
    debug.skippedMonthKeyCount > 0 ? ` · skip month: ${debug.skippedMonthKeyCount}` : "";
  return `Deals: ${debug.dealCount} · Months: ${months} · Max date: ${maxDate}${skip}`;
}
