import type {
  FinanceExecutionChartSegment,
  FinanceExecutionExpenseChart,
  FinanceExecutionSalesChart,
} from "@/lib/financeBudgetExecutionData";

const LOG_PREFIX = "[finance-execution-charts]";

const KNOWN_SALES_CATEGORY_COLORS = {
  apartments: "#22c55e",
  parking: "#3b82f6",
  storage: "#f59e0b",
  admin: "#14b8a6",
} as const;

const DYNAMIC_SALES_CATEGORY_COLORS = [
  "#8b5cf6",
  "#ec4899",
  "#64748b",
  "#06b6d4",
  "#eab308",
  "#f97316",
] as const;

type ResolvedSalesCategory = {
  id: string;
  label: string;
  legendLabel?: string;
  color: string;
};

const EXPENSE_SEGMENT_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
  "#14b8a6",
  "#3b82f6",
  "#22c55e",
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

function compactLabel(text: string): string {
  return normalizeCell(text).replace(/\./g, "").replace(/\s/g, "");
}

function slugId(value: string): string {
  return compactLabel(value).slice(0, 48) || "segment";
}

function matchesAdminSalesLabel(normalized: string, compact: string): boolean {
  if (normalized.includes("администр")) return true;
  if (normalized.includes("административные")) return true;
  if (normalized.includes("адм") && normalized.includes("помещ")) return true;
  if (compact.includes("адмпомещ")) return true;
  if (compact === "адм" || normalized === "адм" || normalized === "адм.") return true;
  return false;
}

function resolveSalesCategory(rawName: string, dynamicColorIndex: number): ResolvedSalesCategory {
  const normalized = normalizeCell(rawName);
  const compact = compactLabel(rawName);

  if (matchesAdminSalesLabel(normalized, compact)) {
    return {
      id: "admin",
      label: "Административные помещения",
      legendLabel: "Адм. помещения",
      color: KNOWN_SALES_CATEGORY_COLORS.admin,
    };
  }
  if (normalized.includes("квартир")) {
    return {
      id: "apartments",
      label: "Квартиры",
      color: KNOWN_SALES_CATEGORY_COLORS.apartments,
    };
  }
  if (normalized.includes("парков")) {
    return {
      id: "parking",
      label: "Парковки",
      color: KNOWN_SALES_CATEGORY_COLORS.parking,
    };
  }
  if (normalized.includes("кладов")) {
    return {
      id: "storage",
      label: "Кладовые",
      color: KNOWN_SALES_CATEGORY_COLORS.storage,
    };
  }

  const trimmedName = rawName.trim();
  return {
    id: slugId(trimmedName),
    label: trimmedName,
    color: DYNAMIC_SALES_CATEGORY_COLORS[dynamicColorIndex % DYNAMIC_SALES_CATEGORY_COLORS.length],
  };
}

function findSalesNameColumnIndex(cells: string[]): number {
  const explicitIndex = findColumnIndex(
    cells,
    (cellNorm) => cellNorm.includes("наименован") || cellNorm.includes("объект"),
  );
  if (explicitIndex >= 0) return explicitIndex;
  return 0;
}

function isProjectCostSectionHeader(joined: string): boolean {
  return (
    joined.includes("общ") &&
    joined.includes("стоим") &&
    joined.includes("проект") &&
    (joined.includes("планируем") || joined.includes("потрат"))
  );
}

function isSalesHeaderLikeRow(normalizedName: string, joined: string): boolean {
  if (!normalizedName) return true;
  if (normalizedName.includes("наименован")) return true;
  if (normalizedName.includes("устав")) return true;
  if (normalizedName.includes("факт") && normalizedName.includes("дат")) return true;
  if (joined.includes("план") && joined.includes("факт")) return true;
  if (joined.includes("устав") && joined.includes("факт")) return true;
  return false;
}

