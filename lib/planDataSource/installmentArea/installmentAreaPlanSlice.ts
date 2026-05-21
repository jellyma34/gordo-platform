import { isApartmentRootSummaryRow } from "@/lib/planDataSource/entityRowMatchers";
import type {
  InstallmentAreaApartmentsSummary,
  InstallmentAreaCsvNormalizedRow,
} from "@/lib/planDataSource/installmentArea/types";

export type InstallmentAreaKpiPlanSlice = {
  planMonthArea: number;
  planCumulativeArea: number;
  projectArea: number;
  factMonthArea: number;
  factCumulativeArea: number;
};

function pickApartmentsRoot(
  rows: readonly InstallmentAreaCsvNormalizedRow[],
  summary: InstallmentAreaApartmentsSummary | null | undefined,
): InstallmentAreaKpiPlanSlice | null {
  if (summary) {
    return {
      planMonthArea: summary.planMonthArea,
      planCumulativeArea: summary.planCumulativeArea,
      projectArea: summary.projectArea,
      factMonthArea: summary.factMonthArea,
      factCumulativeArea: summary.factCumulativeArea,
    };
  }
  const root = rows.find((r) => isApartmentRootSummaryRow(r.segmentNorm, r.segmentNorm));
  if (!root) return null;
  return {
    planMonthArea: root.planMonthArea,
    planCumulativeArea: root.planCumulativeArea,
    projectArea: root.projectArea,
    factMonthArea: root.factMonthArea,
    factCumulativeArea: root.factCumulativeArea,
  };
}

/** План/факт площади для KPI «Квартиры» (без фильтра по month — legacy CSV одна таблица на период). */
export function selectInstallmentAreaPlanSliceForKpi(
  rows: readonly InstallmentAreaCsvNormalizedRow[],
  apartmentsSummary?: InstallmentAreaApartmentsSummary | null,
): InstallmentAreaKpiPlanSlice | null {
  return pickApartmentsRoot(rows, apartmentsSummary);
}
