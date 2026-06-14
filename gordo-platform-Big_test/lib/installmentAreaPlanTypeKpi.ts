import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import {
  APARTMENT_PLAN_TYPE_KPI_ORDER,
  inferApartmentPlanTypeKeyFromDeal,
  matchApartmentPlanTypeKey,
  type ApartmentPlanTypeKey,
  type ApartmentPlanTypeKpiMeta,
} from "@/lib/apartmentPlanTypeKpi";
import type { InstallmentAreaKpiPlanSlice } from "@/lib/planDataSource/installmentArea/installmentAreaPlanSlice";
import type { InstallmentAreaCsvNormalizedRow } from "@/lib/planDataSource/installmentArea/types";
import { installmentAreaFactsFromDealsByTypeForKpi } from "@/lib/installmentAreaFactsFromDeals";

export type InstallmentAreaPlanTypeKpiSlice = InstallmentAreaKpiPlanSlice &
  ApartmentPlanTypeKpiMeta;

export type InstallmentAreaPlanTypeKpiBreakdown = {
  hasCsvPlan: boolean;
  items: InstallmentAreaPlanTypeKpiSlice[];
};

function pickTypeAreaRow(
  rows: readonly InstallmentAreaCsvNormalizedRow[],
  typeKey: ApartmentPlanTypeKey,
): InstallmentAreaCsvNormalizedRow | null {
  const typeRows = rows.filter(
    (r) => matchApartmentPlanTypeKey(r.segmentNorm, r.segmentNorm) === typeKey,
  );
  if (!typeRows.length) return null;
  return typeRows.reduce((best, r) => {
    const score = r.projectArea * 1_000_000 + r.planCumulativeArea * 1_000 + r.planMonthArea;
    const bestScore = best.projectArea * 1_000_000 + best.planCumulativeArea * 1_000 + best.planMonthArea;
    return score > bestScore ? r : best;
  });
}

function selectPlanSliceForInstallmentAreaTypeKpi(
  rows: readonly InstallmentAreaCsvNormalizedRow[],
  typeKey: ApartmentPlanTypeKey,
): InstallmentAreaKpiPlanSlice | null {
  const row = pickTypeAreaRow(rows, typeKey);
  if (!row) return null;
  if (row.planMonthArea <= 0 && row.planCumulativeArea <= 0 && row.projectArea <= 0) return null;
  return {
    planMonthArea: row.planMonthArea,
    planCumulativeArea: row.planCumulativeArea,
    projectArea: row.projectArea,
    factMonthArea: row.factMonthArea,
    factCumulativeArea: row.factCumulativeArea,
  };
}

export function buildInstallmentAreaPlanTypeKpiBreakdown(args: {
  rows: readonly InstallmentAreaCsvNormalizedRow[] | null | undefined;
  hasCsvPlan: boolean;
  period: "month" | "quarter";
  currentPeriodKey: string;
  dealRows: readonly NormalizedDealRow[];
}): InstallmentAreaPlanTypeKpiBreakdown {
  const factsByType = installmentAreaFactsFromDealsByTypeForKpi(args.dealRows, {
    period: args.period,
    currentPeriodKey: args.currentPeriodKey,
  });

  const items: InstallmentAreaPlanTypeKpiSlice[] = APARTMENT_PLAN_TYPE_KPI_ORDER.map((meta) => {
    const facts = factsByType[meta.key];
    if (args.hasCsvPlan && Array.isArray(args.rows) && args.rows.length > 0) {
      const planSlice = selectPlanSliceForInstallmentAreaTypeKpi(args.rows, meta.key);
      if (planSlice) {
        return {
          ...meta,
          ...planSlice,
          factMonthArea: facts.factMonthArea > 0 ? facts.factMonthArea : planSlice.factMonthArea,
          factCumulativeArea:
            facts.factCumulativeArea > 0 ? facts.factCumulativeArea : planSlice.factCumulativeArea,
        };
      }
    }

    return {
      ...meta,
      planMonthArea: 0,
      planCumulativeArea: 0,
      projectArea: 0,
      factMonthArea: facts.factMonthArea,
      factCumulativeArea: facts.factCumulativeArea,
    };
  });

  return { hasCsvPlan: args.hasCsvPlan, items };
}

export function installmentAreaPlanTypeBreakdownHasData(
  breakdown: InstallmentAreaPlanTypeKpiBreakdown | null | undefined,
): boolean {
  if (!breakdown?.items.length) return false;
  return breakdown.items.some(
    (i) =>
      i.factCumulativeArea > 0 ||
      i.factMonthArea > 0 ||
      (breakdown.hasCsvPlan && (i.projectArea > 0 || i.planCumulativeArea > 0 || i.planMonthArea > 0)),
  );
}
