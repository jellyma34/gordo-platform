import type {
  FinanceExecutionChartSegment,
  FinanceExecutionExpenseArticle,
  FinanceExecutionExpenseChart,
  FinanceExecutionSalesChart,
} from "@/lib/financeBudgetExecutionData";
import {
  withExpenseSegmentDeviations,
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

/**
 * Канонические разделы верхнего уровня для диаграммы «Расходы».
 * Вложенные статьи (2.04.01 …) суммируются в эти группы.
 */
const EXPENSE_TOP_LEVEL_SECTION_LABELS: Record<string, string> = {
  "2.01": "Приобретение и обслуживание земельного участка",
  "2.02": "Проектные и изыскательские работы",
  "2.03": "Технологическое присоединение к сетям",
  "2.04": "Организация строительства",
  "2.05": "Строительство зданий и сооружений",
  "2.06": "Устройство сетей",
  "2.07": "Благоустройство",
  "2.08": "Накладные расходы площадки",
  "2.09": "Подготовка к передаче",
  "2.10": "Транспорт и спецтехника",
  "2.11": "Коммерческие расходы",
  "2.12": "Платежи в бюджет",
  "2.90": "Общехозяйственные расходы",
  "2.99": "Резерв проекта",
  "4.01": "Приобретение долгосрочных активов",
  "6.03": "Проценты по кредитам и займам",
};

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
      planRub: entry.planRub ?? null,
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

function findCodeColumnIndex(cells: string[]): number {
  return findColumnIndex(
    cells,
    (cellNorm) => cellNorm === "код" || cellNorm.startsWith("код ") || cellNorm.includes("код стат"),
  );
}

/**
 * Если отдельной колонки «Код» нет, а наименование не в первой колонке,
 * код статьи лежит в cells[0] (формат «2.01.» | «Название»).
 */
function resolveExpenseCodeColumnIndex(nameColumnIndex: number, codeColumnIndex: number): number {
  if (codeColumnIndex >= 0) return codeColumnIndex;
  if (nameColumnIndex > 0) return 0;
  return -1;
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

type ExpenseTableLayout = {
  nameColumnIndex: number;
  codeColumnIndex: number;
  valueColumnIndex: number;
  planColumnIndex: number;
  tableStartRow: number;
};

type ParsedExpenseRow = {
  code: string | null;
  name: string;
  rawLabel: string;
  valueRub: number;
  planRub: number | null;
};

/** Нормализация кода: «2.04.» → «2.04». */
function normalizeExpenseBudgetCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "").replace(/\.+$/, "");
}

function budgetCodeParts(code: string): string[] {
  return normalizeExpenseBudgetCode(code).split(".").filter(Boolean);
}

/**
 * Статья первого уровня для презентационной диаграммы:
 * ровно две части кода — 2.01, 2.99, 4.01, 6.03.
 * Не 2, не 2.01.01.
 */
function isExpensePresentationLevelCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return budgetCodeParts(code).length === 2;
}

/** Глава «2.» / итог «Общая стоимость проекта» — не сектор диаграммы. */
function isExpenseProjectTotalRow(code: string | null, name: string, rawLabel: string): boolean {
  const joined = normalizeCell(`${rawLabel} ${name}`);
  if (
    joined.includes("общ") &&
    joined.includes("стоим") &&
    joined.includes("проект")
  ) {
    return true;
  }
  if (joined.includes("планируем") && joined.includes("потрат")) {
    return true;
  }
  if (code != null && budgetCodeParts(code).length === 1) {
    return true;
  }
  return false;
}

function compareBudgetCodes(left: string, right: string): number {
  const leftParts = budgetCodeParts(left).map((part) => Number.parseInt(part, 10));
  const rightParts = budgetCodeParts(right).map((part) => Number.parseInt(part, 10));
  const len = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < len; index += 1) {
    const a = leftParts[index] ?? 0;
    const b = rightParts[index] ?? 0;
    if (a !== b) return a - b;
  }
  return 0;
}

/**
 * Извлечь код и название из ячейки:
 * «2.04 Организация строительства» / «2.04.01. Подготовка» / «2.01.01.Something».
 */
