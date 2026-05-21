import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import {
  APARTMENT_PLAN_TYPE_KPI_ORDER,
  matchApartmentPlanTypeKey,
  type ApartmentPlanTypeKey,
  type ApartmentPlanTypeKpiMeta,
} from "@/lib/apartmentPlanTypeKpi";
import { normalizeProjectValueRow } from "@/lib/planDataSource/projectValue/rowHelpers";
import type { ProjectValueKpiPlanSlice } from "@/lib/planDataSource/projectValue/projectValuePlanSlice";
import type { ProjectValueNormalizedRow } from "@/lib/planDataSource/projectValue/types";
import { projectValueFactsFromDealsByTypeForKpi } from "@/lib/projectValueFactsFromDeals";
import { projectValueSliceToCardsData } from "@/lib/projectValuePeriodKpi";
import type { EntityPlanPeriodKpiCardsData } from "@/components/marketing/entityPlanPeriodKpi/EntityPlanPeriodKpiCards";

export type ProjectValuePlanTypeKpiSlice = ProjectValueKpiPlanSlice & ApartmentPlanTypeKpiMeta;

export type ProjectValuePlanTypeKpiBreakdown = {
  hasCsvPlan: boolean;
  csvFormat?: "legacy" | "project_value";
  items: ProjectValuePlanTypeKpiSlice[];
};

function pickTypeValueRow(
  rows: readonly ProjectValueNormalizedRow[],
  typeKey: ApartmentPlanTypeKey,
): ProjectValueNormalizedRow | null {
  const typeRows = rows
    .map(normalizeProjectValueRow)
    .filter((r) => matchApartmentPlanTypeKey(r.segmentNorm, r.segmentNorm) === typeKey);
  if (!typeRows.length) return null;
  return typeRows.reduce((best, r) => {
    const score = r.charter * 1_000_000 + Math.abs(r.currentPlan) + Math.abs(r.priceIncrease);
    const bestScore = best.charter * 1_000_000 + Math.abs(best.currentPlan) + Math.abs(best.priceIncrease);
    return score > bestScore ? r : best;
  });
}

function selectPlanSliceForProjectValueTypeKpi(
  rows: readonly ProjectValueNormalizedRow[],
  typeKey: ApartmentPlanTypeKey,
): ProjectValueKpiPlanSlice | null {
  const row = pickTypeValueRow(rows, typeKey);
  if (!row) return null;
  if (
    row.csvFormat === "project_value" &&
    row.charter <= 0 &&
    row.currentPlan <= 0 &&
    row.priceIncrease === 0 &&
    row.reportMarkup <= 0
  ) {
    return null;
  }
  if (row.csvFormat === "legacy" && row.planMonth <= 0 && row.planCumulative <= 0 && row.projectCost <= 0) {
    return null;
  }
  return {
    csvFormat: row.csvFormat,
    charter: row.charter,
    currentPlan: row.currentPlan,
    priceIncrease: row.priceIncrease,
    reportMarkup: row.reportMarkup,
    projectCost: row.projectCost,
    planMonth: row.planMonth,
    planCumulative: row.planCumulative,
    factMonth: row.factMonth,
    factCumulative: row.factCumulative,
  };
}

export function buildProjectValuePlanTypeKpiBreakdown(args: {
  rows: readonly ProjectValueNormalizedRow[] | null | undefined;
  hasCsvPlan: boolean;
  period: "month" | "quarter";
  currentPeriodKey: string;
  dealRows: readonly NormalizedDealRow[];
}): ProjectValuePlanTypeKpiBreakdown {
  const factsByType = projectValueFactsFromDealsByTypeForKpi(args.dealRows, {
    period: args.period,
    currentPeriodKey: args.currentPeriodKey,
  });

  const csvFormat =
    args.hasCsvPlan && args.rows?.length
      ? normalizeProjectValueRow(args.rows[0]!).csvFormat
      : undefined;

  const items: ProjectValuePlanTypeKpiSlice[] = APARTMENT_PLAN_TYPE_KPI_ORDER.map((meta) => {
    const facts = factsByType[meta.key];
    if (args.hasCsvPlan && Array.isArray(args.rows) && args.rows.length > 0) {
      const planSlice = selectPlanSliceForProjectValueTypeKpi(args.rows, meta.key);
      if (planSlice) {
        return {
          ...meta,
          ...planSlice,
          factMonth: facts.factMonth > 0 ? facts.factMonth : planSlice.factMonth,
          factCumulative: facts.factCumulative > 0 ? facts.factCumulative : planSlice.factCumulative,
          currentPlan: facts.factMonth > 0 ? facts.factMonth : planSlice.currentPlan,
        };
      }
    }

    return {
      ...meta,
      csvFormat: csvFormat ?? "legacy",
      charter: 0,
      currentPlan: 0,
      priceIncrease: 0,
      reportMarkup: 0,
      planMonth: 0,
      planCumulative: 0,
      projectCost: 0,
      factMonth: facts.factMonth,
      factCumulative: facts.factCumulative,
    };
  });

  return { hasCsvPlan: args.hasCsvPlan, csvFormat, items };
}

export function projectValuePlanTypeBreakdownHasData(
  breakdown: ProjectValuePlanTypeKpiBreakdown | null | undefined,
): boolean {
  if (!breakdown?.items.length) return false;
  return breakdown.items.some((i) => {
    if (breakdown.csvFormat === "project_value") {
      return (
        i.charter > 0 ||
        i.currentPlan > 0 ||
        i.priceIncrease !== 0 ||
        i.reportMarkup > 0
      );
    }
    return (
      i.factCumulative > 0 ||
      i.factMonth > 0 ||
      (breakdown.hasCsvPlan && (i.projectCost > 0 || i.planCumulative > 0 || i.planMonth > 0))
    );
  });
}

export function projectValuePlanTypeSliceToCardsData(
  slice: ProjectValuePlanTypeKpiSlice,
  hasCsvPlan: boolean,
): EntityPlanPeriodKpiCardsData {
  return projectValueSliceToCardsData({
    hasCsvPlan,
    csvFormat: slice.csvFormat,
    ...slice,
  });
}
