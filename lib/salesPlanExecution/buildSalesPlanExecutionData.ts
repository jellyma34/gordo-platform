import { periodKeyToRuChartLabel } from "@/lib/buildCashflowSeries";
import { filterByObject, mergeSalesPlanFact, marketingMockData } from "@/lib/marketingMockData";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { apartmentKpiExecutionPercent } from "@/lib/apartmentsPlanPeriodKpi";
import type { PlanVsFactMonthlyRubPoint } from "@/lib/planExecutionPlanVsFactChart";

export type SalesPlanExecutionChartMode = "monthly" | "cumulative";

export type SalesPlanExecutionMergedRow = {
  periodKey: string;
  label: string;
  planDeals: number;
  factDeals: number;
  planRub: number;
  factRub: number;
};

export type SalesPlanExecutionChartRow = {
  periodKey: string;
  label: string;
  plan: number | null;
  fact: number | null;
};

export type SalesPlanExecutionPeriodSummary = {
  planRub: number;
  factRub: number;
  deviationRub: number;
  percentComplete: number | null;
  periodLabel: string;
};

function finiteRub(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

/** Помесячные точки plan_fact.csv / receipts (приоритет над mock). */
export function buildSalesPlanExecutionMergedRowsFromPlanFact(
  points: readonly PlanVsFactMonthlyRubPoint[],
): SalesPlanExecutionMergedRow[] {
  return [...points]
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey))
    .map((row) => ({
      periodKey: row.periodKey,
      label: periodKeyToRuChartLabel(row.periodKey),
      planDeals: 0,
      factDeals: 0,
      planRub: finiteRub(row.planRub),
      factRub: finiteRub(row.factRub),
    }));
}

function avgRevenuePerDeal(factRub: number, factDeals: number): number {
  if (!Number.isFinite(factRub) || !Number.isFinite(factDeals) || factDeals <= 0) return 0;
  return factRub / factDeals;
}

export function buildSalesPlanExecutionMergedRows(
  period: MarketingPeriodGranularity,
  objectId: string,
): SalesPlanExecutionMergedRow[] {
  const planRows = period === "month" ? marketingMockData.salesPlan.month : marketingMockData.salesPlan.quarter;
  const factRows = period === "month" ? marketingMockData.salesFact.month : marketingMockData.salesFact.quarter;
  const revRows = period === "month" ? marketingMockData.salesRevenue.month : marketingMockData.salesRevenue.quarter;

  const planFiltered = filterByObject(planRows, objectId);
  const factFiltered = filterByObject(factRows, objectId);
  const revFiltered = filterByObject(revRows, objectId);
  const revByKey = new Map(revFiltered.map((r) => [r.periodKey, r.revenueRub]));

  const merged = mergeSalesPlanFact(planFiltered, factFiltered);
  const totalFactRub = merged.reduce((s, r) => s + (revByKey.get(r.periodKey) ?? 0), 0);
  const totalFactDeals = merged.reduce((s, r) => s + r.factDeals, 0);
  const avgCheck = avgRevenuePerDeal(totalFactRub, totalFactDeals);

  return merged.map((row) => {
    const factRub = revByKey.get(row.periodKey) ?? 0;
    const planRub = row.planDeals > 0 && avgCheck > 0 ? row.planDeals * avgCheck : 0;
    return {
      periodKey: row.periodKey,
      label: row.label || periodKeyToRuChartLabel(row.periodKey),
      planDeals: row.planDeals,
      factDeals: row.factDeals,
      planRub,
      factRub,
    };
  });
}

export function buildSalesPlanExecutionChartRows(
  rows: readonly SalesPlanExecutionMergedRow[],
  mode: SalesPlanExecutionChartMode,
): SalesPlanExecutionChartRow[] {
  if (mode === "monthly") {
    return rows.map((r) => ({
      periodKey: r.periodKey,
      label: r.label,
      plan: r.planRub > 0 ? r.planRub : null,
      fact: r.factRub > 0 ? r.factRub : null,
    }));
  }
  let planRun = 0;
  let factRun = 0;
  return rows.map((r) => {
    planRun += r.planRub;
    factRun += r.factRub;
    return {
      periodKey: r.periodKey,
      label: r.label,
      plan: planRun > 0 ? planRun : null,
      fact: factRun > 0 ? factRun : null,
    };
  });
}

export function resolveSalesPlanExecutionPeriodSummary(
  rows: readonly SalesPlanExecutionMergedRow[],
  currentPeriodKey: string,
): SalesPlanExecutionPeriodSummary {
  const row =
    rows.find((r) => r.periodKey === currentPeriodKey) ?? rows[rows.length - 1] ?? null;
  const planRub = row?.planRub ?? 0;
  const factRub = row?.factRub ?? 0;
  const deviationRub = factRub - planRub;
  const percentComplete = apartmentKpiExecutionPercent(factRub, planRub > 0 ? planRub : null);
  return {
    planRub,
    factRub,
    deviationRub,
    percentComplete,
    periodLabel: row?.label ?? periodKeyToRuChartLabel(currentPeriodKey),
  };
}

export function salesPlanExecutionHasData(rows: readonly SalesPlanExecutionMergedRow[]): boolean {
  return rows.some((r) => r.planRub > 0 || r.factRub > 0);
}

export function resolveSalesPlanExecutionMergedRows(
  period: MarketingPeriodGranularity,
  objectId: string,
  monthlyPlanVsFact?: readonly PlanVsFactMonthlyRubPoint[] | null,
): SalesPlanExecutionMergedRow[] {
  const fromCsv = monthlyPlanVsFact?.length
    ? buildSalesPlanExecutionMergedRowsFromPlanFact(monthlyPlanVsFact)
    : [];
  if (fromCsv.length > 0) return fromCsv;
  return buildSalesPlanExecutionMergedRows(period, objectId);
}
