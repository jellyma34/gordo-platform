import {
  APARTMENT_PLAN_TYPE_KPI_ORDER,
  matchApartmentPlanTypeKey,
  type ApartmentPlanTypeKey,
  type ApartmentPlanTypeKpiMeta,
} from "@/lib/apartmentPlanTypeKpi";
import type { TotalAreaKpiPlanSlice } from "@/lib/planDataSource/totalArea/totalAreaPlanSlice";
import type { TotalAreaNormalizedRow } from "@/lib/planDataSource/totalArea/types";

export type TotalAreaPlanTypeKpiSlice = TotalAreaKpiPlanSlice & ApartmentPlanTypeKpiMeta;

export type TotalAreaPlanTypeKpiBreakdown = {
  hasCsvPlan: boolean;
  items: TotalAreaPlanTypeKpiSlice[];
};

function pickTypeRow(
  rows: readonly TotalAreaNormalizedRow[],
  typeKey: ApartmentPlanTypeKey,
): TotalAreaNormalizedRow | null {
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

function selectPlanSliceForTotalAreaTypeKpi(
  rows: readonly TotalAreaNormalizedRow[],
  typeKey: ApartmentPlanTypeKey,
): TotalAreaKpiPlanSlice | null {
  const row = pickTypeRow(rows, typeKey);
  if (!row) return null;
  if (
    row.planMonth <= 0 &&
    row.planCumulative <= 0 &&
    row.planProject <= 0 &&
    row.factMonth <= 0 &&
    row.factCumulative <= 0
  ) {
    return null;
  }
  return {
    planMonth: row.planMonth,
    planCumulative: row.planCumulative,
    planProject: row.planProject,
    factMonth: row.factMonth,
    factCumulative: row.factCumulative,
  };
}

export function buildTotalAreaPlanTypeKpiBreakdown(args: {
  rows: readonly TotalAreaNormalizedRow[] | null | undefined;
  hasCsvPlan: boolean;
}): TotalAreaPlanTypeKpiBreakdown {
  const items: TotalAreaPlanTypeKpiSlice[] = APARTMENT_PLAN_TYPE_KPI_ORDER.map((meta) => {
    if (args.hasCsvPlan && Array.isArray(args.rows) && args.rows.length > 0) {
      const planSlice = selectPlanSliceForTotalAreaTypeKpi(args.rows, meta.key);
      if (planSlice) {
        return { ...meta, ...planSlice };
      }
    }
    return {
      ...meta,
      planMonth: 0,
      planCumulative: 0,
      planProject: 0,
      factMonth: 0,
      factCumulative: 0,
    };
  });

  return { hasCsvPlan: args.hasCsvPlan, items };
}

export function totalAreaPlanTypeBreakdownHasData(
  breakdown: TotalAreaPlanTypeKpiBreakdown | null | undefined,
): boolean {
  if (!breakdown?.items.length) return false;
  return breakdown.items.some(
    (i) =>
      i.factCumulative > 0 ||
      i.factMonth > 0 ||
      (breakdown.hasCsvPlan && (i.planProject > 0 || i.planCumulative > 0 || i.planMonth > 0)),
  );
}
