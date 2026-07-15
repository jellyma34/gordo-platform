import {
  cloneFinanceExecutionKpi,
  emptyFinanceExecutionKpi,
  type FinanceExecutionImport,
  type FinanceExecutionImportMeta,
  type FinanceExecutionKpi,
} from "@/lib/financeBudgetExecutionData";
import { readFinanceCsvRawRows } from "@/lib/financeCsvFormat";
import {
  logFinanceExecutionChartsSnapshot,
  parseFinanceExecutionExpenseChart,
  parseFinanceExecutionSalesChart,
} from "@/lib/financeExecutionCsvCharts";

export type FinanceBudgetExecutionCsvImportAudit = {
  foundMetrics: number;
  missingMetrics: string[];
  reportingDate?: string;
};

export type FinanceBudgetExecutionCsvImportResult = {
  snapshot: FinanceExecutionImport;
  audit: FinanceBudgetExecutionCsvImportAudit;
};

type MetricKey = keyof FinanceExecutionKpi;

type ValueKind = "money" | "percent";

type MetricDefinition = {
  key: MetricKey;
  logLabel: string;
  valueKind: ValueKind;
  matchesRow: (cells: string[], joined: string) => boolean;
};

const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    key: "revenue",
    logLabel: "Revenue",
    valueKind: "money",
    matchesRow: (_cells, joined) => joined.includes("итого") && joined.includes("доход"),
  },
  {
    key: "turnover",
    logLabel: "Turnover",
    valueKind: "money",
    matchesRow: (cells, joined) => {
      if (joined.includes("итого") && joined.includes("доход")) return false;
      return cells.some((cell) => normalizeCell(cell) === "выручка");
    },
  },
  {
    key: "expenseBankPercent",
    logLabel: "BankPercent",
    valueKind: "percent",
    matchesRow: (_cells, joined) =>
      joined.includes("%") &&
      joined.includes("затрат") &&
      (joined.includes("банк") || joined.includes("оплат")),
  },
  {
    key: "expenses",
    logLabel: "Expenses",
    valueKind: "money",
    matchesRow: (cells, joined) => {
      if (joined.includes("%")) return false;
      return cells.some((cell) => normalizeCell(cell) === "затраты");
    },
  },
  {
    key: "ebitMargin",
    logLabel: "EBITMargin",
    valueKind: "percent",
    matchesRow: (_cells, joined) => joined.includes("рентабельность") && joined.includes("ebit"),
  },
  {
    key: "profitMargin",
    logLabel: "ProfitMargin",
    valueKind: "percent",
    matchesRow: (_cells, joined) => joined.includes("рентабельность") && joined.includes("прибыл"),
  },
  {
    key: "ebit",
    logLabel: "EBIT",
    valueKind: "money",
    matchesRow: (_cells, joined) => joined.includes("ebit") && !joined.includes("рентабельность"),
  },
  {
    key: "profitBeforeTax",
    logLabel: "ProfitBeforeTax",
    valueKind: "money",
    matchesRow: (_cells, joined) =>
      joined.includes("прибыль") && joined.includes("но") && !joined.includes("рентабельность"),
  },
];

function normalizeCell(value: unknown): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function rowCells(rawRow: unknown): string[] {
  if (!Array.isArray(rawRow)) return [];
  return rawRow.map((cell) => String(cell ?? "").trim());
}

function isEmptyRow(cells: string[]): boolean {
  return !cells.some((cell) => cell.trim() !== "");
}

function rowText(cells: string[]): string {
  return cells
    .map((cell) => normalizeCell(cell))
    .filter(Boolean)
    .join(" ");
}

function parseNumericCell(value: string): number | null {
  const raw = value.trim();
  if (!raw || raw === "—" || raw === "-") return null;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/\u00a0/g, "")
    .replace(",", ".")
    .replace(/%/g, "");

  const cleaned = normalized.replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function findLabelCellIndex(
  cells: string[],
  matchesRow: MetricDefinition["matchesRow"],
): number {
  const joined = rowText(cells);
  if (!matchesRow(cells, joined)) return -1;

  for (let index = 0; index < cells.length; index += 1) {
    const cellNorm = normalizeCell(cells[index] ?? "");
    if (!cellNorm) continue;
    if (matchesRow([cells[index] ?? ""], cellNorm)) return index;
  }

  for (let index = 0; index < cells.length; index += 1) {
    const cellNorm = normalizeCell(cells[index] ?? "");
    if (!cellNorm) continue;
    if (matchesRow(cells, cellNorm)) return index;
  }

  return 0;
}

function pickBestMoneyValue(values: number[]): number | null {
  const nonZero = values.filter((value) => value !== 0);
  if (nonZero.length === 0) return null;

  return nonZero.reduce((best, value) =>
    Math.abs(value) > Math.abs(best) ? value : best,
  );
}

function extractMoneyValue(
  rawRows: unknown[][],
  rowIndex: number,
  cells: string[],
  labelCellIndex: number,
): number | null {
  const sameRowValues: number[] = [];
  for (let index = labelCellIndex + 1; index < cells.length; index += 1) {
    const value = parseNumericCell(cells[index] ?? "");
    if (value != null) sameRowValues.push(value);
  }

  const sameRowBest = pickBestMoneyValue(sameRowValues);
  if (sameRowBest != null) return sameRowBest;

  const nextCells = rowCells(rawRows[rowIndex + 1]);
  if (!isEmptyRow(nextCells)) {
    const nextRowValues = nextCells
      .map((cell) => parseNumericCell(cell))
      .filter((value): value is number => value != null);
    return pickBestMoneyValue(nextRowValues);
  }

  return null;
}

