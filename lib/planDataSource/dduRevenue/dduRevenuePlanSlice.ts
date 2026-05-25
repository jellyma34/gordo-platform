import {
  isApartmentRootSummaryRow,
  isCommercialRootSummaryRow,
  isParkingRootSummaryRow,
  isStorageRootSummaryRow,
} from "@/lib/planDataSource/entityRowMatchers";
import type { DduRevenueEntitySummary, DduRevenueNormalizedRow } from "@/lib/planDataSource/dduRevenue/types";

export type DduRevenueKpiPlanSlice = {
  planMonth: number;
  planCumulative: number;
  planProject: number;
  factMonth: number;
  factCumulative: number;
};

function summaryToSlice(summary: DduRevenueEntitySummary): DduRevenueKpiPlanSlice {
  return {
    planMonth: summary.planMonth,
    planCumulative: summary.planCumulative,
    planProject: summary.planProject,
    factMonth: summary.factMonth,
    factCumulative: summary.factCumulative,
  };
}

function pickEntityRoot(
  rows: readonly DduRevenueNormalizedRow[],
  summary: DduRevenueEntitySummary | null | undefined,
  isRoot: (segmentNorm: string, rawLabel: string) => boolean,
): DduRevenueKpiPlanSlice | null {
  if (summary) return summaryToSlice(summary);
  const root = rows.find((r) => isRoot(r.segmentNorm, r.segmentNorm));
  if (!root) return null;
  return {
    planMonth: root.planMonth,
    planCumulative: root.planCumulative,
    planProject: root.planProject,
    factMonth: root.factMonth,
    factCumulative: root.factCumulative,
  };
}

export function selectDduRevenuePlanSliceForKpi(
  rows: readonly DduRevenueNormalizedRow[],
  apartmentsSummary?: DduRevenueEntitySummary | null,
): DduRevenueKpiPlanSlice | null {
  return pickEntityRoot(rows, apartmentsSummary, isApartmentRootSummaryRow);
}

export function selectDduRevenueParkingPlanSliceForKpi(
  rows: readonly DduRevenueNormalizedRow[],
  parkingSummary?: DduRevenueEntitySummary | null,
): DduRevenueKpiPlanSlice | null {
  return pickEntityRoot(rows, parkingSummary, isParkingRootSummaryRow);
}

export function selectDduRevenueStoragePlanSliceForKpi(
  rows: readonly DduRevenueNormalizedRow[],
  storageSummary?: DduRevenueEntitySummary | null,
): DduRevenueKpiPlanSlice | null {
  return pickEntityRoot(rows, storageSummary, isStorageRootSummaryRow);
}

export function selectDduRevenueCommercialPlanSliceForKpi(
  rows: readonly DduRevenueNormalizedRow[],
): DduRevenueKpiPlanSlice | null {
  return pickEntityRoot(rows, null, isCommercialRootSummaryRow);
}
