import {
  isApartmentRootSummaryRow,
  isCommercialRootSummaryRow,
  isParkingRootSummaryRow,
  isStorageRootSummaryRow,
} from "@/lib/planDataSource/entityRowMatchers";
import type {
  AveragePricePerSqmEntitySummary,
  AveragePricePerSqmNormalizedRow,
} from "@/lib/planDataSource/averagePricePerSqm/types";

export type AveragePriceKpiPlanSlice = {
  planMonth: number;
  planCumulative: number;
  planProject: number;
  factMonth: number;
  factCumulative: number;
};

function summaryToSlice(summary: AveragePricePerSqmEntitySummary): AveragePriceKpiPlanSlice {
  return {
    planMonth: summary.planMonth,
    planCumulative: summary.planCumulative,
    planProject: summary.planProject,
    factMonth: summary.factMonth,
    factCumulative: summary.factCumulative,
  };
}

function rowToSlice(row: AveragePricePerSqmNormalizedRow): AveragePriceKpiPlanSlice {
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
  rows: readonly AveragePricePerSqmNormalizedRow[],
  summary: AveragePricePerSqmEntitySummary | null | undefined,
  isRoot: (segmentNorm: string, rawLabel: string) => boolean,
): AveragePriceKpiPlanSlice | null {
  if (summary) return summaryToSlice(summary);
  const root = rows.find((r) => isRoot(r.segmentNorm, r.segmentNorm));
  if (!root) return null;
  return rowToSlice(root);
}

export function selectAveragePriceGrandTotalSliceForKpi(
  rows: readonly AveragePricePerSqmNormalizedRow[],
): AveragePriceKpiPlanSlice | null {
  const grand = rows.find((r) => isGrandTotalRow(r.segmentNorm));
  if (!grand) return null;
  if (grand.planMonth <= 0 && grand.planCumulative <= 0 && grand.planProject <= 0 && grand.factMonth <= 0 && grand.factCumulative <= 0) {
    return null;
  }
  return rowToSlice(grand);
}

export function selectAveragePricePlanSliceForKpi(
  rows: readonly AveragePricePerSqmNormalizedRow[],
  apartmentsSummary?: AveragePricePerSqmEntitySummary | null,
): AveragePriceKpiPlanSlice | null {
  return pickEntityRoot(rows, apartmentsSummary, isApartmentRootSummaryRow);
}

export function selectAveragePriceParkingPlanSliceForKpi(
  rows: readonly AveragePricePerSqmNormalizedRow[],
  parkingSummary?: AveragePricePerSqmEntitySummary | null,
): AveragePriceKpiPlanSlice | null {
  return pickEntityRoot(rows, parkingSummary, isParkingRootSummaryRow);
}

export function selectAveragePriceStoragePlanSliceForKpi(
  rows: readonly AveragePricePerSqmNormalizedRow[],
  storageSummary?: AveragePricePerSqmEntitySummary | null,
): AveragePriceKpiPlanSlice | null {
  return pickEntityRoot(rows, storageSummary, isStorageRootSummaryRow);
}

export function selectAveragePriceCommercialPlanSliceForKpi(
  rows: readonly AveragePricePerSqmNormalizedRow[],
): AveragePriceKpiPlanSlice | null {
  return pickEntityRoot(rows, null, isCommercialRootSummaryRow);
}
