import {
  cloneFinanceExecutionKpi,
  emptyFinanceExecutionKpi,
  financeExecutionKpiHasData,
  type FinanceExecutionExpenseArticle,
  type FinanceExecutionExpenseChart,
  type FinanceExecutionImport,
  type FinanceExecutionKpi,
  type FinanceExecutionSalesChart,
} from "@/lib/financeBudgetExecutionData";
import { filterExpenseSegmentsForPresentationChart } from "@/lib/financeExecutionCsvCharts";
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

/** Категория доходов для progress bar: только fact/plan собственной строки CSV. */
export type FinanceExecutionRevenueCategory = {
  id: string;
  label: string;
  legendLabel?: string;
  color: string;
  factRub: number;
  planRub: number | null;
  /** (factRub / planRub) * 100 — ширина полосы категории. */
  progressPct: number | null;
};

/** Статья расходов с превышением плана (законтрактовано > план). */
export type FinanceExecutionExpenseOverrun = {
  id: string;
  label: string;
  planRub: number;
  factRub: number;
  overrunRub: number;
  /** ((fact − plan) / plan) * 100 */
  overrunPct: number;
};

function resolveExpenseArticles(
  chart: FinanceExecutionExpenseChart,
): FinanceExecutionExpenseArticle[] {
  if (chart.articles && chart.articles.length > 0) {
    return chart.articles;
  }

  // Старые снимки: восстановить статьи из detail/segments с планом.
  const source =
    chart.detailSegments && chart.detailSegments.length > 0
      ? chart.detailSegments
      : chart.segments;

  return source
    .filter((segment) => segment.planRub != null && segment.planRub > 0)
    .map((segment) => {
      const planRub = segment.planRub as number;
      const factRub = segment.valueRub;
      return {
        id: segment.id,
        name: segment.legendLabel ?? segment.label,
        planRub,
        factRub,
        deviationRub: factRub - planRub,
        deviationPct: Math.round(((factRub - planRub) / planRub) * 1000) / 10,
        color: segment.color,
      };
    });
}

/**
 * Единая модель карточки «Расходы»:
 * статьи (name / plan / fact) из expenseChart.articles;
 * диаграмма — сегменты, собранные из того же импорта;
 * перерасход — только статьи с fact > plan (без агрегата «Общая стоимость»).
 */
function buildExpenseContractingAnalytics(
  chart: FinanceExecutionExpenseChart | null,
  contractedFromDonut: number | null,
): {
  utilization: FinanceExecutionBudgetUtilization;
  expenseOverruns: FinanceExecutionExpenseOverrun[];
} {
  if (!chart) {
    return {
      utilization: { contractedRub: null, projectTotalRub: null, utilizationPct: null },
      expenseOverruns: [],
    };
  }

  const articles = resolveExpenseArticles(chart);
  const contractedFromArticles = articles.reduce((sum, article) => sum + article.factRub, 0);
  const contractedRub =
    (contractedFromDonut != null && contractedFromDonut > 0
      ? contractedFromDonut
      : null) ??
    (contractedFromArticles > 0 ? contractedFromArticles : null) ??
    (chart.contractedTotalRub != null && chart.contractedTotalRub > 0
      ? chart.contractedTotalRub
      : null);

  const articlePlanSum = articles.reduce((sum, article) => sum + article.planRub, 0);
  const planTotalRub =
    chart.projectTotalCostRub != null && chart.projectTotalCostRub > 0
      ? chart.projectTotalCostRub
      : articlePlanSum > 0
        ? articlePlanSum
        : null;

  const expenseOverruns = articles
    .filter((article) => article.deviationRub > 0)
    .map((article) => ({
      id: article.id,
      label: article.name,
      planRub: article.planRub,
      factRub: article.factRub,
      overrunRub: article.deviationRub,
      overrunPct: article.deviationPct,
    }))
    .sort((left, right) => right.overrunRub - left.overrunRub);

  return {
    utilization: {
      contractedRub,
      projectTotalRub: planTotalRub,
      utilizationPct: completionPercent(contractedRub, planTotalRub),
    },
    expenseOverruns,
  };
}

const REVENUE_CATEGORY_ORDER = ["apartments", "parking", "storage", "admin"] as const;

function sortRevenueChartSegments<T extends { id: string }>(segments: T[]): T[] {
  return [...segments].sort((left, right) => {
    const leftIndex = REVENUE_CATEGORY_ORDER.indexOf(left.id as (typeof REVENUE_CATEGORY_ORDER)[number]);
    const rightIndex = REVENUE_CATEGORY_ORDER.indexOf(right.id as (typeof REVENUE_CATEGORY_ORDER)[number]);
    const leftOrder = leftIndex >= 0 ? leftIndex : REVENUE_CATEGORY_ORDER.length;
    const rightOrder = rightIndex >= 0 ? rightIndex : REVENUE_CATEGORY_ORDER.length;
    return leftOrder - rightOrder;
  });
}