function readSalesFactValue(cells: string[], factColumnIndex: number): number | null {
  return parseNumericCell(cells[factColumnIndex] ?? "");
}

function isSalesFactColumnHeader(cellNorm: string): boolean {
  if (!cellNorm.includes("факт")) return false;
  if (cellNorm.includes("устав")) return false;
  if (cellNorm.includes("откл")) return false;
  if (cellNorm === "%" || cellNorm.endsWith(" %")) return false;
  if (cellNorm.includes("план") && !cellNorm.includes("тек")) return false;
  return true;
}

function scoreSalesFactColumnHeader(cellNorm: string): number {
  if (cellNorm.includes("текущ") && cellNorm.includes("дат")) return 5;
  if (cellNorm.includes("тек") && cellNorm.includes("дат")) return 4;
  if (cellNorm.includes("тек")) return 3;
  if (cellNorm === "факт") return 2;
  if (cellNorm.startsWith("факт ")) return 1;
  return 0;
}

function findFactColumnIndex(cells: string[]): number {
  const candidates = cells
    .map((cell, index) => ({ index, cellNorm: normalizeCell(cell) }))
    .filter(({ cellNorm }) => isSalesFactColumnHeader(cellNorm))
    .sort((left, right) => scoreSalesFactColumnHeader(right.cellNorm) - scoreSalesFactColumnHeader(left.cellNorm));

  return candidates[0]?.index ?? -1;
}

function logMissingFactColumnWarning(headerCells: string[]): void {
  const labels = headerCells.map((cell) => cell.trim()).filter(Boolean);
  console.warn(
    `${LOG_PREFIX} колонка «Факт на тек дату» не найдена в таблице «Объекты продажи». Найденные заголовки:`,
    labels.length > 0 ? labels : headerCells,
  );
}

function stripRowQualifier(rawName: string): string {
  return rawName.replace(/\([^)]*\)/g, "").trim();
}

function findUstavColumnIndex(cells: string[]): number {
  const ustavIndex = findColumnIndex(cells, (cellNorm) => cellNorm.includes("устав"));
  if (ustavIndex >= 0) return ustavIndex;

  return findColumnIndex(
    cells,
    (cellNorm) => cellNorm.includes("план") && !cellNorm.includes("факт"),
  );
}

function isSalesSectionMarkerRow(cells: string[]): boolean {
  for (const cell of cells) {
    const normalized = normalizeCell(cell);
    if (!normalized) continue;
    if (normalized.includes("квартир") || normalized.includes("парков") || normalized.includes("кладов")) {
      return false;
    }
    if (normalized.includes("объект") && normalized.includes("продаж")) {
      return true;
    }
  }
  return false;
}

function isSalesTableEndRow(joined: string): boolean {
  if (joined.includes("средн") && joined.includes("покрыт")) return true;
  if (isProjectCostSectionHeader(joined)) return true;
  if (
    joined.includes("наименование") &&
    joined.includes("статей") &&
    joined.includes("законтрактовано")
  ) {
    return true;
  }
  if (joined.includes("общ") && joined.includes("стоим") && joined.includes("проект")) {
    return true;
  }
  return false;
}

function isSalesIncomeTotalRow(normalizedName: string): boolean {
  return normalizedName.includes("итого") && normalizedName.includes("доход");
}

type SalesTableLayout = {
  sectionRowIndex: number;
  headerRowIndex: number;
  dataStartRowIndex: number;
  dataEndRowIndex: number;
  nameColumnIndex: number;
  planColumnIndex: number;
  factColumnIndex: number;
  headerLabels: string[];
};

type SalesParsedRow = {
  name: string;
  plan: number | null;
  fact: number | null;
};

type SalesMap = {
  apartments: number | null;
  apartmentsPlan: number | null;
  parking: number | null;
  parkingPlan: number | null;
  storages: number | null;
  storagesPlan: number | null;
  administrative: number | null;
  administrativePlan: number | null;
  factTotal: number | null;
  planTotal: number | null;
};

