import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import {
  APARTMENT_PLAN_TYPE_KPI_ORDER,
  matchApartmentPlanTypeKey,
  type ApartmentPlanTypeKey,
  type ApartmentPlanTypeKpiMeta,
} from "@/lib/apartmentPlanTypeKpi";
import { dduRevenueFactsFromDealsByTypeForKpi } from "@/lib/dduRevenueFactsFromDeals";
import type { DduRevenueKpiPlanSlice } from "@/lib/planDataSource/dduRevenue/dduRevenuePlanSlice";
import type { DduRevenueNormalizedRow } from "@/lib/planDataSource/dduRevenue/types";

export type DduRevenuePlanTypeKpiSlice = DduRevenueKpiPlanSlice & ApartmentPlanTypeKpiMeta;

export type DduRevenuePlanTypeKpiBreakdown = {
  hasCsvPlan: boolean;
  items: DduRevenuePlanTypeKpiSlice[];
};

function pickTypeRevenueRow(
  rows: readonly DduRevenueNormalizedRow[],
  typeKey: ApartmentPlanTypeKey,
): DduRevenueNormalizedRow | null {
  const typeRows = rows.filter(
    (r) => matchApartmentPlanTypeKey(r.segmentNorm, r.segmentNorm) === typeKey,
  );
  if (!typeRows.length) return null;
  return typeRows.reduce((best, r) => {
    const score = r.planProject * 1_000_000 + r.planCumulative * 1_000 + r.planMonth;
    const bestScore = best.planProject * 1_000_000 + best.planCumulative * 1_000 + best.planMonth;
    return score > bestScore ? r : best;
  });
}

function selectPlanSliceForDduRevenueTypeKpi(
  rows: readonly DduRevenueNormalizedRow[],
  typeKey: ApartmentPlanTypeKey,
): DduRevenueKpiPlanSlice | null {
  const row = pickTypeRevenueRow(rows, typeKey);
  if (!row) return null;
  if (row.planMonth <= 0 && row.planCumulative <= 0 && row.planProject <= 0) return null;
  return {
    planMonth: row.planMonth,
    planCumulative: row.planCumulative,
    planProject: row.planProject,
    factMonth: row.factMonth,
    factCumulative: row.factCumulative,
  };
}

export function buildDduRevenuePlanTypeKpiBreakdown(args: {
  rows: readonly DduRevenueNormalizedRow[] | null | undefined;
  hasCsvPlan: boolean;
  period: "month" | "quarter";
  currentPeriodKey: string;
  dealRows: readonly NormalizedDealRow[];
}): DduRevenuePlanTypeKpiBreakdown {
  const factsByType = dduRevenueFactsFromDealsByTypeForKpi(args.dealRows, {
    period: args.period,
    currentPeriodKey: args.currentPeriodKey,
  });

  const items: DduRevenuePlanTypeKpiSlice[] = APARTMENT_PLAN_TYPE_KPI_ORDER.map((meta) => {
    const facts = factsByType[meta.key];
    if (args.hasCsvPlan && Array.isArray(args.rows) && args.rows.length > 0) {
      const planSlice = selectPlanSliceForDduRevenueTypeKpi(args.rows, meta.key);
      if (planSlice) {
        return {
          ...meta,
          ...planSlice,
          factMonth: facts.factMonth > 0 ? facts.factMonth : planSlice.factMonth,
          factCumulative: facts.factCumulative > 0 ? facts.factCumulative : planSlice.factCumulative,
        };
      }
    }

    return {
      ...meta,
      planMonth: 0,
      planCumulative: 0,
      planProject: 0,
      factMonth: facts.factMonth,
      factCumulative: facts.factCumulative,
    };
  });

  return { hasCsvPlan: args.hasCsvPlan, items };
}

export function dduRevenuePlanTypeBreakdownHasData(
  breakdown: DduRevenuePlanTypeKpiBreakdown | null | undefined,
): boolean {
  if (!breakdown?.items.length) return false;
  return breakdown.items.some(
    (i) =>
      i.factCumulative > 0 ||
      i.factMonth > 0 ||
      (breakdown.hasCsvPlan && (i.planProject > 0 || i.planCumulative > 0 || i.planMonth > 0)),
  );
}