function extractPercentValue(
  rawRows: unknown[][],
  rowIndex: number,
  cells: string[],
  labelCellIndex: number,
): number | null {
  for (let index = labelCellIndex + 1; index < cells.length; index += 1) {
    const raw = cells[index] ?? "";
    if (!raw.includes("%")) continue;
    const value = parseNumericCell(raw);
    if (value != null) return value;
  }

  for (let index = 0; index < cells.length; index += 1) {
    if (index === labelCellIndex) continue;
    const raw = cells[index] ?? "";
    if (!raw.includes("%")) continue;
    const value = parseNumericCell(raw);
    if (value != null) return value;
  }

  const nextCells = rowCells(rawRows[rowIndex + 1]);
  if (!isEmptyRow(nextCells)) {
    for (const cell of nextCells) {
      if (!cell.includes("%")) continue;
      const value = parseNumericCell(cell);
      if (value != null) return value;
    }
  }

  return null;
}

function extractMetricValue(
  rawRows: unknown[][],
  rowIndex: number,
  definition: MetricDefinition,
): number | null {
  const cells = rowCells(rawRows[rowIndex]);
  if (isEmptyRow(cells)) return null;

  const joined = rowText(cells);
  if (!definition.matchesRow(cells, joined)) return null;

  const labelCellIndex = findLabelCellIndex(cells, definition.matchesRow);
  if (labelCellIndex < 0) return null;

  if (definition.valueKind === "percent") {
    return extractPercentValue(rawRows, rowIndex, cells, labelCellIndex);
  }

  return extractMoneyValue(rawRows, rowIndex, cells, labelCellIndex);
}

function findMetricValue(rawRows: unknown[][], definition: MetricDefinition): number | null {
  for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex += 1) {
    const value = extractMetricValue(rawRows, rowIndex, definition);
    if (value != null) return value;
  }

  return null;
}

function extractReportingDate(rawRows: unknown[][]): string | undefined {
  for (const rawRow of rawRows) {
    const cells = rowCells(rawRow);
    if (isEmptyRow(cells)) continue;

    const joined = rowText(cells);
    if (!joined.includes("отчетн") || !joined.includes("дат")) continue;

    for (let index = 1; index < cells.length; index += 1) {
      const value = cells[index]?.trim();
      if (value) return value;
    }
  }

  return undefined;
}

function extractTitle(rawRows: unknown[][]): string | undefined {
  for (const rawRow of rawRows) {
    const cells = rowCells(rawRow);
    if (isEmptyRow(cells)) continue;

    const joined = rowText(cells);
    if (joined.includes("исполнение бюджета")) {
      return cells.find((cell) => cell.trim())?.trim() ?? "Исполнение бюджета";
    }
  }

  return undefined;
}

function logFoundKpi(kpi: FinanceExecutionKpi): void {
  const entries: Array<[string, number | null]> = [
    ["Revenue", kpi.revenue],
    ["Turnover", kpi.turnover],
    ["Expenses", kpi.expenses],
    ["BankPercent", kpi.expenseBankPercent],
    ["EBIT", kpi.ebit],
    ["EBITMargin", kpi.ebitMargin],
    ["ProfitBeforeTax", kpi.profitBeforeTax],
    ["ProfitMargin", kpi.profitMargin],
  ];

  for (const [label, value] of entries) {
    if (value != null) {
      console.log(`${label}:`, value);
    }
  }
}

/** Разбор отчёта CSV «Исполнение бюджета» — поиск показателей через contains(). */
export function importFinanceBudgetExecutionCsvFromRawRows(
  rawRows: unknown[][],
  sourceFileName?: string,
): FinanceBudgetExecutionCsvImportResult {
  const kpi = emptyFinanceExecutionKpi();
  const missingMetrics: string[] = [];

  for (const definition of METRIC_DEFINITIONS) {
    const value = findMetricValue(rawRows, definition);
    kpi[definition.key] = value;
    if (value == null) {
      missingMetrics.push(definition.logLabel);
    }
  }

  const foundMetrics = METRIC_DEFINITIONS.length - missingMetrics.length;
  const reportingDate = extractReportingDate(rawRows);
  const title = extractTitle(rawRows);

  logFoundKpi(kpi);

  const importMeta: FinanceExecutionImportMeta = {
    sourceFileName,
    reportingDate,
    lastImportAt: new Date().toISOString(),
    foundMetrics,
    missingMetrics,
  };

  const salesChart = parseFinanceExecutionSalesChart(rawRows);
  const expenseChart = parseFinanceExecutionExpenseChart(rawRows);
  logFinanceExecutionChartsSnapshot(salesChart, expenseChart);

  const snapshot: FinanceExecutionImport = {
    title: title ?? "Исполнение бюджета",
    reportingDate,
    kpi: cloneFinanceExecutionKpi(kpi),
    salesChart,
    expenseChart,
    updatedAt: new Date().toISOString(),
    importMeta,
  };

  const audit: FinanceBudgetExecutionCsvImportAudit = {
    foundMetrics,
    missingMetrics,
    reportingDate,
  };

  return { snapshot, audit };
}

export async function importFinanceBudgetExecutionCsv(
  file: File,
): Promise<FinanceBudgetExecutionCsvImportResult> {
  const rawRows = await readFinanceCsvRawRows(file);
  return importFinanceBudgetExecutionCsvFromRawRows(rawRows, file.name);
}