function emptySalesMap(): SalesMap {
  return {
    apartments: null,
    apartmentsPlan: null,
    parking: null,
    parkingPlan: null,
    storages: null,
    storagesPlan: null,
    administrative: null,
    administrativePlan: null,
    factTotal: null,
    planTotal: null,
  };
}

function readSalesRowName(cells: string[], nameColumnIndex: number): string {
  const direct = stripRowQualifier(cells[nameColumnIndex]?.trim() ?? "");
  if (direct) return direct;

  for (let index = 0; index < cells.length; index += 1) {
    const trimmed = stripRowQualifier(cells[index]?.trim() ?? "");
    if (!trimmed) continue;

    const normalized = normalizeCell(trimmed);
    if (!normalized) continue;
    if (normalized.includes("наименован")) continue;
    if (normalized.includes("устав")) continue;
    if (normalized.includes("факт") && normalized.includes("дат")) continue;
    if (/^[\d\s.,+-]+$/.test(trimmed.replace(/\s/g, ""))) continue;

    return trimmed;
  }

  return "";
}

function isSalesDataHeaderDuplicate(normalizedName: string): boolean {
  return (
    normalizedName.includes("наименован") ||
    normalizedName.includes("устав") ||
    (normalizedName.includes("факт") && normalizedName.includes("дат"))
  );
}

function applySalesRowToMap(salesMap: SalesMap, row: SalesParsedRow): void {
  const normalizedName = normalizeCell(row.name);
  if (!normalizedName) return;

  if (isSalesIncomeTotalRow(normalizedName)) {
    if (row.fact != null) salesMap.factTotal = row.fact;
    if (row.plan != null) salesMap.planTotal = row.plan;
    return;
  }

  if (normalizedName.includes("квартир")) {
    if (row.fact != null) salesMap.apartments = row.fact;
    if (row.plan != null) salesMap.apartmentsPlan = row.plan;
    return;
  }
  if (normalizedName.includes("парков")) {
    if (row.fact != null) salesMap.parking = row.fact;
    if (row.plan != null) salesMap.parkingPlan = row.plan;
    return;
  }
  if (normalizedName.includes("кладов")) {
    if (row.fact != null) salesMap.storages = row.fact;
    if (row.plan != null) salesMap.storagesPlan = row.plan;
    return;
  }
  if (matchesAdminSalesLabel(normalizedName, compactLabel(row.name))) {
    if (row.fact != null) salesMap.administrative = row.fact;
    if (row.plan != null) salesMap.administrativePlan = row.plan;
  }
}

function salesMapToChart(salesMap: SalesMap): FinanceExecutionSalesChart {
  const segmentDefs: Array<{
    id: string;
    label: string;
    legendLabel?: string;
    valueRub: number | null;
    planRub: number | null;
    color: string;
  }> = [
    {
      id: "apartments",
      label: "Квартиры",
      valueRub: salesMap.apartments,
      planRub: salesMap.apartmentsPlan,
      color: KNOWN_SALES_CATEGORY_COLORS.apartments,
    },
    {
      id: "parking",
      label: "Парковки",
      valueRub: salesMap.parking,
      planRub: salesMap.parkingPlan,
      color: KNOWN_SALES_CATEGORY_COLORS.parking,
    },
    {
      id: "storage",
      label: "Кладовые",
      valueRub: salesMap.storages,
      planRub: salesMap.storagesPlan,
      color: KNOWN_SALES_CATEGORY_COLORS.storage,
    },
    {
      id: "admin",
      label: "Административные помещения",
      legendLabel: "Адм. помещения",
      valueRub: salesMap.administrative,
      planRub: salesMap.administrativePlan,
      color: KNOWN_SALES_CATEGORY_COLORS.admin,
    },
  ];

  const segments: FinanceExecutionChartSegment[] = segmentDefs
    .filter((entry) => entry.valueRub != null && entry.valueRub > 0)
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      legendLabel: entry.legendLabel,
      valueRub: entry.valueRub as number,
      planRub: entry.planRub,
      color: entry.color,
    }));

  const factTotalRub =
    salesMap.factTotal ??
    sumSegmentValues(segments) ??
    0;

  return {
    segments,
    factTotalRub,
  };
}