function extractExpenseCodeAndName(raw: string): { code: string | null; name: string } {
  const trimmed = String(raw ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!trimmed) return { code: null, name: "" };

  const compact = trimmed.replace(/\s+/g, "");
  if (/^\d+(\.\d+)*\.?$/.test(compact)) {
    return { code: normalizeExpenseBudgetCode(compact), name: "" };
  }

  // «2.01.01 Название» / «2.01.01. Название» / «2.01.01.-Название»
  const matched = trimmed.match(/^(\d+(?:\.\d+)*)(?:\.|\s|[.\-–—])+\s*(.+)$/);
  if (matched) {
    return {
      code: normalizeExpenseBudgetCode(matched[1] ?? ""),
      name: (matched[2] ?? "").trim(),
    };
  }

  // Код в начале без разделителя после последней группы: «2.01.01Название» — редко
  const glued = trimmed.match(/^(\d+(?:\.\d+)+)([^\d].*)$/);
  if (glued && budgetCodeParts(glued[1] ?? "").length >= 2) {
    return {
      code: normalizeExpenseBudgetCode(glued[1] ?? ""),
      name: (glued[2] ?? "").trim(),
    };
  }

  return { code: null, name: trimmed };
}

/** Есть ли в тексте бюджетный код вида 2.01 / 2.01.01. */
function expenseSegmentId(code: string | null | undefined, fallbackLabel: string): string {
  if (code) return `budget-${normalizeExpenseBudgetCode(code)}`;
  return slugId(fallbackLabel);
}

function expenseCodeFromSegmentId(id: string): string | null {
  const matched = String(id ?? "").match(/^budget-(.+)$/);
  if (!matched) return null;
  const code = normalizeExpenseBudgetCode(matched[1] ?? "");
  return code || null;
}

function looksLikeBudgetArticleCode(text: string): boolean {
  return /^\d+\.\d+/.test(
    String(text ?? "")
      .replace(/^\uFEFF/, "")
      .replace(/\u00a0/g, " ")
      .trim(),
  );
}

function resolveExpensePresentationLabel(row: ParsedExpenseRow): string {
  if (row.code && EXPENSE_TOP_LEVEL_SECTION_LABELS[row.code]) {
    return EXPENSE_TOP_LEVEL_SECTION_LABELS[row.code];
  }
  const fromName = (row.name || "").trim();
  if (fromName && !looksLikeBudgetArticleCode(fromName)) return fromName;
  if (fromName) {
    const extracted = extractExpenseCodeAndName(fromName);
    if (extracted.name) return extracted.name;
  }
  const extracted = extractExpenseCodeAndName(row.rawLabel);
  if (extracted.name) return extracted.name;
  return row.rawLabel;
}

/**
 * Презентационные сегменты: только строки с кодом из ровно двух частей (2.01, 4.01, …).
 * Вложенные 2.01.01 / 2.04.03 не включаются и не суммируются.
 * Итог «2. Общая стоимость проекта» исключается.
 */
function buildExpensePresentationSegments(
  rows: ParsedExpenseRow[],
): FinanceExecutionChartSegment[] {
  const normalizedRows = rows.map((row) => {
    if (row.code) return row;
    const fromRaw = extractExpenseCodeAndName(row.rawLabel);
    if (fromRaw.code) {
      return {
        ...row,
        code: fromRaw.code,
        name: fromRaw.name || row.name,
      };
    }
    const fromName = extractExpenseCodeAndName(row.name);
    if (fromName.code) {
      return {
        ...row,
        code: fromName.code,
        name: fromName.name || row.name,
      };
    }
    return row;
  });

  const codedPresentationRows = normalizedRows
    .filter(
      (row) =>
        row.valueRub > 0 &&
        isExpensePresentationLevelCode(row.code) &&
        !isExpenseProjectTotalRow(row.code, row.name, row.rawLabel),
    )
    .sort((left, right) => compareBudgetCodes(left.code!, right.code!));

  const hasAnyBudgetCode = normalizedRows.some(
    (row) =>
      row.code != null ||
      looksLikeBudgetArticleCode(row.rawLabel) ||
      looksLikeBudgetArticleCode(row.name),
  );

  // Иерархический CSV: никогда не выводим «плоский» fallback со всеми листьями.
  if (hasAnyBudgetCode) {
    return codedPresentationRows.map((row, index) => {
      const labelName = resolveExpensePresentationLabel(row);
      return withExpenseSegmentDeviations({
        id: expenseSegmentId(row.code, row.rawLabel),
        label: labelName,
        legendLabel: labelName,
        valueRub: row.valueRub,
        planRub: row.planRub,
        color: EXPENSE_SEGMENT_COLORS[index % EXPENSE_SEGMENT_COLORS.length],
      });
    });
  }

  // Плоский CSV без кодов — каждая строка как сегмент (sample / legacy).
  return normalizedRows
    .filter(
      (row) =>
        (row.valueRub > 0 || (row.planRub != null && row.planRub > 0)) &&
        !isExpenseProjectTotalRow(null, row.name, row.rawLabel),
    )
    .map((row, index) =>
      withExpenseSegmentDeviations({
        id: slugId(row.rawLabel),
        label: row.name || row.rawLabel,
        valueRub: row.valueRub,
        planRub: row.planRub,
        color: EXPENSE_SEGMENT_COLORS[index % EXPENSE_SEGMENT_COLORS.length],
      }),
    );
}

