import {
  APARTMENT_KPI_ENTITY,
  isApartmentPlanKpiDetailSegment,
  isBiApartmentsSummaryRow,
  isNonApartmentPropertyRow,
  type ApartmentPlanKpiEntityType,
  type BiApartmentsSummarySlice,
} from "@/lib/planDataSource/apartmentPlanKpiEntity";
import {
  entityKpiCumulativePlanFromSummary,
  mergeEntitySummaryWithCsvRow,
} from "@/lib/planDataSource/entitySummaryPlanSlice";
import { getPlanCalculationStrategy } from "@/lib/planDataSource/apartmentPlanKpiStrategy";
import { isRuColumnarPlanCsvType } from "@/lib/planDataSource/apartmentPlanCsvPipeline";
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

function biSliceToEntitySummary(slice: BiApartmentsSummarySlice | null | undefined) {
  if (!slice) return null;
  return {
    planMonth: slice.planMonth,
    planCumulative: slice.planCumulative,
    planProject: slice.planProject,
    rawLabel: slice.rawLabel,
  };
}

/** «План проекта» для KPI квартир: только строка «Квартиры» (колонка «План проекта»). */
export function resolveApartmentsPlanProjectVolume(
  rows: readonly ApartmentPlanCsvNormalizedRow[],
  opts: {
    objectId: string;
    objects: readonly { id: string; name: string }[];
    biApartmentsSummary?: BiApartmentsSummarySlice | null;
    monthKey?: string;
  },
): number {
  const summary = mergeEntitySummaryWithCsvRow(
    rows,
    biSliceToEntitySummary(opts.biApartmentsSummary),
    isBiApartmentsSummaryRow,
    opts.monthKey,
  );
  if (summary && summary.planProject > 0) return summary.planProject;
  return 0;
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
 * Накопительно — только «Квартиры» / plan_cumulative сводной строки (не сумма комнатностей).
 */
export function selectPlanSliceForKpi(
  rows: readonly ApartmentPlanCsvNormalizedRow[],
  opts: {
    period: "month" | "quarter";
    currentPeriodKey: string;
    objectId: string;
    objects: readonly { id: string; name: string }[];
    biApartmentsSummary?: BiApartmentsSummarySlice | null;
    csvType?: ApartmentPlanCsvParseDiagnostics["csvType"];
    entityType?: ApartmentPlanKpiEntityType;
  },
): (ApartmentPlanKpiPlanSlice & { planDebug: ApartmentPlanKpiPlanDebugMeta }) | null {
  if (!rows.length && !opts.biApartmentsSummary) return null;

  const entityType = opts.entityType ?? APARTMENT_KPI_ENTITY;
  if (entityType !== APARTMENT_KPI_ENTITY) return null;

  const filteredByObj = rows.filter((r) => segmentMatchesObject(r, opts.objectId, opts.objects));
  const apartmentRows = filterApartmentKpiEntityRows(filteredByObj);

  const qMonths = quarterKeyToMonthKeys(opts.currentPeriodKey);
  const endMonthKey =
    opts.period === "quarter" && qMonths?.length ? qMonths[qMonths.length - 1]! : opts.currentPeriodKey;
  const summaryMonthKey = opts.period === "month" ? opts.currentPeriodKey : endMonthKey;

  const summary = mergeEntitySummaryWithCsvRow(
    rows,
    biSliceToEntitySummary(opts.biApartmentsSummary),
    isBiApartmentsSummaryRow,
    isRuColumnarPlanCsvType(opts.csvType) ? undefined : summaryMonthKey,
  );

  if (!apartmentRows.length && !summary) return null;

  const csvTypeForStrategy =
    opts.csvType ?? (summary ? ("bi_report" as const) : undefined);
  const { cumulativeMode } = getPlanCalculationStrategy(csvTypeForStrategy);
  const isColumnarCsv = isRuColumnarPlanCsvType(opts.csvType);

  const monthLabel = selectedMonthLabel(opts.period, opts.currentPeriodKey, endMonthKey);
  const csvSummaryRow = summary?.rawLabel?.trim() || "Квартиры";

  if (opts.period === "month") {
    const monthRows = isColumnarCsv
      ? apartmentRows
      : apartmentRows.filter((r) => r.monthKey === opts.currentPeriodKey);
    const planMonthFromDetails = sumPlanMonthRows(monthRows);
    const planMonth =
      summary && summary.planMonth > 0 ? summary.planMonth : planMonthFromDetails;

    const throughMonth = isColumnarCsv
      ? apartmentRows
      : apartmentRows.filter((r) => r.monthKey <= opts.currentPeriodKey);
    const planCumulative = entityKpiCumulativePlanFromSummary(summary, cumulativeMode, throughMonth);
    const planMonthSource: ApartmentPlanKpiPlanDebugMeta["planMonthSource"] = summary
      ? summary.planMonth > 0
        ? "apartments_summary"
        : "detail_segments_sum"
      : "detail_segments_sum";

    const totalVolume = resolveApartmentsPlanProjectVolume(rows, {
      objectId: opts.objectId,
      objects: opts.objects,
      biApartmentsSummary: opts.biApartmentsSummary,
      monthKey: isColumnarCsv ? undefined : summaryMonthKey,
    });

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

  const inQuarter = isColumnarCsv
    ? apartmentRows
    : qMonths != null
      ? apartmentRows.filter((r) => qMonths.includes(r.monthKey))
      : apartmentRows.filter((r) => r.monthKey === opts.currentPeriodKey);

  const planMonthFromDetails = sumPlanMonthRows(inQuarter);
  const planMonth =
    summary && summary.planMonth > 0 ? summary.planMonth : planMonthFromDetails;

  const throughMonth = isColumnarCsv
    ? apartmentRows
    : apartmentRows.filter((r) => r.monthKey <= endMonthKey);
  const planCumulative = entityKpiCumulativePlanFromSummary(summary, cumulativeMode, throughMonth);
  const planMonthSource: ApartmentPlanKpiPlanDebugMeta["planMonthSource"] = summary
    ? summary.planMonth > 0
      ? "apartments_summary"
      : "detail_segments_sum"
    : "detail_segments_sum";

  const totalVolume = resolveApartmentsPlanProjectVolume(rows, {
    objectId: opts.objectId,
    objects: opts.objects,
    biApartmentsSummary: opts.biApartmentsSummary,
    monthKey: isColumnarCsv ? undefined : summaryMonthKey,
  });

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
