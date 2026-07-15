import type {
  FinanceExecutionChartSegment,
  FinanceExecutionExpenseChart,
  FinanceExecutionSalesChart,
} from "@/lib/financeBudgetExecutionData";

const LOG_PREFIX = "[finance-execution-charts]";

const SALES_SEGMENT_DEFS: Array<{
  id: string;
  label: string;
  patterns: string[];
  color: string;
}> = [
  { id: "apartments", label: "Квартиры", patterns: ["квартир"], color: "#22c55e" },
  { id: "parking", label: "Парковки", patterns: ["парков"], color: "#3b82f6" },
  { id: "storage", label: "Кладовые", patterns: ["кладов"], color: "#f59e0b" },
  {
    id: "admin",
    label: "Административные помещения",
    patterns: ["администр"],
    color: "#a855f7",
  },
];

const EXPENSE_SEGMENT_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
  "#14b8a6",
] as const;

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

function cellIncludesAll(cellNorm: string, parts: string[]): boolean {
  return parts.every((part) => cellNorm.includes(part));
}

function findColumnIndex(cells: string[], matcher: (cellNorm: string) => boolean): number {
  for (let index = 0; index < cells.length; index += 1) {
    const cellNorm = normalizeCell(cells[index] ?? "");
    if (!cellNorm) continue;
    if (matcher(cellNorm)) return index;
  }
  return -1;
}

function rowJoined(cells: string[]): string {
  return cells.map((cell) => normalizeCell(cell)).filter(Boolean).join(" ");
}

function matchSalesSegment(rowText: string): (typeof SALES_SEGMENT_DEFS)[number] | null {
  for (const definition of SALES_SEGMENT_DEFS) {
    if (definition.patterns.some((pattern) => rowText.includes(pattern))) {
      return definition;
    }
  }
  return null;
}

function findFactColumnIndex(cells: string[]): number {
  const exactIndex = findColumnIndex(
    cells,
    (cellNorm) => cellIncludesAll(cellNorm, ["факт"]) && cellIncludesAll(cellNorm, ["текущ"]),
  );
  if (exactIndex >= 0) return exactIndex;

  return findColumnIndex(
    cells,
    (cellNorm) => cellNorm.includes("факт") && !cellNorm.includes("план"),
  );
}

function findSalesTableStart(rawRows: unknown[][]): {
  factColumnIndex: number;
  tableStartRow: number;
} | null {
  for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex += 1) {
    const cells = rowCells(rawRows[rowIndex]);
    if (isEmptyRow(cells)) continue;

    const factIndex = findFactColumnIndex(cells);
    if (factIndex < 0) continue;

    return {
      factColumnIndex: factIndex,
      tableStartRow: rowIndex + 1,
    };
  }

  for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex += 1) {
    const cells = rowCells(rawRows[rowIndex]);
    if (isEmptyRow(cells)) continue;

    const joined = rowJoined(cells);
    if (!joined.includes("объект") || !joined.includes("продаж")) continue;

    for (
      let headerRowIndex = rowIndex + 1;
      headerRowIndex < Math.min(rowIndex + 8, rawRows.length);
      headerRowIndex += 1
    ) {
      const headerCells = rowCells(rawRows[headerRowIndex]);
      if (isEmptyRow(headerCells)) continue;

      const factIndex = findFactColumnIndex(headerCells);
      if (factIndex < 0) continue;

      return {
        factColumnIndex: factIndex,
        tableStartRow: headerRowIndex + 1,
      };
    }
  }

  return null;
}

function normalizeTopLevelExpenseCode(value: string): string | null {
  const raw = value.trim().replace(/\s/g, "").replace(/,/g, ".");
  if (!raw) return null;

  const withoutTrailingDots = raw.replace(/\.+$/, "");
  const parts = withoutTrailingDots.split(".").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "2") return null;
  if (!/^\d+$/.test(parts[1] ?? "")) return null;

  const segment = parts[1] ?? "";
  return segment.length === 1 ? `2.0${segment}` : `2.${segment}`;
}