/**
 * Страховка для UI/старых снимков localStorage:
 * оставить в диаграмме только сегменты 1-го уровня (код из двух частей).
 */
export function filterExpenseSegmentsForPresentationChart(
  segments: FinanceExecutionChartSegment[],
): FinanceExecutionChartSegment[] {
  const resolved = segments.map((segment) => {
    const fromLabel = extractExpenseCodeAndName(segment.label);
    const fromLegend = extractExpenseCodeAndName(segment.legendLabel ?? "");
    const fromId = expenseCodeFromSegmentId(segment.id);

    // Код только из явного префикса/id — без reverse-match по каталогу названий
    // (иначе плоский CSV «Организация строительства» ошибочно станет 2.04).
    const code = fromId ?? fromLabel.code ?? fromLegend.code;

    return { segment, code };
  });

  const hasAnyBudgetCode = resolved.some(
    ({ segment, code }) =>
      code != null ||
      looksLikeBudgetArticleCode(segment.label) ||
      looksLikeBudgetArticleCode(segment.legendLabel ?? ""),
  );

  const filtered = hasAnyBudgetCode
    ? resolved
        .filter(({ code }) => isExpensePresentationLevelCode(code))
        .map(({ segment, code }) => {
          const labelName =
            (code && EXPENSE_TOP_LEVEL_SECTION_LABELS[code]) ||
            extractExpenseCodeAndName(segment.label).name ||
            segment.legendLabel ||
            segment.label;
          return withExpenseSegmentDeviations({
            ...segment,
            id: expenseSegmentId(code, segment.label),
            label: labelName,
            legendLabel: labelName,
          });
        })
    : segments
        .filter(
          (segment) =>
            (segment.valueRub > 0 || (segment.planRub != null && segment.planRub > 0)) &&
            !isExpenseProjectTotalRow(null, segment.label, segment.label),
        )
        .map((segment) => withExpenseSegmentDeviations(segment));

  const codes = filtered.map((segment) => {
    return (
      expenseCodeFromSegmentId(segment.id) ??
      extractExpenseCodeAndName(segment.label).code ??
      `(no-code) ${segment.label}`
    );
  });

  console.log("[finance-execution-charts] expense chartData codes:", codes);

  return filtered;
}

function buildExpenseDetailSegments(rows: ParsedExpenseRow[]): FinanceExecutionChartSegment[] {
  return rows
    .filter(
      (row) =>
        (row.valueRub > 0 || (row.planRub != null && row.planRub > 0)) &&
        !isExpenseProjectTotalRow(row.code, row.name, row.rawLabel),
    )
    .map((row, index) => {
      const labelBase = row.name || row.rawLabel;
      // Сохраняем код в label/id, чтобы UI-фильтр мог восстановить уровень даже из старых снимков.
      const labelWithCode =
        row.code && !looksLikeBudgetArticleCode(labelBase)
          ? `${row.code} ${labelBase}`
          : labelBase;

      return withExpenseSegmentDeviations({
        id: expenseSegmentId(row.code, row.rawLabel),
        label: labelWithCode,
        legendLabel: labelBase,
        valueRub: row.valueRub,
        planRub: row.planRub,
        color: EXPENSE_SEGMENT_COLORS[index % EXPENSE_SEGMENT_COLORS.length],
      });
    });
}