function findNextNonEmptyRowIndex(rawRows: unknown[][], startRowIndex: number): number | null {
  for (let rowIndex = startRowIndex; rowIndex < rawRows.length; rowIndex += 1) {
    if (!isEmptyRow(rowCells(rawRows[rowIndex]))) return rowIndex;
  }
  return null;
}

function resolveSalesHeaderRowIndex(rawRows: unknown[][], sectionRowIndex: number): number | null {
  const sectionCells = rowCells(rawRows[sectionRowIndex]);
  if (findFactColumnIndex(sectionCells) >= 0) {
    return sectionRowIndex;
  }

  const nextRowIndex = findNextNonEmptyRowIndex(rawRows, sectionRowIndex + 1);
  return nextRowIndex;
}

function locateSalesTable(rawRows: unknown[][]): SalesTableLayout | null {
  for (let sectionRowIndex = 0; sectionRowIndex < rawRows.length; sectionRowIndex += 1) {
    const sectionCells = rowCells(rawRows[sectionRowIndex]);
    if (!isSalesSectionMarkerRow(sectionCells)) continue;

    const headerRowIndex = resolveSalesHeaderRowIndex(rawRows, sectionRowIndex);
    if (headerRowIndex == null) continue;

    const headerCells = rowCells(rawRows[headerRowIndex]);
    const factColumnIndex = findFactColumnIndex(headerCells);
    if (factColumnIndex < 0) {
      logMissingFactColumnWarning(headerCells);
      continue;
    }

    const dataStartRowIndex = headerRowIndex + 1;
    let dataEndRowIndex = rawRows.length;
    for (let rowIndex = dataStartRowIndex; rowIndex < rawRows.length; rowIndex += 1) {
      const joined = rowJoined(rowCells(rawRows[rowIndex]));
      if (isSalesTableEndRow(joined)) {
        dataEndRowIndex = rowIndex;
        break;
      }
    }

    return {
      sectionRowIndex,
      headerRowIndex,
      dataStartRowIndex,
      dataEndRowIndex,
      nameColumnIndex: findSalesNameColumnIndex(headerCells),
      planColumnIndex: findUstavColumnIndex(headerCells),
      factColumnIndex,
      headerLabels: headerCells.map((cell) => cell.trim()),
    };
  }

  return null;
}

/** Структура фактических продаж по колонке «Факт на тек дату». */
export function parseFinanceExecutionSalesChart(rawRows: unknown[][]): FinanceExecutionSalesChart | null {
  const layout = locateSalesTable(rawRows);

  if (!layout) {
    console.log(`${LOG_PREFIX} таблица продаж не найдена`);
    return null;
  }

  const salesRows: SalesParsedRow[] = [];

  for (let rowIndex = layout.dataStartRowIndex; rowIndex < layout.dataEndRowIndex; rowIndex += 1) {
    const cells = rowCells(rawRows[rowIndex]);
    if (isEmptyRow(cells)) continue;

    const name = readSalesRowName(cells, layout.nameColumnIndex);
    const normalizedName = normalizeCell(name);
    if (!normalizedName) continue;
    if (isSalesDataHeaderDuplicate(normalizedName)) continue;
    if (isSalesHeaderLikeRow(normalizedName, rowJoined(cells))) continue;

    const plan =
      layout.planColumnIndex >= 0
        ? parseNumericCell(cells[layout.planColumnIndex] ?? "")
        : null;
    const fact = readSalesFactValue(cells, layout.factColumnIndex);

    console.log({ name, plan, fact });

    salesRows.push({ name, plan, fact });
  }

  console.log("sales rows", salesRows);

  const salesMap = emptySalesMap();
  for (const row of salesRows) {
    applySalesRowToMap(salesMap, row);
  }

  console.log("sales map", salesMap);

  const salesChart = salesMapToChart(salesMap);

  console.log("salesChart", salesChart);

  return salesChart;
}