function extractCodeFromRow(cells: string[]): { code: string; codeCellIndex: number } | null {
  for (let index = 0; index < cells.length; index += 1) {
    const raw = cells[index]?.trim() ?? "";
    if (!raw) continue;
    const code = normalizeTopLevelExpenseCode(raw);
    if (code) return { code, codeCellIndex: index };
  }
  return null;
}

function sumSegmentValues(segments: FinanceExecutionChartSegment[]): number | null {
  if (segments.length === 0) return null;
  const total = segments.reduce((sum, segment) => sum + segment.valueRub, 0);
  return total > 0 ? total : null;
}

function logSalesRows(rows: Array<{ label: string; valueRub: number }>): void {
  console.log(`${LOG_PREFIX} найденные строки продаж:`, rows);
}

function logExpenseRows(rows: Array<{ code: string; label: string; valueRub: number }>): void {
  console.log(`${LOG_PREFIX} найденные строки расходов:`, rows);
}

export function logFinanceExecutionChartsSnapshot(
  salesChart: FinanceExecutionSalesChart | null,
  expenseChart: FinanceExecutionExpenseChart | null,
): void {
  console.log(`${LOG_PREFIX} salesChart:`, salesChart);
  console.log(`${LOG_PREFIX} expenseChart:`, expenseChart);
}

/** Структура фактических продаж по колонке «Факт на текущую дату». */
export function parseFinanceExecutionSalesChart(rawRows: unknown[][]): FinanceExecutionSalesChart | null {
  const table = findSalesTableStart(rawRows);
  if (!table) {
    console.log(`${LOG_PREFIX} таблица продаж не найдена`);
    return null;
  }

  const { factColumnIndex, tableStartRow } = table;
  const segmentsById = new Map<string, FinanceExecutionChartSegment>();
  const matchedRows: Array<{ label: string; valueRub: number }> = [];

  for (let rowIndex = tableStartRow; rowIndex < rawRows.length; rowIndex += 1) {
    const cells = rowCells(rawRows[rowIndex]);
    if (isEmptyRow(cells)) continue;

    const joined = rowJoined(cells);
    if (
      joined.includes("наименование") &&
      joined.includes("статей") &&
      joined.includes("законтрактовано")
    ) {
      break;
    }

    const segmentDef = matchSalesSegment(joined);
    if (!segmentDef) continue;

    let valueRub = parseNumericCell(cells[factColumnIndex] ?? "");
    if (valueRub == null || valueRub === 0) {
      for (let index = factColumnIndex + 1; index < cells.length; index += 1) {
        const candidate = parseNumericCell(cells[index] ?? "");
        if (candidate != null && candidate !== 0) {
          valueRub = candidate;
          break;
        }
      }
    }
    if (valueRub == null || valueRub === 0) continue;

    matchedRows.push({ label: segmentDef.label, valueRub });
    segmentsById.set(segmentDef.id, {
      id: segmentDef.id,
      label: segmentDef.label,
      valueRub,
      color: segmentDef.color,
    });
  }

  logSalesRows(matchedRows);

  const segments = SALES_SEGMENT_DEFS.map((definition) => segmentsById.get(definition.id)).filter(
    (segment): segment is FinanceExecutionChartSegment => segment != null,
  );

  if (segments.length === 0) return null;

  const salesChart: FinanceExecutionSalesChart = {
    segments,
    factTotalRub: sumSegmentValues(segments),
  };

  console.log(`${LOG_PREFIX} salesChart:`, salesChart);
  return salesChart;
}

