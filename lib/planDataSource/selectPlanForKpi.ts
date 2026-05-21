import {
  APARTMENT_KPI_ENTITY,
  isApartmentPlanKpiDetailSegment,
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

const maxTotalVolume = (list: readonly ApartmentPlanCsvNormalizedRow[]) =>
  list.reduce((m, r) => Math.max(m, r.totalVolume), 0);

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
  const summary = opts.biApartmentsSummary ?? null;

  if (!apartmentRows.length && !summary) return null;

  const { cumulativeMode } = getPlanCalculationStrategy(opts.csvType);

  const qMonths = quarterKeyToMonthKeys(opts.currentPeriodKey);
  const endMonthKey =
    opts.period === "quarter" && qMonths?.length ? qMonths[qMonths.length - 1]! : opts.currentPeriodKey;

  const monthLabel = selectedMonthLabel(opts.period, opts.currentPeriodKey, endMonthKey);
  const csvSummaryRow = summary?.rawLabel?.trim() || "Квартиры";

  if (opts.period === "month") {
    const monthRows = apartmentRows.filter((r) => r.monthKey === opts.currentPeriodKey);
    const planMonthFromDetails = sumPlanMonthRows(monthRows);
    const planMonth = summary && summary.planMonth > 0 ? summary.planMonth : planMonthFromDetails;

    let planCumulative: number;
    let planMonthSource: ApartmentPlanKpiPlanDebugMeta["planMonthSource"];
    if (cumulativeMode === "bi_report_ready_column" && summary) {
      planCumulative = summary.planCumulative;
      planMonthSource = summary.planMonth > 0 ? "apartments_summary" : "detail_segments_sum";
    } else {
      const throughMonth = apartmentRows.filter((r) => r.monthKey <= opts.currentPeriodKey);
      planCumulative = sumPlanMonthRows(throughMonth);
      planMonthSource = "detail_segments_sum";
    }

    const totalVolume = Math.max(
      summary?.planProject ?? 0,
      maxTotalVolume(monthRows.length ? monthRows : apartmentRows),
      opts.biSummaryPlanProject ?? 0,
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

  let planCumulative: number;
  let planMonthSource: ApartmentPlanKpiPlanDebugMeta["planMonthSource"];
  if (cumulativeMode === "bi_report_ready_column" && summary) {
    planCumulative = summary.planCumulative;
    planMonthSource = "apartments_summary";
  } else {
    const throughMonth = apartmentRows.filter((r) => r.monthKey <= endMonthKey);
    planCumulative = sumPlanMonthRows(throughMonth);
    planMonthSource = "detail_segments_sum";
  }

  const totalVolume = Math.max(
    summary?.planProject ?? 0,
    maxTotalVolume(inQuarter.length ? inQuarter : apartmentRows),
    opts.biSummaryPlanProject ?? 0,
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
