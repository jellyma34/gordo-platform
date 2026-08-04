export type FinanceExecutionChartSegment = {
  id: string;
  label: string;
  /** Короткая подпись для легенды под диаграммой. */
  legendLabel?: string;
  /** Факт / Законтрактовано, ₽. */
  valueRub: number;
  /** План по статье, ₽. */
  planRub: number | null;
  /** fact − plan; null если плана нет. */
  deviationRub?: number | null;
  /** ((fact − plan) / plan) * 100; null если плана нет. */
  deviationPct?: number | null;
  color: string;
};

/**
 * Статья бюджета (вид работ) — единый источник для диаграммы и перерасхода.
 * Импортируется из CSV «Исполнение бюджета» (План / Законтрактовано).
 */
export type FinanceExecutionExpenseArticle = {
  id: string;
  name: string;
  planRub: number;
  factRub: number;
  deviationRub: number;
  deviationPct: number;
  color: string;
  code?: string | null;
};

/** Структура фактических продаж — колонка «Факт на текущую дату». */
export type FinanceExecutionSalesChart = {
  segments: FinanceExecutionChartSegment[];
  /** Сумма колонки «Факт на текущую дату». */
  factTotalRub: number | null;
};

/** Структура расходов — «Наименование статей» / «Законтрактовано». */
export type FinanceExecutionExpenseChart = {
  /**
   * Сегменты для презентационной диаграммы:
   * только разделы верхнего уровня (2.01, 2.04, …) с суммой вложенных статей.
   */
  segments: FinanceExecutionChartSegment[];
  /**
   * Полный список статей из CSV (включая вложенные) —
   * для рабочего режима / детального просмотра.
   */
  detailSegments?: FinanceExecutionChartSegment[];
  /**
   * Виды работ с планом и фактом — канонический набор для перерасхода
   * (и источник сегментов диаграммы).
   */
  articles?: FinanceExecutionExpenseArticle[];
  /** Сумма «Законтрактовано» по статьям верхнего уровня. */
  contractedTotalRub: number | null;
  /** «Общая стоимость проекта». */
  projectTotalCostRub: number | null;
};

export function expenseDeviationRub(factRub: number, planRub: number | null): number | null {
  if (planRub == null || planRub <= 0) return null;
  return factRub - planRub;
}

export function expenseDeviationPct(factRub: number, planRub: number | null): number | null {
  if (planRub == null || planRub <= 0) return null;
  return Math.round(((factRub - planRub) / planRub) * 1000) / 10;
}

export function withExpenseSegmentDeviations(
  segment: FinanceExecutionChartSegment,
): FinanceExecutionChartSegment {
  const deviationRub = expenseDeviationRub(segment.valueRub, segment.planRub);
  const deviationPct = expenseDeviationPct(segment.valueRub, segment.planRub);
  return { ...segment, deviationRub, deviationPct };
}

/** KPI отчёта «Исполнение бюджета» — только извлечённые из CSV значения, без расчётов. */
export type FinanceExecutionKpi = {
  revenue: number | null;
  turnover: number | null;
  expenses: number | null;
  expenseBankPercent: number | null;
  ebit: number | null;
  ebitMargin: number | null;
  profitBeforeTax: number | null;
  profitMargin: number | null;
};

export type FinanceExecutionImportMeta = {
  sourceFileName?: string;
  reportingDate?: string;
  lastImportAt?: string;
  foundMetrics?: number;
  missingMetrics?: string[];
};

/** Импорт CSV «Исполнение бюджета» — только верхняя KPI-карточка. */
export type FinanceExecutionImport = {
  title?: string;
  reportingDate?: string;
  kpi: FinanceExecutionKpi;
  salesChart?: FinanceExecutionSalesChart | null;
  expenseChart?: FinanceExecutionExpenseChart | null;
  updatedAt?: string;
  importMeta?: FinanceExecutionImportMeta;
};

/** @deprecated Используйте {@link FinanceExecutionImport}. */
export type FinanceBudgetExecutionImportMeta = FinanceExecutionImportMeta;

/** @deprecated Используйте {@link FinanceExecutionImport}. */
export type FinanceBudgetExecutionSnapshot = FinanceExecutionImport;

export function emptyFinanceExecutionKpi(): FinanceExecutionKpi {
  return {
    revenue: null,
    turnover: null,
    expenses: null,
    expenseBankPercent: null,
    ebit: null,
    ebitMargin: null,
    profitBeforeTax: null,
    profitMargin: null,
  };
}

export function cloneFinanceExecutionKpi(kpi: FinanceExecutionKpi): FinanceExecutionKpi {
  return { ...kpi };
}

export function financeExecutionKpiHasData(kpi: FinanceExecutionKpi): boolean {
  return Object.values(kpi).some((value) => value != null);
}

export function emptyFinanceExecutionImport(): FinanceExecutionImport {
  return {
    kpi: emptyFinanceExecutionKpi(),
    updatedAt: undefined,
    importMeta: undefined,
  };
}
