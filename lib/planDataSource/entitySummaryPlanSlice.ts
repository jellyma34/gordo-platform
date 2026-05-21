import type { ApartmentPlanCsvNormalizedRow, ApartmentPlanKpiCumulativeMode } from "@/lib/planDataSource/types";

/** Сводная строка сущности (Квартиры / Парковки / Кладовые) из CSV. */
export type EntitySummaryPlanSlice = {
  planMonth: number;
  planCumulative: number;
  planProject: number;
  rawLabel: string;
};

export type IsEntitySummaryRowFn = (segmentNorm: string, rawLabel?: string) => boolean;

function coalesceMetric(rowVal: number, explicitVal: number | undefined): number {
  if (Number.isFinite(rowVal) && rowVal > 0) return rowVal;
  if (explicitVal != null && Number.isFinite(explicitVal) && explicitVal > 0) return explicitVal;
  return Math.max(0, Number.isFinite(rowVal) ? rowVal : 0, explicitVal ?? 0);
}

function rowSummaryScore(r: ApartmentPlanCsvNormalizedRow): number {
  const pc = Number.isFinite(r.planCumulative) ? r.planCumulative : 0;
  const pm = Number.isFinite(r.planMonth) ? r.planMonth : 0;
  const tv = Number.isFinite(r.totalVolume) ? r.totalVolume : 0;
  return pc * 1_000_000 + pm * 1_000 + tv;
}

function pickBestSummaryRow(pool: readonly ApartmentPlanCsvNormalizedRow[]): ApartmentPlanCsvNormalizedRow | null {
  if (!pool.length) return null;
  const withMetrics = pool.filter((r) => r.planCumulative > 0 || r.planMonth > 0 || r.totalVolume > 0);
  const use = withMetrics.length ? withMetrics : pool;
  return use.reduce<ApartmentPlanCsvNormalizedRow | null>((best, r) => {
    if (!best || rowSummaryScore(r) > rowSummaryScore(best)) return r;
    return best;
  }, null);
}

/** Root summary row из полного CSV (без фильтра по объекту). */
export function findEntityRootSummaryInCsvRows(
  rows: readonly ApartmentPlanCsvNormalizedRow[],
  isSummaryRow: IsEntitySummaryRowFn,
  monthKey?: string,
): ApartmentPlanCsvNormalizedRow | null {
  const candidates = rows.filter((r) => isSummaryRow(r.segmentNorm, r.segmentNorm));
  if (!candidates.length) return null;
  /** Legacy/BI CSV: monthKey в строках = месяц отчёта при импорте; undefined — без фильтра по дашборду. */
  if (monthKey) {
    const scoped = candidates.filter((r) => r.monthKey === monthKey);
    const picked = pickBestSummaryRow(scoped);
    if (picked) return picked;
  }
  return pickBestSummaryRow(candidates);
}

/**
 * Свод KPI из root-row CSV (приоритет) + meta после загрузки.
 * rows — полный набор CSV (без фильтра по объекту): root «Квартиры» не привязан к корпусу.
 */
export function mergeEntitySummaryWithCsvRow(
  rows: readonly ApartmentPlanCsvNormalizedRow[],
  explicit: EntitySummaryPlanSlice | null | undefined,
  isSummaryRow: IsEntitySummaryRowFn,
  monthKey?: string,
): EntitySummaryPlanSlice | null {
  const picked = findEntityRootSummaryInCsvRows(rows, isSummaryRow, monthKey);

  let fromRow: EntitySummaryPlanSlice | null = null;
  if (picked) {
    fromRow = {
      planMonth: Math.max(0, picked.planMonth),
      planCumulative: Math.max(0, picked.planCumulative),
      planProject: Math.max(0, picked.totalVolume),
      rawLabel: picked.segmentNorm,
    };
  }

  if (!fromRow) return explicit ?? null;
  if (!explicit) return fromRow;

  return {
    planMonth: coalesceMetric(fromRow.planMonth, explicit.planMonth),
    planCumulative: coalesceMetric(fromRow.planCumulative, explicit.planCumulative),
    planProject: coalesceMetric(fromRow.planProject, explicit.planProject),
    rawLabel: explicit.rawLabel || fromRow.rawLabel,
  };
}

function sumPlanMonthRows(rows: readonly ApartmentPlanCsvNormalizedRow[]): number {
  return rows.reduce((s, r) => {
    const v = r.planMonth;
    return s + (Number.isFinite(v) && v > 0 ? v : 0);
  }, 0);
}

/**
 * Накопительный план для верхнего KPI-блока сущности.
 * Только summary.planCumulative; без суммы plan_cumulative по дочерним строкам.
 */
export function entityKpiCumulativePlanFromSummary(
  summary: EntitySummaryPlanSlice | null,
  cumulativeMode: ApartmentPlanKpiCumulativeMode,
  throughMonthDetailRows: readonly ApartmentPlanCsvNormalizedRow[],
): number {
  if (summary != null) {
    return Math.max(0, summary.planCumulative);
  }
  if (cumulativeMode === "wide_table_sum_plan_month") {
    return sumPlanMonthRows(throughMonthDetailRows);
  }
  return 0;
}