function findValueColumnIndex(cells: string[]): number {
  const contractedIndex = findColumnIndex(cells, (cellNorm) =>
    cellNorm.includes("законтрактовано"),
  );
  if (contractedIndex >= 0) return contractedIndex;

  return findColumnIndex(
    cells,
    (cellNorm) => cellNorm.includes("освоено") || cellNorm.includes("освоен"),
  );
}

function findNameColumnIndex(cells: string[]): number {
  const explicitIndex = findColumnIndex(
    cells,
    (cellNorm) => cellNorm.includes("наименование") || cellNorm.includes("стать"),
  );
  if (explicitIndex >= 0) return explicitIndex;
  return 0;
}

function findPlanColumnIndex(cells: string[]): number {
  return findColumnIndex(
    cells,
    (cellNorm) => cellNorm.includes("план") && !cellNorm.includes("факт"),
  );
}

function isExpenseDataStopRow(joined: string): boolean {
  if (joined.includes("объект") && joined.includes("продаж")) return true;
  if (joined.includes("итого") && joined.includes("доход")) return true;
  if (isProjectCostSectionHeader(joined)) return false;
  return false;
}

function isTotalRow(normalizedName: string): boolean {
  return normalizedName.includes("итого") || normalizedName === "всего";
}

function sumSegmentValues(segments: FinanceExecutionChartSegment[]): number | null {
  if (segments.length === 0) return null;
  const total = segments.reduce((sum, segment) => sum + segment.valueRub, 0);
  return total > 0 ? total : null;
}

function logSalesRows(rows: Array<{ label: string; valueRub: number }>): void {
  console.log(`${LOG_PREFIX} найденные строки продаж:`, rows);
}

function logExpenseRows(rows: Array<{ label: string; valueRub: number }>): void {
  console.log(`${LOG_PREFIX} найденные строки расходов:`, rows);
}

export function logFinanceExecutionChartsSnapshot(
  salesChart: FinanceExecutionSalesChart | null,
  expenseChart: FinanceExecutionExpenseChart | null,
): void {
  console.log(`${LOG_PREFIX} salesChart:`, salesChart);
  console.log(`${LOG_PREFIX} expenseChart:`, expenseChart);
}

function findProjectCostTable(rawRows: unknown[][]): {
  nameColumnIndex: number;
  valueColumnIndex: number;
  planColumnIndex: number;
  tableStartRow: number;
} | null {
  for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex += 1) {
    const cells = rowCells(rawRows[rowIndex]);
    if (isEmptyRow(cells)) continue;

    const joined = rowJoined(cells);
    if (!isProjectCostSectionHeader(joined)) continue;

    for (
      let headerRowIndex = rowIndex + 1;
      headerRowIndex < Math.min(rowIndex + 8, rawRows.length);
      headerRowIndex += 1
    ) {
      const headerCells = rowCells(rawRows[headerRowIndex]);
      if (isEmptyRow(headerCells)) continue;

      const valueColumnIndex = findValueColumnIndex(headerCells);
      if (valueColumnIndex < 0) continue;

      return {
        nameColumnIndex: findNameColumnIndex(headerCells),
        valueColumnIndex,
        planColumnIndex: findPlanColumnIndex(headerCells),
        tableStartRow: headerRowIndex + 1,
      };
    }
  }

  return findLegacyExpenseTable(rawRows);
}

