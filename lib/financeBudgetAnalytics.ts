import {
  FINANCE_OPERATING_PAYMENTS_BUDGET_CODE,
  FINANCE_OPERATING_RECEIPTS_BUDGET_CODE,
  findFinanceBudgetLineByCode,
  financeBudgetLinePlanTotalRub,
  type FinanceBudgetImportMeta,
  type FinanceBudgetLine,
  type FinanceBudgetSnapshot,
} from "@/lib/financeBudgetData";
import type { TmcMonthlyProcurementPoint } from "@/lib/tmcPresentationAnalytics";

export type FinanceBudgetAnalyticsInput = {
  lines: FinanceBudgetLine[];
  importMeta?: FinanceBudgetImportMeta;
};

export type FinanceBudgetKpi = {
  /** Общий бюджет проекта — строка «1.» (колонка «Версия на»). */
  projectBudgetRub: number;
  /** План поступлений — строка «2.» (колонка «Версия на»). */
  receiptsPlanRub: number;
  /** Факт поступлений — пока нет в данных. */
  receiptsFactRub: number | null;
  /** Выполнение бюджета, % — пока нет в данных. */
  budgetExecutionPct: number | null;
};

export type FinancePaymentChartPoint = {
  label: string;
  plan: number | null;
  fact: number | null;
};

export type FinancePaymentChartResult = {
  monthlySeries: TmcMonthlyProcurementPoint[];
  chartStartMonth: string | null;
  hasOperatingPaymentsLine: boolean;
  hasFactSeries: boolean;
  periodKeys: string[];
};

export const FINANCE_OPERATING_PAYMENTS_MISSING_MESSAGE =
  'В бюджете отсутствует статья с кодом 2. "Платежи по основным видам деятельности".';

function toAnalyticsInput(
  source: FinanceBudgetAnalyticsInput | FinanceBudgetSnapshot,
): FinanceBudgetAnalyticsInput {
  if ("lines" in source && Array.isArray(source.lines)) {
    return {
      lines: source.lines,
      importMeta: "importMeta" in source ? source.importMeta : undefined,
    };
  }
  return source;
}

function getOperatingPaymentsLine(lines: FinanceBudgetLine[]): FinanceBudgetLine | null {
  return findFinanceBudgetLineByCode(lines, FINANCE_OPERATING_PAYMENTS_BUDGET_CODE);
}

function getOperatingReceiptsLine(lines: FinanceBudgetLine[]): FinanceBudgetLine | null {
  return findFinanceBudgetLineByCode(lines, FINANCE_OPERATING_RECEIPTS_BUDGET_CODE);
}

function hasFinanceOperatingPaymentsFactSeries(lines: FinanceBudgetLine[]): boolean {
  const operatingLine = getOperatingPaymentsLine(lines);
  return Boolean(
    operatingLine?.monthlyFactRub && Object.keys(operatingLine.monthlyFactRub).length > 0,
  );
}

function monthStartFromIso(iso: string): Date {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, 1, 12, 0, 0);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1, 12, 0, 0);
}

function monthLabelRu(d: Date): string {
  return d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
}

function roundMln10(value: number): number {
  return Math.round(value * 10) / 10;
}

function rubToMln(rub: number): number {
  return roundMln10(rub / 1_000_000);
}

/** Все месяцы проекта для оси X (importMeta.periodKeys или monthlyPlanRub статьи «2.»). */
export function resolveFinanceBudgetPeriodKeys(
  lines: FinanceBudgetLine[],
  importMeta?: FinanceBudgetImportMeta,
): string[] {
  const fromMeta = importMeta?.periodKeys?.filter((key) => /^\d{4}-\d{2}$/.test(key)) ?? [];
  if (fromMeta.length > 0) return [...fromMeta].sort((a, b) => a.localeCompare(b));

  const operatingLine = getOperatingPaymentsLine(lines);
  if (!operatingLine) return [];

  return Object.keys(operatingLine.monthlyPlanRub).sort((a, b) => a.localeCompare(b));
}

