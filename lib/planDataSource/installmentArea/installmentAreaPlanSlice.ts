import {
  isApartmentRootSummaryRow,
  isParkingRootSummaryRow,
  isStorageRootSummaryRow,
} from "@/lib/planDataSource/entityRowMatchers";
import type {
  InstallmentAreaApartmentsSummary,
  InstallmentAreaCsvNormalizedRow,
  InstallmentAreaEntitySummary,
} from "@/lib/planDataSource/installmentArea/types";

export type InstallmentAreaKpiPlanSlice = {
  planMonthArea: number;
  planCumulativeArea: number;
  projectArea: number;
  factMonthArea: number;
  factCumulativeArea: number;
};

function summaryToSlice(summary: InstallmentAreaEntitySummary): InstallmentAreaKpiPlanSlice {
  return {
    planMonthArea: summary.planMonthArea,
    planCumulativeArea: summary.planCumulativeArea,
    projectArea: summary.projectArea,
    factMonthArea: summary.factMonthArea,
    factCumulativeArea: summary.factCumulativeArea,
  };
}

function pickEntityRoot(
  rows: readonly InstallmentAreaCsvNormalizedRow[],
  summary: InstallmentAreaEntitySummary | null | undefined,
  isRoot: (segmentNorm: string, rawLabel: string) => boolean,
): InstallmentAreaKpiPlanSlice | null {
  if (summary) return summaryToSlice(summary);
  const root = rows.find((r) => isRoot(r.segmentNorm, r.segmentNorm));
  if (!root) return null;
  return {
    planMonthArea: root.planMonthArea,
    planCumulativeArea: root.planCumulativeArea,
    projectArea: root.projectArea,
    factMonthArea: root.factMonthArea,
    factCumulativeArea: root.factCumulativeArea,
  };
}

function pickApartmentsRoot(
  rows: readonly InstallmentAreaCsvNormalizedRow[],
  summary: InstallmentAreaApartmentsSummary | null | undefined,
): InstallmentAreaKpiPlanSlice | null {
  return pickEntityRoot(rows, summary, isApartmentRootSummaryRow);
}

/** План/факт площади для KPI «Квартиры» (без фильтра по month — legacy CSV одна таблица на период). */
export function selectInstallmentAreaPlanSliceForKpi(
  rows: readonly InstallmentAreaCsvNormalizedRow[],
  apartmentsSummary?: InstallmentAreaApartmentsSummary | null,
): InstallmentAreaKpiPlanSlice | null {
  return pickApartmentsRoot(rows, apartmentsSummary);
}

export function selectInstallmentAreaParkingPlanSliceForKpi(
  rows: readonly InstallmentAreaCsvNormalizedRow[],
  parkingSummary?: InstallmentAreaEntitySummary | null,
): InstallmentAreaKpiPlanSlice | null {
  return pickEntityRoot(rows, parkingSummary, isParkingRootSummaryRow);
}

export function selectInstallmentAreaStoragePlanSliceForKpi(
  rows: readonly InstallmentAreaCsvNormalizedRow[],
  storageSummary?: InstallmentAreaEntitySummary | null,
): InstallmentAreaKpiPlanSlice | null {
  return pickEntityRoot(rows, storageSummary, isStorageRootSummaryRow);
}
