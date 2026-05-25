import {
  isApartmentRootSummaryRow,
  isCommercialRootSummaryRow,
  isParkingRootSummaryRow,
  isStorageRootSummaryRow,
} from "@/lib/planDataSource/entityRowMatchers";
import type { ReducedAreaEntitySummary, ReducedAreaNormalizedRow } from "@/lib/planDataSource/reducedArea/types";

export type ReducedAreaKpiPlanSlice = {
  planMonth: number;
  planCumulative: number;
  planProject: number;
  factMonth: number;
  factCumulative: number;
};

function summaryToSlice(summary: ReducedAreaEntitySummary): ReducedAreaKpiPlanSlice {
  return {
    planMonth: summary.planMonth,
    planCumulative: summary.planCumulative,
    planProject: summary.planProject,
    factMonth: summary.factMonth,
    factCumulative: summary.factCumulative,
  };
}

function rowToSlice(row: ReducedAreaNormalizedRow): ReducedAreaKpiPlanSlice {
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
  rows: readonly ReducedAreaNormalizedRow[],
  summary: ReducedAreaEntitySummary | null | undefined,
  isRoot: (segmentNorm: string, rawLabel: string) => boolean,
): ReducedAreaKpiPlanSlice | null {
  if (summary) return summaryToSlice(summary);
  const root = rows.find((r) => isRoot(r.segmentNorm, r.segmentNorm));
  if (!root) return null;
  return rowToSlice(root);
}

export function selectReducedAreaGrandTotalSliceForKpi(
  rows: readonly ReducedAreaNormalizedRow[],
): ReducedAreaKpiPlanSlice | null {
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

export function selectReducedAreaPlanSliceForKpi(
  rows: readonly ReducedAreaNormalizedRow[],
  apartmentsSummary?: ReducedAreaEntitySummary | null,
): ReducedAreaKpiPlanSlice | null {
  return pickEntityRoot(rows, apartmentsSummary, isApartmentRootSummaryRow);
}

export function selectReducedAreaParkingPlanSliceForKpi(
  rows: readonly ReducedAreaNormalizedRow[],
  parkingSummary?: ReducedAreaEntitySummary | null,
): ReducedAreaKpiPlanSlice | null {
  return pickEntityRoot(rows, parkingSummary, isParkingRootSummaryRow);
}

export function selectReducedAreaStoragePlanSliceForKpi(
  rows: readonly ReducedAreaNormalizedRow[],
  storageSummary?: ReducedAreaEntitySummary | null,
): ReducedAreaKpiPlanSlice | null {
  return pickEntityRoot(rows, storageSummary, isStorageRootSummaryRow);
}

export function selectReducedAreaCommercialPlanSliceForKpi(
  rows: readonly ReducedAreaNormalizedRow[],
): ReducedAreaKpiPlanSlice | null {
  return pickEntityRoot(rows, null, isCommercialRootSummaryRow);
}