function findLegacyExpenseTable(rawRows: unknown[][]): {
  nameColumnIndex: number;
  valueColumnIndex: number;
  planColumnIndex: number;
  tableStartRow: number;
} | null {
  for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex += 1) {
    const cells = rowCells(rawRows[rowIndex]);
    if (isEmptyRow(cells)) continue;

    const joined = rowJoined(cells);
    const hasArticlesHeader =
      (joined.includes("наименование") && joined.includes("статей")) ||
      (joined.includes("статьи") && joined.includes("статей"));
    const valueColumnIndex = findValueColumnIndex(cells);

    if (!hasArticlesHeader && valueColumnIndex < 0) continue;
    if (valueColumnIndex < 0) continue;

    return {
      nameColumnIndex: findNameColumnIndex(cells),
      valueColumnIndex,
      planColumnIndex: findPlanColumnIndex(cells),
      tableStartRow: rowIndex + 1,
    };
  }

  return null;
}

function extractLegacyProjectTotalCost(rawRows: unknown[][]): number | null {
  for (const rawRow of rawRows) {
    const cells = rowCells(rawRow);
    if (isEmptyRow(cells)) continue;

    const joined = rowJoined(cells);
    if (!joined.includes("общ") || !joined.includes("стоим") || !joined.includes("проект")) {
      continue;
    }
    if (isProjectCostSectionHeader(joined)) continue;

    for (let index = 1; index < cells.length; index += 1) {
      const value = parseNumericCell(cells[index] ?? "");
      if (value != null && value !== 0) return value;
    }
  }

  return null;
}

/** Структура расходов — блок «Общая стоимость проекта (планируем потратить)». */
export function parseFinanceExecutionExpenseChart(rawRows: unknown[][]): FinanceExecutionExpenseChart | null {
  const table = findProjectCostTable(rawRows);
  const segments: FinanceExecutionChartSegment[] = [];
  const matchedRows: Array<{ label: string; valueRub: number }> = [];
  let projectTotalCostRub: number | null = null;

  if (table) {
    const { nameColumnIndex, valueColumnIndex, planColumnIndex, tableStartRow } = table;

    for (let rowIndex = tableStartRow; rowIndex < rawRows.length; rowIndex += 1) {
      const cells = rowCells(rawRows[rowIndex]);
      if (isEmptyRow(cells)) continue;

      const joined = rowJoined(cells);
      if (isExpenseDataStopRow(joined)) break;

      const rawName = cells[nameColumnIndex]?.trim() ?? cells[0]?.trim() ?? "";
      const normalizedName = normalizeCell(rawName);
      if (!normalizedName || normalizedName.includes("наименование")) continue;

      if (isTotalRow(normalizedName)) {
        if (planColumnIndex >= 0) {
          projectTotalCostRub =
            parseNumericCell(cells[planColumnIndex] ?? "") ??
            parseNumericCell(cells[valueColumnIndex] ?? "");
        } else {
          projectTotalCostRub = parseNumericCell(cells[valueColumnIndex] ?? "");
        }
        continue;
      }

      let valueRub = parseNumericCell(cells[valueColumnIndex] ?? "");
      if (valueRub == null || valueRub === 0) {
        for (let index = nameColumnIndex + 1; index < cells.length; index += 1) {
          const candidate = parseNumericCell(cells[index] ?? "");
          if (candidate != null && candidate !== 0) {
            valueRub = candidate;
            break;
          }
        }
      }
      if (valueRub == null || valueRub === 0) continue;

      matchedRows.push({ label: rawName, valueRub });
      segments.push({
        id: slugId(rawName),
        label: rawName,
        valueRub,
        color: EXPENSE_SEGMENT_COLORS[segments.length % EXPENSE_SEGMENT_COLORS.length],
      });
    }
  } else {
    console.log(`${LOG_PREFIX} таблица расходов не найдена`);
  }

  logExpenseRows(matchedRows);

  if (projectTotalCostRub == null) {
    projectTotalCostRub = extractLegacyProjectTotalCost(rawRows);
  }

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