function extractProjectTotalCost(rawRows: unknown[][]): number | null {
  for (const rawRow of rawRows) {
    const cells = rowCells(rawRow);
    if (isEmptyRow(cells)) continue;

    const joined = rowJoined(cells);
    if (!joined.includes("общ") || !joined.includes("стоим") || !joined.includes("проект")) {
      continue;
    }

    for (let index = 0; index < cells.length; index += 1) {
      const cellNorm = normalizeCell(cells[index] ?? "");
      if (!cellNorm || cellNorm.includes("общ") || cellNorm.includes("стоим")) continue;
      const value = parseNumericCell(cells[index] ?? "");
      if (value != null && value !== 0) return value;
    }

    for (let index = 1; index < cells.length; index += 1) {
      const value = parseNumericCell(cells[index] ?? "");
      if (value != null && value !== 0) return value;
    }
  }

  return null;
}

function findExpenseTableStart(rawRows: unknown[][]): {
  contractedColumnIndex: number;
  tableStartRow: number;
} | null {
  for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex += 1) {
    const cells = rowCells(rawRows[rowIndex]);
    if (isEmptyRow(cells)) continue;

    const joined = rowJoined(cells);
    const hasArticlesHeader =
      (joined.includes("наименование") && joined.includes("статей")) ||
      (joined.includes("статьи") && joined.includes("статей"));
    const contractedIndex = findColumnIndex(cells, (cellNorm) =>
      cellNorm.includes("законтрактовано"),
    );

    if (!hasArticlesHeader && contractedIndex < 0) continue;
    if (contractedIndex < 0) continue;

    return {
      contractedColumnIndex: contractedIndex,
      tableStartRow: rowIndex + 1,
    };
  }

  return null;
}

/** Структура расходов по статьям верхнего уровня (2.01, 2.02 …) и «Законтрактовано». */
export function parseFinanceExecutionExpenseChart(rawRows: unknown[][]): FinanceExecutionExpenseChart | null {
  const table = findExpenseTableStart(rawRows);
  const segments: FinanceExecutionChartSegment[] = [];
  const matchedRows: Array<{ code: string; label: string; valueRub: number }> = [];

  if (table) {
    const { contractedColumnIndex, tableStartRow } = table;

    for (let rowIndex = tableStartRow; rowIndex < rawRows.length; rowIndex += 1) {
      const cells = rowCells(rawRows[rowIndex]);
      if (isEmptyRow(cells)) continue;

      const joined = rowJoined(cells);
      if (joined.includes("общ") && joined.includes("стоим") && joined.includes("проект")) {
        break;
      }

      const codeMatch = extractCodeFromRow(cells);
      if (!codeMatch) continue;

      let valueRub = parseNumericCell(cells[contractedColumnIndex] ?? "");
      if (valueRub == null || valueRub === 0) {
        for (let index = codeMatch.codeCellIndex + 1; index < cells.length; index += 1) {
          const candidate = parseNumericCell(cells[index] ?? "");
          if (candidate != null && candidate !== 0) {
            valueRub = candidate;
            break;
          }
        }
      }
      if (valueRub == null || valueRub === 0) continue;

      const nameBeforeCode =
        codeMatch.codeCellIndex > 0 ? cells[codeMatch.codeCellIndex - 1]?.trim() : "";
      const nameAfterCode = cells[codeMatch.codeCellIndex + 1]?.trim() ?? "";
      const label = nameBeforeCode || nameAfterCode || codeMatch.code;

      matchedRows.push({ code: codeMatch.code, label, valueRub });
      segments.push({
        id: codeMatch.code,
        label,
        valueRub,
        color: EXPENSE_SEGMENT_COLORS[segments.length % EXPENSE_SEGMENT_COLORS.length],
      });
    }
  } else {
    console.log(`${LOG_PREFIX} таблица расходов не найдена`);
  }

  logExpenseRows(matchedRows);

  const projectTotalCostRub = extractProjectTotalCost(rawRows);
  const contractedTotalRub = sumSegmentValues(segments);

  if (segments.length === 0 && projectTotalCostRub == null) return null;

  const expenseChart: FinanceExecutionExpenseChart = {
    segments,
    contractedTotalRub,
    projectTotalCostRub,
  };

  console.log(`${LOG_PREFIX} expenseChart:`, expenseChart);
  return expenseChart;
}