/** Листья иерархии: исключаем родителя, если есть дочерние коды. */
function preferLeafExpenseRows(rows: ParsedExpenseRow[]): ParsedExpenseRow[] {
  const coded = rows.filter((row) => typeof row.code === "string" && row.code.length > 0);
  if (coded.length === 0) return rows;
  return coded.filter((row) => {
    const prefix = `${row.code}.`;
    return !coded.some(
      (other) => other.code !== row.code && typeof other.code === "string" && other.code.startsWith(prefix),
    );
  });
}

function buildExpenseArticles(rows: ParsedExpenseRow[]): FinanceExecutionExpenseArticle[] {
  const leafRows = preferLeafExpenseRows(
    rows.filter(
      (row) =>
        !isExpenseProjectTotalRow(row.code, row.name, row.rawLabel) &&
        row.planRub != null &&
        row.planRub > 0,
    ),
  );

  return leafRows.map((row, index) => {
    const planRub = row.planRub as number;
    const factRub = row.valueRub;
    const name = (row.name || row.rawLabel).trim() || row.rawLabel;
    return {
      id: expenseSegmentId(row.code, row.rawLabel),
      name,
      planRub,
      factRub,
      deviationRub: factRub - planRub,
      deviationPct: Math.round(((factRub - planRub) / planRub) * 1000) / 10,
      color: EXPENSE_SEGMENT_COLORS[index % EXPENSE_SEGMENT_COLORS.length],
      code: row.code,
    };
  });
}

/** Rollup листовых articles в сегменты 1-го уровня для donut. */
function rollupArticlesToPresentationSegments(
  articles: FinanceExecutionExpenseArticle[],
): FinanceExecutionChartSegment[] {
  const byTop = new Map<
    string,
    { label: string; valueRub: number; planRub: number; color: string }
  >();

  for (const article of articles) {
    const code = article.code ?? expenseCodeFromSegmentId(article.id);
    const topCode =
      code && budgetCodeParts(code).length >= 2
        ? budgetCodeParts(code).slice(0, 2).join(".")
        : null;
    const key = topCode ?? article.id;
    const label =
      (topCode && EXPENSE_TOP_LEVEL_SECTION_LABELS[topCode]) ||
      (topCode ? topCode : article.name);
    const prev = byTop.get(key);
    if (prev) {
      prev.valueRub += article.factRub;
      prev.planRub += article.planRub;
    } else {
      byTop.set(key, {
        label,
        valueRub: article.factRub,
        planRub: article.planRub,
        color: article.color,
      });
    }
  }

  return [...byTop.entries()].map(([key, value], index) =>
    withExpenseSegmentDeviations({
      id: key.startsWith("budget-") ? key : expenseSegmentId(key, value.label),
      label: value.label,
      legendLabel: value.label,
      valueRub: value.valueRub,
      planRub: value.planRub,
      color: value.color || EXPENSE_SEGMENT_COLORS[index % EXPENSE_SEGMENT_COLORS.length],
    }),
  );
}

function findProjectCostTable(rawRows: unknown[][]): ExpenseTableLayout | null {
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

      const nameColumnIndex = findNameColumnIndex(headerCells);
      const codeColumnIndex = resolveExpenseCodeColumnIndex(
        nameColumnIndex,
        findCodeColumnIndex(headerCells),
      );

      return {
        nameColumnIndex,
        codeColumnIndex,
        valueColumnIndex,
        planColumnIndex: findPlanColumnIndex(headerCells),
        tableStartRow: headerRowIndex + 1,
      };
    }
  }

  return findLegacyExpenseTable(rawRows);
}

