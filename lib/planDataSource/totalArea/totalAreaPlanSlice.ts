import {
  isApartmentRootSummaryRow,
  isCommercialRootSummaryRow,
  isParkingRootSummaryRow,
  isStorageRootSummaryRow,
} from "@/lib/planDataSource/entityRowMatchers";
import type { TotalAreaEntitySummary, TotalAreaNormalizedRow } from "@/lib/planDataSource/totalArea/types";

export type TotalAreaKpiPlanSlice = {
  planMonth: number;
  planCumulative: number;
  planProject: number;
  factMonth: number;
  factCumulative: number;
};

function summaryToSlice(summary: TotalAreaEntitySummary): TotalAreaKpiPlanSlice {
  return {
    planMonth: summary.planMonth,
    planCumulative: summary.planCumulative,
    planProject: summary.planProject,
    factMonth: summary.factMonth,
    factCumulative: summary.factCumulative,
  };
}

function rowToSlice(row: TotalAreaNormalizedRow): TotalAreaKpiPlanSlice {
  return {
    planMonth: row.planMonth,
    planCumulative: row.planCumulative,
    planProject: row.planProject,
    factMonth: row.factMonth,
    factCumulative: row.factCumulative,
  };
}

function isGrandTotalRow(segmentNorm: string): boolean {
  const n = segmentNorm.toLowerCase();
  return n === "итого" || n === "всего";
}

function pickEntityRoot(
  rows: readonly TotalAreaNormalizedRow[],
  summary: TotalAreaEntitySummary | null | undefined,
  isRoot: (segmentNorm: string, rawLabel: string) => boolean,
): TotalAreaKpiPlanSlice | null {
  if (summary) return summaryToSlice(summary);
  const root = rows.find((r) => isRoot(r.segmentNorm, r.segmentNorm));
  if (!root) return null;
  return rowToSlice(root);
}

export function selectTotalAreaGrandTotalSliceForKpi(
  rows: readonly TotalAreaNormalizedRow[],
): TotalAreaKpiPlanSlice | null {
  const grand = rows.find((r) => isGrandTotalRow(r.segmentNorm));
  if (!grand) return null;
  if (
    grand.planMonth <= 0 &&
    grand.planCumulative <= 0 &&
    grand.planProject <= 0 &&
    grand.factMonth <= 0 &&
    grand.factCumulative <= 0
  ) {
    return null;
  }
  return rowToSlice(grand);
}

export function selectTotalAreaPlanSliceForKpi(
  rows: readonly TotalAreaNormalizedRow[],
  apartmentsSummary?: TotalAreaEntitySummary | null,
): TotalAreaKpiPlanSlice | null {
  return pickEntityRoot(rows, apartmentsSummary, isApartmentRootSummaryRow);
}

export function selectTotalAreaParkingPlanSliceForKpi(
  rows: readonly TotalAreaNormalizedRow[],
  parkingSummary?: TotalAreaEntitySummary | null,
): TotalAreaKpiPlanSlice | null {
  return pickEntityRoot(rows, parkingSummary, isParkingRootSummaryRow);
}

export function selectTotalAreaStoragePlanSliceForKpi(
  rows: readonly TotalAreaNormalizedRow[],
  storageSummary?: TotalAreaEntitySummary | null,
): TotalAreaKpiPlanSlice | null {
  return pickEntityRoot(rows, storageSummary, isStorageRootSummaryRow);
}

export function selectTotalAreaCommercialPlanSliceForKpi(
  rows: readonly TotalAreaNormalizedRow[],
): TotalAreaKpiPlanSlice | null {
  return pickEntityRoot(rows, null, isCommercialRootSummaryRow);
}
