export type FinanceExecutionChartSegment = {
  id: string;
  label: string;
  /** Короткая подпись для легенды под диаграммой. */
  legendLabel?: string;
  valueRub: number;
  /** План по строке объекта продажи (колонка «План» / «Устав»). */
  planRub: number | null;
  color: string;
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
  /** Сумма «Законтрактовано» по статьям верхнего уровня. */
  contractedTotalRub: number | null;
  /** «Общая стоимость проекта». */
  projectTotalCostRub: number | null;
};

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
