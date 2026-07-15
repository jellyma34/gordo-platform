import {
  importFinanceBudgetCsvFromRawRows,
  detectFinanceBudgetHeaderRowIndex,
  type FinanceBudgetCsvImportResult,
} from "@/lib/financeBudgetCsvImport";
import {
  importFinanceBudgetExecutionCsvFromRawRows,
  type FinanceBudgetExecutionCsvImportResult,
} from "@/lib/financeBudgetExecutionCsvImport";
import {
  detectFinanceBudgetExecutionMarkers,
  FINANCE_CSV_UNKNOWN_FORMAT_MESSAGE,
  readFinanceCsvRawRows,
} from "@/lib/financeCsvFormat";

export type FinanceCsvFormatType = "budget" | "budget_execution" | "unknown";

/**
 * Автоопределение формата финансового CSV.
 * Budget — строка с «Код» и «Статьи бюджета».
 * BudgetExecution — маркеры «Исполнение бюджета» / «Объекты продажи» без шапки бюджета.
 */
export function detectFinanceCsvFormat(rawRows: unknown[][]): FinanceCsvFormatType {
  if (detectFinanceBudgetHeaderRowIndex(rawRows) >= 0) {
    return "budget";
  }

  if (detectFinanceBudgetExecutionMarkers(rawRows)) {
    return "budget_execution";
  }

  return "unknown";
}

export type FinanceCsvImportResult =
  | ({ format: "budget" } & FinanceBudgetCsvImportResult)
  | ({ format: "budget_execution" } & FinanceBudgetExecutionCsvImportResult)
  | { format: "unknown"; error: string };

export async function importFinanceCsv(file: File): Promise<FinanceCsvImportResult> {
  const rawRows = await readFinanceCsvRawRows(file);
  const format = detectFinanceCsvFormat(rawRows);

  if (format === "budget") {
    const budgetResult = importFinanceBudgetCsvFromRawRows(rawRows, file.name);
    return { format: "budget", ...budgetResult };
  }

  if (format === "budget_execution") {
    const executionResult = importFinanceBudgetExecutionCsvFromRawRows(rawRows, file.name);
    return { format: "budget_execution", ...executionResult };
  }

  return { format: "unknown", error: FINANCE_CSV_UNKNOWN_FORMAT_MESSAGE };
}
