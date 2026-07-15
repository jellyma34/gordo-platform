import {
  cloneFinanceExecutionKpi,
  emptyFinanceExecutionKpi,
  financeExecutionKpiHasData,
  type FinanceExecutionExpenseChart,
  type FinanceExecutionImport,
  type FinanceExecutionKpi,
  type FinanceExecutionSalesChart,
} from "@/lib/financeBudgetExecutionData";
import type { KpiDonutSegment } from "@/components/tmc/KpiDonutChart";

export type FinanceExecutionAnalyticsInput = {
  snapshot: FinanceExecutionImport | null | undefined;
};

function readKpi(input: FinanceExecutionAnalyticsInput): FinanceExecutionKpi {
  return input.snapshot?.kpi ?? emptyFinanceExecutionKpi();
}

export function getRevenue(input: FinanceExecutionAnalyticsInput): number | null {
  return readKpi(input).revenue;
}

export function getTurnover(input: FinanceExecutionAnalyticsInput): number | null {
  return readKpi(input).turnover;
}

export function getExpenses(input: FinanceExecutionAnalyticsInput): number | null {
  return readKpi(input).expenses;
}

export function getExpenseBankPercent(input: FinanceExecutionAnalyticsInput): number | null {
  return readKpi(input).expenseBankPercent;
}

export function getEBIT(input: FinanceExecutionAnalyticsInput): number | null {
  return readKpi(input).ebit;
}

export function getEbitMargin(input: FinanceExecutionAnalyticsInput): number | null {
  return readKpi(input).ebitMargin;
}

export function getProfitBeforeTax(input: FinanceExecutionAnalyticsInput): number | null {
  return readKpi(input).profitBeforeTax;
}

export function getProfitMargin(input: FinanceExecutionAnalyticsInput): number | null {
  return readKpi(input).profitMargin;
}

export type FinanceExecutionKpiSnapshot = FinanceExecutionKpi & {
  reportingDate?: string;
  hasData: boolean;
};

export type FinanceExecutionPlanExecution = {
  factRub: number | null;
  planRub: number | null;
  completionPct: number | null;
};

export type FinanceExecutionBudgetUtilization = {
  contractedRub: number | null;
  projectTotalRub: number | null;
  utilizationPct: number | null;
};

export type FinanceExecutionPresentationSnapshot = FinanceExecutionKpiSnapshot & {
  salesChart: FinanceExecutionSalesChart | null;
  expenseChart: FinanceExecutionExpenseChart | null;
  salesDonutSegments: Array<KpiDonutSegment & { legendLabel?: string }>;
  expenseDonutSegments: Array<KpiDonutSegment & { legendLabel?: string }>;
  revenuePlanExecution: FinanceExecutionPlanExecution;
  expenseBudgetUtilization: FinanceExecutionBudgetUtilization;
};

function readSalesChart(input: FinanceExecutionAnalyticsInput): FinanceExecutionSalesChart | null {
  return input.snapshot?.salesChart ?? null;
}

function readExpenseChart(input: FinanceExecutionAnalyticsInput): FinanceExecutionExpenseChart | null {
  return input.snapshot?.expenseChart ?? null;
}

function toDonutSegments(
  chart: FinanceExecutionSalesChart | FinanceExecutionExpenseChart | null,
): Array<KpiDonutSegment & { legendLabel?: string }> {
  if (!chart?.segments?.length) return [];
  return chart.segments.map((segment) => ({
    label: segment.label,
    legendLabel: segment.legendLabel ?? segment.label,
    value: segment.valueRub,
    color: segment.color,
  }));
}

function completionPercent(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function getFinanceExecutionKpi(input: FinanceExecutionAnalyticsInput): FinanceExecutionKpiSnapshot {
  const kpi = readKpi(input);

  return {
    ...cloneFinanceExecutionKpi(kpi),
    reportingDate: input.snapshot?.reportingDate ?? input.snapshot?.importMeta?.reportingDate,
    hasData: financeExecutionKpiHasData(kpi),
  };
}

export function getFinanceExecutionPresentation(
  input: FinanceExecutionAnalyticsInput,
): FinanceExecutionPresentationSnapshot {
  const kpi = getFinanceExecutionKpi(input);
  const salesChart = readSalesChart(input);
  const expenseChart = readExpenseChart(input);
  const salesDonutSegments = toDonutSegments(salesChart);
  const expenseDonutSegments = toDonutSegments(expenseChart);

  return {
    ...kpi,
    salesChart,
    expenseChart,
    salesDonutSegments,
    expenseDonutSegments,
    revenuePlanExecution: {
      factRub: salesChart?.factTotalRub ?? null,
      planRub: kpi.revenue,
      completionPct: completionPercent(salesChart?.factTotalRub ?? null, kpi.revenue),
    },
    expenseBudgetUtilization: {
      contractedRub: expenseChart?.contractedTotalRub ?? null,
      projectTotalRub: expenseChart?.projectTotalCostRub ?? null,
      utilizationPct: completionPercent(
        expenseChart?.contractedTotalRub ?? null,
        expenseChart?.projectTotalCostRub ?? null,
      ),
    },
  };
}