/** Общий бюджет проекта — сумма строки «1.» (Версия на). */
export function getProjectBudget(
  source: FinanceBudgetAnalyticsInput | FinanceBudgetSnapshot,
): number {
  const { lines } = toAnalyticsInput(source);
  const receiptsLine = getOperatingReceiptsLine(lines);
  return receiptsLine ? financeBudgetLinePlanTotalRub(receiptsLine) : 0;
}

/** План поступлений — сумма строки «2.» (Версия на). */
export function getPaymentPlan(
  source: FinanceBudgetAnalyticsInput | FinanceBudgetSnapshot,
): number {
  const { lines } = toAnalyticsInput(source);
  const paymentsLine = getOperatingPaymentsLine(lines);
  return paymentsLine ? financeBudgetLinePlanTotalRub(paymentsLine) : 0;
}

/** KPI карточки «Бюджет проекта». */
export function getBudgetKpi(
  source: FinanceBudgetAnalyticsInput | FinanceBudgetSnapshot,
): FinanceBudgetKpi {
  const { lines } = toAnalyticsInput(source);
  const receiptsPlanRub = getPaymentPlan({ lines });

  return {
    projectBudgetRub: getProjectBudget({ lines }),
    receiptsPlanRub,
    receiptsFactRub: null,
    budgetExecutionPct: null,
  };
}

/**
 * Помесячный ряд плана бюджета (только родительская статья «2.») в млн ₽.
 * Без агрегации дочерних строк.
 */
function buildOperatingPaymentsMonthlySeries(
  lines: FinanceBudgetLine[],
  today: Date = new Date(),
  importMeta?: FinanceBudgetImportMeta,
): TmcMonthlyProcurementPoint[] {
  const operatingLine = getOperatingPaymentsLine(lines);
  if (!operatingLine) return [];

  const periodKeys = resolveFinanceBudgetPeriodKeys(lines, importMeta);
  if (periodKeys.length === 0) return [];

  const hasFactSeries = hasFinanceOperatingPaymentsFactSeries(lines);
  const todayMonth = today.toISOString().slice(0, 7);
  const start = monthStartFromIso(`${periodKeys[0]}-01`);
  const end = monthStartFromIso(`${periodKeys[periodKeys.length - 1]}-01`);
  const points: TmcMonthlyProcurementPoint[] = [];
  let planCumRub = 0;
  let factCumRub = 0;
  let cursor = start;

  while (cursor.getTime() <= end.getTime()) {
    const iso = cursor.toISOString().slice(0, 10);
    const mk = iso.slice(0, 7);
    const planRub = operatingLine.monthlyPlanRub[mk] ?? 0;
    const factRub = operatingLine.monthlyFactRub?.[mk] ?? 0;
    planCumRub += planRub;
    factCumRub += factRub;
    const factVisible = mk <= todayMonth;

    points.push({
      iso,
      label: monthLabelRu(cursor),
      planMln: rubToMln(planRub),
      factMln: factVisible && hasFactSeries ? rubToMln(factRub) : null,
      planCumMln: rubToMln(planCumRub),
      factCumMln: factVisible && hasFactSeries ? rubToMln(factCumRub) : null,
    });
    cursor = addMonths(cursor, 1);
  }

  return points;
}

/** Данные графика «Платежи по основным видам деятельности» (строка «2.»). */
export function getPaymentChart(
  source: FinanceBudgetAnalyticsInput | FinanceBudgetSnapshot,
  today: Date = new Date(),
): FinancePaymentChartResult {
  const { lines, importMeta } = toAnalyticsInput(source);
  const periodKeys = resolveFinanceBudgetPeriodKeys(lines, importMeta);
  const monthlySeries = buildOperatingPaymentsMonthlySeries(lines, today, importMeta);

  return {
    monthlySeries,
    chartStartMonth: periodKeys.length > 0 ? periodKeys[0]! : null,
    hasOperatingPaymentsLine: getOperatingPaymentsLine(lines) != null,
    hasFactSeries: hasFinanceOperatingPaymentsFactSeries(lines),
    periodKeys,
  };
}

export function hasFinanceOperatingPaymentsLine(lines: FinanceBudgetLine[]): boolean {
  return getOperatingPaymentsLine(lines) != null;
}