function buildRevenueCategories(
  salesChart: FinanceExecutionSalesChart | null,
): FinanceExecutionRevenueCategory[] {
  if (!salesChart?.segments?.length) return [];

  return sortRevenueChartSegments(salesChart.segments)
    .filter((segment) => segment.valueRub > 0)
    .map((segment) => {
      const planRub = segment.planRub ?? null;
      const progressPct =
        planRub != null && planRub > 0
          ? Math.round((segment.valueRub / planRub) * 1000) / 10
          : null;

      return {
        id: segment.id,
        label: segment.label,
        legendLabel: segment.legendLabel,
        color: segment.color,
        factRub: segment.valueRub,
        planRub,
        progressPct,
      };
    });
}

export type FinanceExecutionPresentationSnapshot = FinanceExecutionKpiSnapshot & {
  salesChart: FinanceExecutionSalesChart | null;
  expenseChart: FinanceExecutionExpenseChart | null;
  salesDonutSegments: Array<KpiDonutSegment & { legendLabel?: string }>;
  expenseDonutSegments: Array<KpiDonutSegment & { legendLabel?: string }>;
  revenuePlanExecution: FinanceExecutionPlanExecution;
  revenueCategories: FinanceExecutionRevenueCategory[];
  expenseBudgetUtilization: FinanceExecutionBudgetUtilization;
  expenseOverruns: FinanceExecutionExpenseOverrun[];
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

function toExpenseDonutSegments(
  chart: FinanceExecutionExpenseChart | null,
): {
  donutSegments: Array<KpiDonutSegment & { legendLabel?: string }>;
  contractedTotalRub: number | null;
} {
  if (!chart) {
    console.warn("[expense-diag] toExpenseDonutSegments: expenseChart is null");
    return { donutSegments: [], contractedTotalRub: null };
  }

  console.log("[expense-diag] snapshot.expenseChart.segments:", chart.segments?.length ?? 0);
  console.log(
    "[expense-diag] snapshot.expenseChart.detailSegments:",
    chart.detailSegments?.length ?? 0,
  );
  console.table(
    (chart.segments ?? []).slice(0, 30).map((segment) => ({
      source: "segments",
      id: segment.id,
      label: segment.label,
      legendLabel: segment.legendLabel,
      value: segment.valueRub,
    })),
  );
  console.table(
    (chart.detailSegments ?? []).slice(0, 30).map((segment) => ({
      source: "detailSegments",
      id: segment.id,
      label: segment.label,
      legendLabel: segment.legendLabel,
      value: segment.valueRub,
    })),
  );

  const useDetail = Boolean(chart.detailSegments && chart.detailSegments.length > 0);
  const rawForFilter = useDetail ? chart.detailSegments! : (chart.segments ?? []);
  console.log(
    "[expense-diag] filtering source:",
    useDetail ? "detailSegments" : "segments",
    "count:",
    rawForFilter.length,
  );

  // Для старых снимков: перефильтровать segments/detailSegments до кодов 1-го уровня.
  const sourceSegments = filterExpenseSegmentsForPresentationChart(rawForFilter);

  console.log("[expense-diag] chartData after presentation filter:", sourceSegments.length);
  console.table(
    sourceSegments.map((segment) => ({
      code: String(segment.id ?? "").replace(/^budget-/, "") || null,
      name: segment.label,
      value: segment.valueRub,
    })),
  );
  if (sourceSegments.length === 0) {
    console.warn(
      "[expense-diag] chartData.length === 0 after filter — Donut получит пустой массив. " +
        "Исходный массив:",
      useDetail ? "detailSegments" : "segments",
    );
  }

  const codes = sourceSegments.map((segment) => {
    const fromId = String(segment.id ?? "").match(/^budget-(.+)$/);
    if (fromId) return fromId[1];
    return extractCodeHint(segment.label);
  });
  console.log("[finance-execution-analytics] expenseDonutSegments codes:", codes);

  const contractedTotalRub =
    sourceSegments.length > 0
      ? sourceSegments.reduce((sum, segment) => sum + segment.valueRub, 0)
      : chart.contractedTotalRub;

  const donutSegments = sourceSegments.map((segment) => ({
    label: segment.label,
    legendLabel: segment.legendLabel ?? segment.label,
    value: segment.valueRub,
    color: segment.color,
  }));

  console.log(
    "[expense-diag] props → FinanceExecutionDonutChart.segments length:",
    donutSegments.length,
  );

  return {
    donutSegments,
    contractedTotalRub: contractedTotalRub != null && contractedTotalRub > 0 ? contractedTotalRub : null,
  };
}

function extractCodeHint(label: string): string {
  const match = String(label ?? "").match(/^(\d+(?:\.\d+)*)/);
  return match?.[1] ?? label;
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
  const { donutSegments: expenseDonutSegments, contractedTotalRub: expenseContractedRub } =
    toExpenseDonutSegments(expenseChart);
  const revenueCategories = buildRevenueCategories(salesChart);
  const { utilization: expenseBudgetUtilization, expenseOverruns } =
    buildExpenseContractingAnalytics(expenseChart, expenseContractedRub);

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
    revenueCategories,
    expenseBudgetUtilization,
    expenseOverruns,
  };
}
