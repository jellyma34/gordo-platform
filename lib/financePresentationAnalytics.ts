/**
 * @deprecated Используйте {@link ./financeBudgetAnalytics}.
 * Тонкая обёртка для обратной совместимости.
 */
export {
  FINANCE_OPERATING_PAYMENTS_MISSING_MESSAGE,
  getBudgetKpi as computeFinanceProjectBudgetKpi,
  getPaymentChart,
  hasFinanceOperatingPaymentsLine,
  resolveFinanceBudgetPeriodKeys,
  type FinanceBudgetKpi as FinanceProjectBudgetKpi,
  type FinancePaymentChartResult,
} from "@/lib/financeBudgetAnalytics";

import type { FinanceBudgetImportMeta, FinanceBudgetLine } from "@/lib/financeBudgetData";
import {
  getPaymentChart,
  type FinancePaymentChartResult,
} from "@/lib/financeBudgetAnalytics";
import type { TmcMonthlyProcurementPoint } from "@/lib/tmcPresentationAnalytics";

/** @deprecated Используйте getPaymentChart().monthlySeries */
export function buildFinanceOperatingPaymentsMonthlySeries(
  lines: FinanceBudgetLine[],
  today: Date = new Date(),
  importMeta?: FinanceBudgetImportMeta,
): TmcMonthlyProcurementPoint[] {
  return getPaymentChart({ lines, importMeta }, today).monthlySeries;
}

/** @deprecated Используйте getPaymentChart().chartStartMonth */
export function financeOperatingPaymentsChartStartMonth(
  lines: FinanceBudgetLine[],
  importMeta?: FinanceBudgetImportMeta,
): string | null {
  return getPaymentChart({ lines, importMeta }).chartStartMonth;
}

/** @deprecated Используйте getPaymentChart().hasFactSeries */
export function hasFinanceOperatingPaymentsFactSeries(lines: FinanceBudgetLine[]): boolean {
  return getPaymentChart({ lines }).hasFactSeries;
}

export function logFinanceBudgetSourceDiagnostics(
  lines: FinanceBudgetLine[],
  source: "localStorage" | "api" | "empty",
  importMeta?: FinanceBudgetImportMeta,
): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;
  const chart = getPaymentChart({ lines, importMeta });
  console.log("[finance] Presentation source:", source, {
    lines: lines.length,
    operatingCode: chart.hasOperatingPaymentsLine ? "2." : null,
    budgetVersion: importMeta?.budgetVersion ?? null,
  });
}

export type { FinancePaymentChartResult };
