import {
  FINANCE_OPERATING_PAYMENTS_BUDGET_CODE,
  findFinanceBudgetLineByCode,
  financeBudgetLineFactTotalRub,
  financeBudgetLinePlanTotalRub,
  logFinanceBudgetImportCodeDiagnostics,
  type FinanceBudgetImportMeta,
  type FinanceBudgetLine,
} from "@/lib/financeBudgetData";
import type { TmcMonthlyProcurementPoint } from "@/lib/tmcPresentationAnalytics";

export type FinanceProjectBudgetKpi = {
  totalBudgetRub: number;
  operatingPaymentsPlanRub: number;
  operatingPaymentsFactRub: number | null;
  budgetExecutionPct: number | null;
};

export const FINANCE_OPERATING_PAYMENTS_MISSING_MESSAGE =
  'В бюджете отсутствует статья с кодом 2. "Платежи по основным видам деятельности".';

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

function getFinanceOperatingPaymentsLine(lines: FinanceBudgetLine[]): FinanceBudgetLine | null {
  return findFinanceBudgetLineByCode(lines, FINANCE_OPERATING_PAYMENTS_BUDGET_CODE);
}

export function hasFinanceOperatingPaymentsLine(lines: FinanceBudgetLine[]): boolean {
  return getFinanceOperatingPaymentsLine(lines) != null;
}

/** Есть ли фактические помесячные значения у родительской статьи «2.». */
export function hasFinanceOperatingPaymentsFactSeries(lines: FinanceBudgetLine[]): boolean {
  const operatingLine = getFinanceOperatingPaymentsLine(lines);
  return Boolean(
    operatingLine?.monthlyFactRub && Object.keys(operatingLine.monthlyFactRub).length > 0,
  );
}

/** Все месяцы проекта для оси X (importMeta.periodKeys или monthlyPlanRub статьи «2.»). */
export function resolveFinanceBudgetPeriodKeys(
  lines: FinanceBudgetLine[],
  importMeta?: FinanceBudgetImportMeta,
): string[] {
  const fromMeta = importMeta?.periodKeys?.filter((key) => /^\d{4}-\d{2}$/.test(key)) ?? [];
  if (fromMeta.length > 0) return [...fromMeta].sort((a, b) => a.localeCompare(b));

  const operatingLine = getFinanceOperatingPaymentsLine(lines);
  if (!operatingLine) return [];

  return Object.keys(operatingLine.monthlyPlanRub).sort((a, b) => a.localeCompare(b));
}

export function computeFinanceProjectBudgetKpi(lines: FinanceBudgetLine[]): FinanceProjectBudgetKpi {
  const totalBudgetRub = lines.reduce((sum, line) => sum + financeBudgetLinePlanTotalRub(line), 0);

  const operatingLine = getFinanceOperatingPaymentsLine(lines);
  const operatingPaymentsPlanRub = operatingLine
    ? financeBudgetLinePlanTotalRub(operatingLine)
    : 0;

  const operatingPaymentsFactRub =
    operatingLine && hasFinanceOperatingPaymentsFactSeries(lines)
      ? financeBudgetLineFactTotalRub(operatingLine)
      : null;

  const budgetExecutionPct =
    operatingPaymentsFactRub != null && operatingPaymentsPlanRub > 0
      ? Math.round((operatingPaymentsFactRub / operatingPaymentsPlanRub) * 1000) / 10
      : null;

  return {
    totalBudgetRub,
    operatingPaymentsPlanRub,
    operatingPaymentsFactRub,
    budgetExecutionPct,
  };
}

/**
 * Помесячный ряд плана бюджета (только родительская статья «2.») в млн ₽.
 */
export function buildFinanceOperatingPaymentsMonthlySeries(
  lines: FinanceBudgetLine[],
  today: Date = new Date(),
  importMeta?: FinanceBudgetImportMeta,
): TmcMonthlyProcurementPoint[] {
  const operatingLine = getFinanceOperatingPaymentsLine(lines);
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

/** Первый месяц шкалы графика по данным бюджета (статья «2.»). */
export function financeOperatingPaymentsChartStartMonth(
  lines: FinanceBudgetLine[],
  importMeta?: FinanceBudgetImportMeta,
): string | null {
  const periodKeys = resolveFinanceBudgetPeriodKeys(lines, importMeta);
  return periodKeys.length > 0 ? periodKeys[0]! : null;
}

export function logFinanceBudgetSourceDiagnostics(
  lines: FinanceBudgetLine[],
  source: "localStorage" | "api" | "empty",
  importMeta?: FinanceBudgetImportMeta,
): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;
  const planMonthColumnCount = importMeta?.periodKeys?.length;
  logFinanceBudgetImportCodeDiagnostics(lines, { planMonthColumnCount });
  console.log("[finance] Presentation source:", source, {
    lines: lines.length,
    operatingCode: getFinanceOperatingPaymentsLine(lines)?.code ?? null,
  });
}