function findLegacyExpenseTable(rawRows: unknown[][]): ExpenseTableLayout | null {
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

    const nameColumnIndex = findNameColumnIndex(cells);
    const codeColumnIndex = resolveExpenseCodeColumnIndex(
      nameColumnIndex,
      findCodeColumnIndex(cells),
    );

    return {
      nameColumnIndex,
      codeColumnIndex,
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

function readExpenseRowValue(
  cells: string[],
  nameColumnIndex: number,
  valueColumnIndex: number,
): number | null {
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
  if (valueRub == null || valueRub === 0) return null;
  return valueRub;
}

/** Структура расходов — блок «Общая стоимость проекта (планируем потратить)». */
export function parseFinanceExecutionExpenseChart(rawRows: unknown[][]): FinanceExecutionExpenseChart | null {
  console.log("[expense-diag] ENTER parseFinanceExecutionExpenseChart");
  console.trace("[expense-diag] parseFinanceExecutionExpenseChart");

  const table = findProjectCostTable(rawRows);
  const detailRows: ParsedExpenseRow[] = [];
  let projectTotalCostRub: number | null = null;

  if (table) {
    const { nameColumnIndex, codeColumnIndex, valueColumnIndex, planColumnIndex, tableStartRow } =
      table;

    for (let rowIndex = tableStartRow; rowIndex < rawRows.length; rowIndex += 1) {
      const cells = rowCells(rawRows[rowIndex]);
      if (isEmptyRow(cells)) continue;

      const joined = rowJoined(cells);
      if (isExpenseDataStopRow(joined)) break;

      const rawName = cells[nameColumnIndex]?.trim() ?? cells[0]?.trim() ?? "";
      const normalizedName = normalizeCell(rawName);
      if (!normalizedName || normalizedName.includes("наименование")) continue;

      const fromName = extractExpenseCodeAndName(rawName);
      const codeFromColumn =
        codeColumnIndex >= 0
          ? normalizeExpenseBudgetCode(cells[codeColumnIndex]?.trim() ?? "")
          : "";
      const code =
        codeFromColumn && /^\d+(\.\d+)*$/.test(codeFromColumn)
          ? codeFromColumn
          : fromName.code;

      const name =
        codeColumnIndex >= 0 && fromName.code == null
          ? rawName
          : fromName.name || rawName;

      const planValue =
        planColumnIndex >= 0 ? parseNumericCell(cells[planColumnIndex] ?? "") : null;
      const valueRub = readExpenseRowValue(cells, nameColumnIndex, valueColumnIndex) ?? 0;

      // Итог / глава «2. Общая стоимость проекта» — только KPI, не статья диаграммы.
      if (isTotalRow(normalizedName) || isExpenseProjectTotalRow(code, name, rawName)) {
        const totalCandidate =
          planValue ??
          (valueRub > 0 ? valueRub : null) ??
          parseNumericCell(cells[valueColumnIndex] ?? "");
        if (totalCandidate != null && totalCandidate > 0) {
          projectTotalCostRub = totalCandidate;
        }
        continue;
      }

      if (valueRub <= 0 && !(planValue != null && planValue > 0)) continue;

      detailRows.push({
        code,
        name,
        rawLabel: rawName,
        valueRub,
        planRub: planValue != null && planValue > 0 ? planValue : null,
      });
    }
  } else {
    console.log(`${LOG_PREFIX} таблица расходов не найдена`);
  }

  // Диагностика поля code (без вывода всего detailRows)
  console.table(
    detailRows
      .filter((r): r is ParsedExpenseRow & { code: string } => typeof r.code === "string")
      .map((r) => ({
        rawCode: r.code,
        json: JSON.stringify(r.code),
        length: r.code.length,
        parts: r.code.split("."),
        partsLength: r.code.split(".").length,
        charCodes: [...r.code].map((c) => c.charCodeAt(0)),
        value: r.valueRub,
      }))
      .filter((r) => r.rawCode.startsWith("2.")),
  );

  console.log(
    detailRows.filter(
      (r) => r.code === "2.01" || (typeof r.code === "string" && r.code.startsWith("2.01")),
    ),
  );

  logExpenseRows(detailRows.map((row) => ({ label: row.rawLabel, valueRub: row.valueRub })));

  // --- временная диагностика расходов ---
  console.log("raw expense rows", rawRows);
  console.log("[expense-diag] table layout:", table);
  console.log("[expense-diag] detailRows count:", detailRows.length);
  console.table(
    detailRows.map((row) => ({
      group: row.code ? budgetCodeParts(row.code).slice(0, 2).join(".") : null,
      article: row.rawLabel,
      code: row.code,
      name: row.name,
      value: row.valueRub,
      codeParts: row.code ? budgetCodeParts(row.code).length : 0,
      rawLabelStartsWithCode: looksLikeBudgetArticleCode(row.rawLabel),
      nameStartsWithCode: looksLikeBudgetArticleCode(row.name),
    })),
  );

  // Поиск, в каких «полях» реально встречаются коды 2.01 / 2.01.01
  const codeFieldProbe = detailRows.slice(0, 40).map((row) => {
    const probes: Record<string, string | null> = {
      "field.code": row.code,
      "field.name": extractExpenseCodeAndName(row.name).code,
      "field.rawLabel": extractExpenseCodeAndName(row.rawLabel).code,
    };
    return { rawLabel: row.rawLabel, ...probes, value: row.valueRub };
  });
  console.log("[expense-diag] code field probe (first 40):");
  console.table(codeFieldProbe);

  if (projectTotalCostRub == null) {
    projectTotalCostRub = extractLegacyProjectTotalCost(rawRows);
  }

  const detailSegments = buildExpenseDetailSegments(detailRows);
  const articles = buildExpenseArticles(detailRows);
  console.table(
    detailRows.slice(0, 20).map((r) => ({
      code: r.code,
      rawLabel: r.rawLabel,
      name: r.name,
      valueRub: r.valueRub,
      planRub: r.planRub,
    })),
  );
  console.log(
    "[expense-diag] unique codes",
    [...new Set(detailRows.map((r) => r.code))].slice(0, 100),
  );
  let segments = buildExpensePresentationSegments(detailRows);
  console.log(
    "[expense-diag] presentation BEFORE filterExpenseSegmentsForPresentationChart:",
    segments.length,
  );
  console.table(
    segments.map((segment) => ({
      id: segment.id,
      code: expenseCodeFromSegmentId(segment.id),
      name: segment.label,
      value: segment.valueRub,
      plan: segment.planRub,
    })),
  );

  // Если иерархия без строк 1-го уровня — собираем диаграмму из articles (rollup по коду).
  if (segments.length === 0 && articles.length > 0) {
    segments = rollupArticlesToPresentationSegments(articles);
  }

  segments = filterExpenseSegmentsForPresentationChart(
    segments.length > 0 ? segments : detailSegments,
  );

  console.log("[expense-diag] chartData AFTER filter, length:", segments.length);
  console.table(
    segments.map((segment) => ({
      code: expenseCodeFromSegmentId(segment.id),
      name: segment.label,
      value: segment.valueRub,
      plan: segment.planRub,
    })),
  );
  if (segments.length === 0) {
    console.warn(
      "[expense-diag] chartData.length === 0 — фильтр дал пустой результат. " +
        "Проверьте code field probe: возможно код не в field.code, а в rawLabel/name, " +
        "или в CSV нет строк 1-го уровня (2.01), только 2.01.01…",
    );
  }

  const contractedTotalRub = sumSegmentValues(segments.filter((s) => s.valueRub > 0));

  if (segments.length === 0 && articles.length === 0 && projectTotalCostRub == null) {
    console.log(
      "[expense-diag] EXIT parseFinanceExecutionExpenseChart",
      { reason: "null — segments empty and no projectTotalCostRub" },
    );
    return null;
  }

  // Плоский CSV: диаграмма и перерасход — один набор articles.
  if (articles.length > 0 && segments.every((s) => s.planRub == null || !expenseCodeFromSegmentId(s.id))) {
    const fromArticles = articles
      .filter((article) => article.factRub > 0)
      .map((article, index) =>
        withExpenseSegmentDeviations({
          id: article.id,
          label: article.name,
          legendLabel: article.name,
          valueRub: article.factRub,
          planRub: article.planRub,
          color: article.color || EXPENSE_SEGMENT_COLORS[index % EXPENSE_SEGMENT_COLORS.length],
        }),
      );
    if (fromArticles.length > 0 && segments.length === fromArticles.length) {
      // already aligned
    } else if (segments.length === 0 && fromArticles.length > 0) {
      segments = fromArticles;
    }
  }

  const expenseChart: FinanceExecutionExpenseChart = {
    segments,
    detailSegments: detailSegments.length > 0 ? detailSegments : undefined,
    articles: articles.length > 0 ? articles : undefined,
    contractedTotalRub,
    projectTotalCostRub,
  };

  console.log(`${LOG_PREFIX} expenseChart presentation (level-1):`, segments);
  console.log(`${LOG_PREFIX} expenseChart detail count:`, detailSegments.length);
  console.log(`${LOG_PREFIX} expenseChart articles:`, articles.length);
  console.log("[expense-diag] EXIT parseFinanceExecutionExpenseChart", {
    reason: "expenseChart",
    segmentsCount: segments.length,
    detailSegmentsCount: detailSegments.length,
    articlesCount: articles.length,
    projectTotalCostRub,
  });
  return expenseChart;
}
