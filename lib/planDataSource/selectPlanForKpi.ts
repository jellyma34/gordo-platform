import {
  APARTMENT_KPI_ENTITY,
  isApartmentPlanKpiDetailSegment,
  isBiApartmentsSummaryRow,
  isNonApartmentPropertyRow,
  type ApartmentPlanKpiEntityType,
  type BiApartmentsSummarySlice,
} from "@/lib/planDataSource/apartmentPlanKpiEntity";
import { getPlanCalculationStrategy } from "@/lib/planDataSource/apartmentPlanKpiStrategy";
import { formatMonthKeyShortRuYY } from "@/lib/normalizeMonthKey";
import { normalizeMatchKey } from "@/lib/planDataSource/normalize";
import type { ApartmentPlanCsvNormalizedRow } from "@/lib/planDataSource/types";
import type { ApartmentPlanCsvParseDiagnostics } from "@/lib/planDataSource/types";
import type { ApartmentPlanKpiPlanSlice } from "@/lib/planDataSource/types";

export function quarterKeyToMonthKeys(quarterKey: string): string[] | null {
  const m = /^(\d{4})-Q([1-4])$/i.exec(String(quarterKey).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const q = Number(m[2]);
  const start = (q - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${y}-${String(start + i).padStart(2, "0")}`);
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

/** Только детальные строки квартир (1–4-ком.); без парковок, кладовых, коммерции, ИТОГО. */
function filterApartmentKpiEntityRows(
  rows: readonly ApartmentPlanCsvNormalizedRow[],
): ApartmentPlanCsvNormalizedRow[] {
  return rows.filter((r) => {
    const raw = r.segmentNorm;
    if (isNonApartmentPropertyRow(r.segmentNorm, raw)) return false;
    return isApartmentPlanKpiDetailSegment(r.segmentNorm, raw);
  });
}

function sumPlanMonthRows(rows: readonly ApartmentPlanCsvNormalizedRow[]): number {
  return rows.reduce((s, r) => {
    const v = r.planMonth;
    return s + (Number.isFinite(v) && v > 0 ? v : 0);
  }, 0);
}

/** Сумма колонки «План накопит. итогом» по строкам сегментов (BI-отчёт). */
function sumPlanCumulativeRows(rows: readonly ApartmentPlanCsvNormalizedRow[]): number {
  return rows.reduce((s, r) => {
    const v = r.planCumulative;
    return s + (Number.isFinite(v) && v > 0 ? v : 0);
  }, 0);
}

const maxTotalVolume = (list: readonly ApartmentPlanCsvNormalizedRow[]) =>
  list.reduce((m, r) => Math.max(m, r.totalVolume), 0);

/** «План проекта» для KPI квартир: только свод «Квартиры», не max по сегментам (парковки/ИТОГО). */
function resolveApartmentsProjectPlanVolume(
  summary: BiApartmentsSummarySlice | null,
  apartmentRows: readonly ApartmentPlanCsvNormalizedRow[],
  preferRows: readonly ApartmentPlanCsvNormalizedRow[],
  biSummaryPlanProject?: number | null,
): number {
  const fromSummary = summary?.planProject ?? biSummaryPlanProject ?? 0;
  if (fromSummary > 0) return fromSummary;
  const pool = preferRows.length ? preferRows : apartmentRows;
  return maxTotalVolume(pool);
}

/** Свод «Квартиры» из BI meta или из импортированных строк. */
function resolveApartmentsSummarySlice(
  rows: readonly ApartmentPlanCsvNormalizedRow[],
  explicit?: BiApartmentsSummarySlice | null,
): BiApartmentsSummarySlice | null {
  if (explicit) return explicit;
  for (const r of rows) {
    const raw = r.segmentNorm;
    if (isBiApartmentsSummaryRow(r.segmentNorm, raw)) {
      return {
        planMonth: r.planMonth,
        planCumulative: r.planCumulative,
        planProject: r.totalVolume,
        rawLabel: raw,
      };
    }
  }
  return null;
}

function resolveCumulativePlan(
  summary: BiApartmentsSummarySlice | null,
  cumulativeMode: ReturnType<typeof getPlanCalculationStrategy>["cumulativeMode"],
  throughMonthRows: readonly ApartmentPlanCsvNormalizedRow[],
  monthRows: readonly ApartmentPlanCsvNormalizedRow[],
): number {
  if (summary) return summary.planCumulative;
  if (cumulativeMode === "bi_report_ready_column") {
    const snap = monthRows.length ? monthRows : throughMonthRows;
    return sumPlanCumulativeRows(snap);
  }
  return sumPlanMonthRows(throughMonthRows);
}

function selectedMonthLabel(period: "month" | "quarter", currentPeriodKey: string, endMonthKey: string): string {
  if (period === "quarter") {
    const qm = quarterKeyToMonthKeys(currentPeriodKey);
    if (qm?.length) {
      return qm.map((k) => formatMonthKeyShortRuYY(k)).join(" · ");
    }
  }
  return formatMonthKeyShortRuYY(endMonthKey);
}

export type ApartmentPlanKpiPlanDebugMeta = {
  kpiEntity: "Apartments";
  csvSummaryRow: string;
  selectedMonthLabel: string;
  planCumulativeSource: number;
  planMonthSource: "apartments_summary" | "detail_segments_sum";
};

/**
 * План KPI квартир: entity = apartments.
 * BI: накопительно из строки «Квартиры»; wide: сумма plan_month ≤ выбранный месяц.
 */
export function selectPlanSliceForKpi(
  rows: readonly ApartmentPlanCsvNormalizedRow[],
  opts: {
    period: "month" | "quarter";
    currentPeriodKey: string;
    objectId: string;
    objects: readonly { id: string; name: string }[];
    biApartmentsSummary?: BiApartmentsSummarySlice | null;
    biSummaryPlanProject?: number | null;
    csvType?: ApartmentPlanCsvParseDiagnostics["csvType"];
    entityType?: ApartmentPlanKpiEntityType;
  },
): (ApartmentPlanKpiPlanSlice & { planDebug: ApartmentPlanKpiPlanDebugMeta }) | null {
  if (!rows.length && !opts.biApartmentsSummary) return null;

  const entityType = opts.entityType ?? APARTMENT_KPI_ENTITY;
  if (entityType !== APARTMENT_KPI_ENTITY) return null;

  const filteredByObj = rows.filter((r) => segmentMatchesObject(r, opts.objectId, opts.objects));
  const apartmentRows = filterApartmentKpiEntityRows(filteredByObj);
  const summary = resolveApartmentsSummarySlice(filteredByObj, opts.biApartmentsSummary ?? null);

  if (!apartmentRows.length && !summary) return null;

  const csvTypeForStrategy =
    opts.csvType ?? (summary ? ("bi_report" as const) : undefined);
  const { cumulativeMode } = getPlanCalculationStrategy(csvTypeForStrategy);

  const qMonths = quarterKeyToMonthKeys(opts.currentPeriodKey);
  const endMonthKey =
    opts.period === "quarter" && qMonths?.length ? qMonths[qMonths.length - 1]! : opts.currentPeriodKey;

  const monthLabel = selectedMonthLabel(opts.period, opts.currentPeriodKey, endMonthKey);
  const csvSummaryRow = summary?.rawLabel?.trim() || "Квартиры";

  if (opts.period === "month") {
    const monthRows = apartmentRows.filter((r) => r.monthKey === opts.currentPeriodKey);
    const planMonthFromDetails = sumPlanMonthRows(monthRows);
    const planMonth = summary && summary.planMonth > 0 ? summary.planMonth : planMonthFromDetails;

    const throughMonth = apartmentRows.filter((r) => r.monthKey <= opts.currentPeriodKey);
    const planCumulative = resolveCumulativePlan(summary, cumulativeMode, throughMonth, monthRows);
    const planMonthSource: ApartmentPlanKpiPlanDebugMeta["planMonthSource"] = summary
      ? summary.planMonth > 0
        ? "apartments_summary"
        : "detail_segments_sum"
      : "detail_segments_sum";

    const totalVolume = resolveApartmentsProjectPlanVolume(
      summary,
      apartmentRows,
      monthRows.length ? monthRows : apartmentRows,
      opts.biSummaryPlanProject,
    );

    return {
      planMonth,
      planCumulative,
      totalVolume,
      cumulativeMode,
      planDebug: {
        kpiEntity: "Apartments",
        csvSummaryRow,
        selectedMonthLabel: monthLabel,
        planCumulativeSource: planCumulative,
        planMonthSource,
      },
    };
  }

  const inQuarter =
    qMonths != null
      ? apartmentRows.filter((r) => qMonths.includes(r.monthKey))
      : apartmentRows.filter((r) => r.monthKey === opts.currentPeriodKey);

  const planMonthFromDetails = sumPlanMonthRows(inQuarter);
  const planMonth = planMonthFromDetails;

  const throughMonth = apartmentRows.filter((r) => r.monthKey <= endMonthKey);
  const planCumulative = resolveCumulativePlan(summary, cumulativeMode, throughMonth, inQuarter);
  const planMonthSource: ApartmentPlanKpiPlanDebugMeta["planMonthSource"] = summary
    ? "apartments_summary"
    : "detail_segments_sum";

  const totalVolume = resolveApartmentsProjectPlanVolume(
    summary,
    apartmentRows,
    inQuarter.length ? inQuarter : apartmentRows,
    opts.biSummaryPlanProject,
  );

  return {
    planMonth,
    planCumulative,
    totalVolume,
    cumulativeMode,
    planDebug: {
      kpiEntity: "Apartments",
      csvSummaryRow,
      selectedMonthLabel: monthLabel,
      planCumulativeSource: planCumulative,
      planMonthSource,
    },
  };
}
