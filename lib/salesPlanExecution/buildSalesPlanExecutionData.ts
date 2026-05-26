import { periodKeyToRuChartLabel } from "@/lib/buildCashflowSeries";
import { filterByObject, mergeSalesPlanFact, marketingMockData } from "@/lib/marketingMockData";
import type { MarketingPeriodGranularity } from "@/components/marketing/MarketingFilters";
import { apartmentKpiExecutionPercent } from "@/lib/apartmentsPlanPeriodKpi";
import { isStagnantDealMonthNoNewSales } from "@/lib/marketingDealMonthCumulative";
import type { PlanVsFactMonthlyRubPoint } from "@/lib/planExecutionPlanVsFactChart";

export type SalesPlanExecutionChartMode = "monthly" | "cumulative";

/**
 * Фиксированный отчётный горизонт графика «Исполнение плана продаж» (окт. 25 — апр. 26).
 * Ось X строится только из этого списка — без min/max дат и без месяцев из CSV платежей вне диапазона.
 */
export const SALES_PLAN_EXECUTION_REPORTING_PERIOD_KEYS = [
  "2025-10",
  "2025-11",
  "2025-12",
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
] as const;

const SALES_PLAN_EXECUTION_REPORTING_PERIOD_KEY_SET = new Set<string>(
  SALES_PLAN_EXECUTION_REPORTING_PERIOD_KEYS,
);

/** @deprecated Используйте {@link SALES_PLAN_EXECUTION_REPORTING_PERIOD_KEYS}. */
export const SALES_PLAN_EXECUTION_CHART_EXCLUDED_PERIOD_KEYS = new Set<string>(["2025-09"]);

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

/** Помесячное значение для графика: отсутствие данных = 0, без carry-forward. */
function monthlyChartRub(n: number | null | undefined): number {
  return finiteRub(n);
}

/** Значение для накопительного режима: до первого ненулевого месяца — null (не рисуем). */
function cumulativeChartRub(run: number): number | null {
  return run > 0 ? run : null;
}

/**
 * Помесячный факт для графика: месяц без новых продаж (сделки JSON) → 0, без carry-forward из CSV поступлений.
 */
export function applyStagnantDealMonthZeroPlanVsFact(
  points: readonly PlanVsFactMonthlyRubPoint[],
  dealRows: readonly { dealDateMs: number }[] | null | undefined,
): PlanVsFactMonthlyRubPoint[] {
  if (!dealRows?.length) return [...points];
  return points.map((p) => {
    if (!isStagnantDealMonthNoNewSales(dealRows, p.periodKey)) return p;
    return { ...p, factRub: 0 };
  });
}

/** Помесячные plan/fact (₽) на фиксированной отчётной шкале; месяцы вне диапазона игнорируются. */
export function alignPlanVsFactToReportingTimeline(
  source: readonly PlanVsFactMonthlyRubPoint[],
): PlanVsFactMonthlyRubPoint[] {
  const byPk = new Map<string, PlanVsFactMonthlyRubPoint>();
  for (const p of source) {
    const pk = p.periodKey.trim();
    if (!SALES_PLAN_EXECUTION_REPORTING_PERIOD_KEY_SET.has(pk)) {
      continue;
    }
    byPk.set(pk, p);
  }
  return SALES_PLAN_EXECUTION_REPORTING_PERIOD_KEYS.map((periodKey) => {
    const src = byPk.get(periodKey);
    const planRaw = src?.planRub;
    const factRaw = src?.factRub;
    return {
      periodKey,
      planRub:
        planRaw == null || !Number.isFinite(planRaw) ? 0 : Math.max(0, planRaw),
      factRub:
        factRaw == null || !Number.isFinite(factRaw) ? 0 : Math.max(0, factRaw),
    };
  });
}

/** Строки графика на фиксированной отчётной шкале (0 в месяце без продаж). */
export function alignMergedRowsToReportingTimeline(
  rows: readonly SalesPlanExecutionMergedRow[],
): SalesPlanExecutionMergedRow[] {
  const byPk = new Map(rows.map((r) => [r.periodKey.trim(), r]));
  return SALES_PLAN_EXECUTION_REPORTING_PERIOD_KEYS.map((periodKey) => {
    const src = byPk.get(periodKey);
    return {
      periodKey,
      label: periodKeyToRuChartLabel(periodKey),
      planDeals: src?.planDeals ?? 0,
      factDeals: src?.factDeals ?? 0,
      planRub: finiteRub(src?.planRub),
      factRub: finiteRub(src?.factRub),
    };
  });
}

/** Помесячные точки plan_fact.csv / receipts (приоритет над mock). */
export function buildSalesPlanExecutionMergedRowsFromPlanFact(
  points: readonly PlanVsFactMonthlyRubPoint[],
): SalesPlanExecutionMergedRow[] {
  return alignPlanVsFactToReportingTimeline(points).map((row) => ({
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

  const mapped = merged.map((row) => {
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
  return alignMergedRowsToReportingTimeline(mapped);
}

export function buildSalesPlanExecutionChartRows(
  rows: readonly SalesPlanExecutionMergedRow[],
  mode: SalesPlanExecutionChartMode,
  dealRows?: readonly { dealDateMs: number }[] | null,
): SalesPlanExecutionChartRow[] {
  const chartRows = alignMergedRowsToReportingTimeline(rows);
  if (mode === "monthly") {
    return chartRows.map((r) => {
      const factRub =
        dealRows?.length && isStagnantDealMonthNoNewSales(dealRows, r.periodKey) ? 0 : r.factRub;
      return {
        periodKey: r.periodKey,
        label: r.label,
        plan: monthlyChartRub(r.planRub),
        fact: monthlyChartRub(factRub),
      };
    });
  }
  let planRun = 0;
  let factRun = 0;
  return chartRows.map((r) => {
    planRun += r.planRub;
    factRun += r.factRub;
    return {
      periodKey: r.periodKey,
      label: r.label,
      plan: cumulativeChartRub(planRun),
      fact: cumulativeChartRub(factRun),
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
  dealRows?: readonly { dealDateMs: number }[] | null,
): SalesPlanExecutionMergedRow[] {
  const alignedPlanVsFact = monthlyPlanVsFact?.length
    ? applyStagnantDealMonthZeroPlanVsFact(
        alignPlanVsFactToReportingTimeline(monthlyPlanVsFact),
        dealRows,
      )
    : [];
  const fromCsv = alignedPlanVsFact.length
    ? buildSalesPlanExecutionMergedRowsFromPlanFact(alignedPlanVsFact)
    : [];
  if (fromCsv.length > 0) return fromCsv;
  return buildSalesPlanExecutionMergedRows(period, objectId);
}

