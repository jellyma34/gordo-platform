import {
  APARTMENT_PLAN_TYPE_KPI_ORDER,
  matchApartmentPlanTypeKey,
  type ApartmentPlanTypeKey,
  type ApartmentPlanTypeKpiMeta,
} from "@/lib/apartmentPlanTypeKpi";
import type { AveragePriceKpiPlanSlice } from "@/lib/planDataSource/averagePricePerSqm/averagePricePlanSlice";
import type { AveragePricePerSqmNormalizedRow } from "@/lib/planDataSource/averagePricePerSqm/types";

export type AveragePricePlanTypeKpiSlice = AveragePriceKpiPlanSlice & ApartmentPlanTypeKpiMeta;

export type AveragePricePlanTypeKpiBreakdown = {
  hasCsvPlan: boolean;
  items: AveragePricePlanTypeKpiSlice[];
};

function pickTypeRow(
  rows: readonly AveragePricePerSqmNormalizedRow[],
  typeKey: ApartmentPlanTypeKey,
): AveragePricePerSqmNormalizedRow | null {
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

function selectPlanSliceForAveragePriceTypeKpi(
  rows: readonly AveragePricePerSqmNormalizedRow[],
  typeKey: ApartmentPlanTypeKey,
): AveragePriceKpiPlanSlice | null {
  const row = pickTypeRow(rows, typeKey);
  if (!row) return null;
  if (row.planMonth <= 0 && row.planCumulative <= 0 && row.planProject <= 0 && row.factMonth <= 0 && row.factCumulative <= 0) {
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

export function buildAveragePricePlanTypeKpiBreakdown(args: {
  rows: readonly AveragePricePerSqmNormalizedRow[] | null | undefined;
  hasCsvPlan: boolean;
}): AveragePricePlanTypeKpiBreakdown {
  const items: AveragePricePlanTypeKpiSlice[] = APARTMENT_PLAN_TYPE_KPI_ORDER.map((meta) => {
    if (args.hasCsvPlan && Array.isArray(args.rows) && args.rows.length > 0) {
      const planSlice = selectPlanSliceForAveragePriceTypeKpi(args.rows, meta.key);
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

export function averagePricePlanTypeBreakdownHasData(
  breakdown: AveragePricePlanTypeKpiBreakdown | null | undefined,
): boolean {
  if (!breakdown?.items.length) return false;
  return breakdown.items.some(
    (i) =>
      i.factCumulative > 0 ||
      i.factMonth > 0 ||
      (breakdown.hasCsvPlan && (i.planProject > 0 || i.planCumulative > 0 || i.planMonth > 0)),
  );
}
