import {
  isApartmentRootSummaryRow,
  isParkingRootSummaryRow,
  isStorageRootSummaryRow,
} from "@/lib/planDataSource/entityRowMatchers";
import { normalizeProjectValueRow, projectValueSummaryFromRow } from "@/lib/planDataSource/projectValue/rowHelpers";
import type { ProjectValueEntitySummary, ProjectValueNormalizedRow } from "@/lib/planDataSource/projectValue/types";
import type { ProjectValueCsvFormat } from "@/lib/planDataSource/projectValue/types";

export type ProjectValueKpiPlanSlice = {
  csvFormat: ProjectValueCsvFormat;
  charter: number;
  currentPlan: number;
  priceIncrease: number;
  reportMarkup: number;
  projectCost: number;
  planMonth: number;
  planCumulative: number;
  factMonth: number;
  factCumulative: number;
};

function summaryToSlice(summary: ProjectValueEntitySummary): ProjectValueKpiPlanSlice {
  return {
    csvFormat: summary.csvFormat,
    charter: summary.charter,
    currentPlan: summary.currentPlan,
    priceIncrease: summary.priceIncrease,
    reportMarkup: summary.reportMarkup,
    projectCost: summary.projectCost,
    planMonth: summary.planMonth,
    planCumulative: summary.planCumulative,
    factMonth: summary.factMonth,
    factCumulative: summary.factCumulative,
  };
}

function rowToSlice(row: ProjectValueNormalizedRow): ProjectValueKpiPlanSlice {
  const r = normalizeProjectValueRow(row);
  return {
    csvFormat: r.csvFormat,
    charter: r.charter,
    currentPlan: r.currentPlan,
    priceIncrease: r.priceIncrease,
    reportMarkup: r.reportMarkup,
    projectCost: r.projectCost,
    planMonth: r.planMonth,
    planCumulative: r.planCumulative,
    factMonth: r.factMonth,
    factCumulative: r.factCumulative,
  };
}

function pickEntityRoot(
  rows: readonly ProjectValueNormalizedRow[],
  summary: ProjectValueEntitySummary | null | undefined,
  isRoot: (segmentNorm: string, rawLabel: string) => boolean,
): ProjectValueKpiPlanSlice | null {
  if (summary) return summaryToSlice(summary);
  const root = rows.map(normalizeProjectValueRow).find((r) => isRoot(r.segmentNorm, r.segmentNorm));
  if (!root) return null;
  return rowToSlice(root);
}

export function selectProjectValuePlanSliceForKpi(
  rows: readonly ProjectValueNormalizedRow[],
  apartmentsSummary?: ProjectValueEntitySummary | null,
): ProjectValueKpiPlanSlice | null {
  return pickEntityRoot(rows, apartmentsSummary, isApartmentRootSummaryRow);
}

export function selectProjectValueParkingPlanSliceForKpi(
  rows: readonly ProjectValueNormalizedRow[],
  parkingSummary?: ProjectValueEntitySummary | null,
): ProjectValueKpiPlanSlice | null {
  return pickEntityRoot(rows, parkingSummary, isParkingRootSummaryRow);
}

export function selectProjectValueStoragePlanSliceForKpi(
  rows: readonly ProjectValueNormalizedRow[],
  storageSummary?: ProjectValueEntitySummary | null,
): ProjectValueKpiPlanSlice | null {
  return pickEntityRoot(rows, storageSummary, isStorageRootSummaryRow);
}

export { projectValueSummaryFromRow };
