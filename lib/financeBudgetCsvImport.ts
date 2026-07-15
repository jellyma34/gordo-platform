import { readFinanceCsvRawRows } from "@/lib/financeCsvFormat";
import {
  cloneFinanceBudgetLines,
  logFinanceBudgetImportCodeDiagnostics,
  normalizeFinanceBudgetCode,
  type FinanceBudgetLine,
} from "@/lib/financeBudgetData";
import { normalizeForecastMonth } from "@/lib/normalizeForecastMonth";

export const FINANCE_BUDGET_CSV_DELIMITER = ";";

export const FINANCE_BUDGET_CSV_HEADER_SCAN_LIMIT = 120;

export const FINANCE_BUDGET_CSV_HEADER_MIN_SIGNATURES = 2;

export type FinanceBudgetColumnKey = "code" | "name" | "category" | "unit" | "totalPlan" | "versionOn";

export type FinanceBudgetColumnMap = Record<FinanceBudgetColumnKey, number>;

export type FinanceBudgetMonthColumn = {
  index: number;
  periodKey: string;
  kind: "plan" | "fact";
};

export type FinanceBudgetCsvImportAudit = {
  parsedRows: number;
  loaded: number;
  skipped: number;
  errors: number;
  headers: string[];
  headerRowIndex: number;
  columnMap: FinanceBudgetColumnMap;
  monthColumns: FinanceBudgetMonthColumn[];
  skippedRows: { rowIndex: number; reason: string }[];
};

const COLUMN_DEFINITIONS: { key: FinanceBudgetColumnKey; patterns: string[] }[] = [
  { key: "name", patterns: ["статьи бюджета", "статья бюджета", "наименование статьи", "наименование"] },
  { key: "category", patterns: ["раздел", "группа", "блок", "тип"] },
  { key: "unit", patterns: ["ед. изм", "ед изм", "единица измерения"] },
  { key: "versionOn", patterns: ["версия на"] },
  { key: "totalPlan", patterns: ["итого", "всего", "сумма", "total"] },
];

/** Служебные/операционные колонки — не использовать вместо «Код» бюджета. */
const CODE_HEADER_EXCLUDE_PATTERNS = [
  "вне банка",
  "операцион",
  "классиф",
  "служеб",
  "внутрен",
  "шифр",
  "№ п/п",
  "номер",
] as const;

function isExcludedFinanceBudgetCodeHeader(normalizedHeader: string): boolean {
  if (!normalizedHeader) return true;
  return CODE_HEADER_EXCLUDE_PATTERNS.some((pattern) => normalizedHeader.includes(pattern));
}

/**
 * Колонка «Код» бюджета: 1., 2., 2.01. …
 * Приоритет — точное совпадение заголовка «Код», без операционных классификаторов.
 */
export function findFinanceBudgetCodeColumnIndex(headers: string[]): number {
  const normalized = headers.map((h) => normalizeHeader(h));

  const exactCodeIdx = normalized.findIndex((h) => h === "код");
  if (exactCodeIdx >= 0) return exactCodeIdx;

  const exactBudgetCodeIdx = normalized.findIndex((h) => h === "код бюджета");
  if (exactBudgetCodeIdx >= 0) return exactBudgetCodeIdx;

  for (let index = 0; index < normalized.length; index += 1) {
    const header = normalized[index] ?? "";
    if (header !== "код" && !header.startsWith("код ")) continue;
    if (isExcludedFinanceBudgetCodeHeader(header)) continue;
    return index;
  }

  return -1;
}

/** Колонка «Наименование» — fallback, если нет «Статьи бюджета». */
export function findFinanceBudgetNameColumnIndex(headers: string[]): number {
  const articleIdx = findFinanceBudgetArticleColumnIndex(headers);
  if (articleIdx >= 0) return articleIdx;

  const normalized = headers.map((h) => normalizeHeader(h));

  const exactIdx = normalized.findIndex((h) => h === "наименование");
  if (exactIdx >= 0) return exactIdx;

  const articleNameIdx = normalized.findIndex((h) => h === "наименование статьи");
  if (articleNameIdx >= 0) return articleNameIdx;

  return -1;
}

function normalizeHeader(h: string): string {
  return String(h)
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseBudgetNumber(val: unknown): number | null {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s || s === "—" || s === "-") return null;
  const normalized = s
    .replace(/\s/g, "")
    .replace(/\u00a0/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function makeUniqueHeaderKeys(headerRaw: string[]): string[] {
  const seen = new Map<string, number>();
  return headerRaw.map((raw, index) => {
    const base =
      String(raw ?? "")
        .replace(/^\uFEFF/, "")
        .trim()
        .replace(/\s+/g, " ") || `column_${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}__${count + 1}`;
  });
}

export function buildFinanceBudgetColumnMap(headers: string[]): FinanceBudgetColumnMap {
  const map = Object.fromEntries(COLUMN_DEFINITIONS.map(({ key }) => [key, -1])) as FinanceBudgetColumnMap;
  map.code = findFinanceBudgetCodeColumnIndex(headers);
  map.name = findFinanceBudgetNameColumnIndex(headers);

  const normalized = headers.map((h) => normalizeHeader(h));

  for (const { key, patterns } of COLUMN_DEFINITIONS) {
    if (key === "name") continue;
    const sorted = [...patterns].sort((a, b) => b.length - a.length);
    for (const pattern of sorted) {
      const idx = normalized.findIndex((h) => h.includes(pattern));
      if (idx >= 0) {
        map[key] = idx;
        break;
      }
    }
  }

  if (map.versionOn < 0) {
    const versionOnIdx = normalized.findIndex((h) => h === "версия на" || h.startsWith("версия на"));
    if (versionOnIdx >= 0) map.versionOn = versionOnIdx;
  }

  return map;
}

function extractPeriodKeyFromHeader(header: string): string | null {
  const raw = String(header ?? "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}$/.test(raw)) return raw;

  const direct = normalizeForecastMonth(raw);
  if (direct && /^\d{4}-\d{2}$/.test(direct)) return direct;

  const stripped = raw
    .replace(/план/gi, " ")
    .replace(/факт/gi, " ")
    .replace(/руб/gi, " ")
    .replace(/₽/g, " ")
    .trim();
  const fromStripped = normalizeForecastMonth(stripped);
  if (fromStripped && /^\d{4}-\d{2}$/.test(fromStripped)) return fromStripped;

  const yearMonthWord = stripped.match(/([а-яё]+)\s+(\d{4})/i);
  if (yearMonthWord) {
    const fromWord = normalizeForecastMonth(`${yearMonthWord[1]}.${yearMonthWord[2]}`);
    if (fromWord && /^\d{4}-\d{2}$/.test(fromWord)) return fromWord;
  }

  return null;
}

export function detectFinanceBudgetMonthColumns(headers: string[]): FinanceBudgetMonthColumn[] {
  const result: FinanceBudgetMonthColumn[] = [];

  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index] ?? "";
    const norm = normalizeHeader(header);
    if (!norm) continue;

    const periodKey = extractPeriodKeyFromHeader(header);
    if (!periodKey) continue;

    const isFact = norm.includes("факт");
    const isPlanExplicit = norm.includes("план");
    const kind: "plan" | "fact" = isFact ? "fact" : isPlanExplicit ? "plan" : "plan";

    const duplicate = result.find((col) => col.periodKey === periodKey && col.kind === kind);
    if (!duplicate) {
      result.push({ index, periodKey, kind });
    }
  }

  return result;
}

/** Технические подписи — не импортировать как статьи бюджета. */
const TECHNICAL_BUDGET_CODE_LABELS = new Set([
  "вне банка",
  "разные",
  "ebit",
  "прибыль до но",
]);

function forwardFillHeaderCells(cells: string[]): string[] {
  let last = "";
  return cells.map((cell) => {
    const trimmed = cell.trim();
    if (trimmed) last = trimmed;
    return last;
  });
}

/** Ячейка заголовка «Код» (без «код вне банка» и прочих служебных колонок). */
function cellMatchesBudgetCodeHeader(cell: string): boolean {
  const h = normalizeHeader(cell);
  if (!h || isExcludedFinanceBudgetCodeHeader(h)) return false;
  return h === "код" || h === "код бюджета";
}

/** Ячейка заголовка «Статьи бюджета». */
function cellMatchesBudgetArticleHeader(cell: string): boolean {
  const h = normalizeHeader(cell);
  if (!h) return false;
  return (
    h === "статьи бюджета" ||
    h === "статья бюджета" ||
    h.includes("статьи бюджета") ||
    h.includes("статья бюджета")
  );
}

/**
 * Первая строка, где одновременно есть колонки «Код» и «Статьи бюджета».
 * Строки выше не используются.
 */
export function detectFinanceBudgetHeaderRowIndex(rawRows: unknown[][]): number {
  const limit = Math.min(FINANCE_BUDGET_CSV_HEADER_SCAN_LIMIT, rawRows.length);

  for (let i = 0; i < limit; i += 1) {
    const row = rawRows[i];
    if (!Array.isArray(row) || !row.some((c) => String(c ?? "").trim() !== "")) continue;

    const cells = row.map((c) => String(c ?? "").trim());
    const filled = forwardFillHeaderCells(cells);

    const hasCode = filled.some((c) => cellMatchesBudgetCodeHeader(c));
    const hasArticles = filled.some((c) => cellMatchesBudgetArticleHeader(c));
    if (hasCode && hasArticles) return i;
  }

  return -1;
}

/** Колонка «Статьи бюджета» — приоритет над общими «статья» / «наименование». */
export function findFinanceBudgetArticleColumnIndex(headers: string[]): number {
  const normalized = headers.map((h) => normalizeHeader(h));

  for (let index = 0; index < normalized.length; index += 1) {
    if (cellMatchesBudgetArticleHeader(headers[index] ?? "")) return index;
  }

  return -1;
}

export function isTechnicalFinanceBudgetCode(code: string): boolean {
  const n = normalizeHeader(code);
  if (!n) return true;
  return TECHNICAL_BUDGET_CODE_LABELS.has(n);
}

/** Код статьи бюджета: 1., 1.01., 2.05.10.1. и т.п. */
export function isValidFinanceBudgetArticleCode(code: string): boolean {
  const trimmed = code.trim().replace(/\s+/g, "");
  if (!trimmed || isTechnicalFinanceBudgetCode(trimmed)) return false;
  return /^\d+(\.\d+)*\.?$/.test(trimmed);
}

function resolveFinanceBudgetHeaderCells(rawRows: unknown[][], headerRowIndex: number): {
  headers: string[];
  dataStartRowIndex: number;
} {
  const primary = (rawRows[headerRowIndex] ?? []).map((c) => String(c ?? ""));
  const primaryMonths = detectFinanceBudgetMonthColumns(primary).length;
  if (primaryMonths >= 2) {
    return { headers: primary, dataStartRowIndex: headerRowIndex + 1 };
  }

  const secondary = (rawRows[headerRowIndex + 1] ?? []).map((c) => String(c ?? ""));
  if (!secondary.some((c) => c.trim())) {
    return { headers: primary, dataStartRowIndex: headerRowIndex + 1 };
  }

  const secondaryMonths = detectFinanceBudgetMonthColumns(secondary).length;
  const secondaryHasCode = secondary.some((c) => cellMatchesBudgetCodeHeader(c));
  const secondaryHasArticles = secondary.some((c) => cellMatchesBudgetArticleHeader(c));

  if (secondaryMonths >= 2 && !secondaryHasCode && !secondaryHasArticles) {
    const width = Math.max(primary.length, secondary.length);
    const merged: string[] = [];
    for (let i = 0; i < width; i += 1) {
      const top = primary[i]?.trim() ?? "";
      const bottom = secondary[i]?.trim() ?? "";
      merged.push(top && bottom ? `${top} ${bottom}`.trim() : top || bottom);
    }
    return { headers: merged, dataStartRowIndex: headerRowIndex + 2 };
  }

  return { headers: primary, dataStartRowIndex: headerRowIndex + 1 };
}

function logFinanceBudgetImportSummary(headerRowIndex: number, lines: FinanceBudgetLine[]): void {
  const codes = lines.map((line) => line.code.trim());
  console.group("[finance-budget-csv] Результат импорта");
  console.log("headerRowIndex:", headerRowIndex);
  console.log("количество найденных строк:", lines.length);
  console.log("первые 10 кодов:", codes.slice(0, 10));
  console.log("последние 10 кодов:", codes.slice(-10));
  console.groupEnd();
}

function stableBudgetLineId(code: string, name: string, rowIndex: number): string {
  const base = `${code.trim()}|${name.trim()}`.toLowerCase();
  const slug = base.replace(/[^a-z0-9\u0400-\u04ff]+/gi, "-").replace(/^-+|-+$/g, "");
  return slug ? `budget-${slug}` : `budget-row-${rowIndex}`;
}

function rowToBudgetLine(
  row: Record<string, string>,
  columnMap: FinanceBudgetColumnMap,
  monthColumns: FinanceBudgetMonthColumn[],
  rowIndex: number,
): { line: FinanceBudgetLine | null; skipReason: string | null } {
  const code = columnMap.code >= 0 ? String(row[`col_${columnMap.code}`] ?? "").trim() : "";
  const name = columnMap.name >= 0 ? String(row[`col_${columnMap.name}`] ?? "").trim() : "";

  if (!code) {
    return { line: null, skipReason: "Отсутствует код" };
  }
  if (isTechnicalFinanceBudgetCode(code)) {
    return { line: null, skipReason: `Техническая строка: ${code}` };
  }
  if (!isValidFinanceBudgetArticleCode(code)) {
    return { line: null, skipReason: `Некорректный код бюджета: ${code}` };
  }

  const monthlyPlanRub: Record<string, number> = {};
  const monthlyFactRub: Record<string, number> = {};

  for (const col of monthColumns) {
    const raw = row[`col_${col.index}`];
    const value = parseBudgetNumber(raw);
    if (value == null || value === 0) continue;
    if (col.kind === "fact") {
      monthlyFactRub[col.periodKey] = (monthlyFactRub[col.periodKey] ?? 0) + value;
    } else {
      monthlyPlanRub[col.periodKey] = (monthlyPlanRub[col.periodKey] ?? 0) + value;
    }
  }

  const versionOnTotal =
    columnMap.versionOn >= 0 ? parseBudgetNumber(row[`col_${columnMap.versionOn}`]) : null;
  const totalFromColumn =
    columnMap.totalPlan >= 0 ? parseBudgetNumber(row[`col_${columnMap.totalPlan}`]) : null;
  const totalFromMonths = Object.values(monthlyPlanRub).reduce((sum, value) => sum + value, 0);
  const totalPlanRub = versionOnTotal ?? totalFromColumn ?? (totalFromMonths > 0 ? totalFromMonths : undefined);

  const category =
    columnMap.category >= 0 ? String(row[`col_${columnMap.category}`] ?? "").trim() : "";
  const unit = columnMap.unit >= 0 ? String(row[`col_${columnMap.unit}`] ?? "").trim() : "";

  return {
    line: {
      id: stableBudgetLineId(code, name, rowIndex),
      code,
      name: name || code,
      category: category || undefined,
      unit: unit || undefined,
      totalPlanRub: totalPlanRub ?? undefined,
      monthlyPlanRub,
      monthlyFactRub: Object.keys(monthlyFactRub).length > 0 ? monthlyFactRub : undefined,
    },
    skipReason: null,
  };
}

function detectBudgetVersionFromRows(rawRows: unknown[][], headerRowIndex: number): string | undefined {
  const limit = Math.min(headerRowIndex, rawRows.length);
  for (let i = 0; i < limit; i += 1) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;
    const joined = row.map((c) => String(c ?? "").trim()).filter(Boolean).join(" ");
    const match = joined.match(/версия\s*(?:бюджета|на)?\s*[:№]?\s*([^\s;]+(?:\s+[^\s;]+)?)/i);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

export type FinanceBudgetCsvImportResult = {
  lines: FinanceBudgetLine[];
  audit: FinanceBudgetCsvImportAudit;
  budgetVersion?: string;
};

/** Разбор CSV бюджета проекта (только формат «Бюджет проекта»). */
export function importFinanceBudgetCsvFromRawRows(
  rawRows: unknown[][],
  sourceFileName?: string,
): FinanceBudgetCsvImportResult {
  const headerRowIndex = detectFinanceBudgetHeaderRowIndex(rawRows);

  const emptyAudit = (reason: string): FinanceBudgetCsvImportAudit => ({
    parsedRows: 0,
    loaded: 0,
    skipped: 0,
    errors: 1,
    headers: [],
    headerRowIndex: -1,
    columnMap: buildFinanceBudgetColumnMap([]),
    monthColumns: [],
    skippedRows: [{ rowIndex: -1, reason }],
  });

  if (headerRowIndex < 0) {
    return { lines: [], audit: emptyAudit("Не найдена строка заголовков с колонками «Код» и «Статьи бюджета»") };
  }

  const { headers: headerRaw, dataStartRowIndex } = resolveFinanceBudgetHeaderCells(rawRows, headerRowIndex);
  const columnMap = buildFinanceBudgetColumnMap(headerRaw);
  const monthColumns = detectFinanceBudgetMonthColumns(headerRaw);

  if (columnMap.code < 0 || columnMap.name < 0) {
    return {
      lines: [],
      audit: {
        ...emptyAudit("Не найдены колонки «Код» и «Статьи бюджета»"),
        headers: headerRaw,
        headerRowIndex,
        columnMap,
        monthColumns,
      },
    };
  }

  const dataRows = rawRows.slice(dataStartRowIndex);
  const lines: FinanceBudgetLine[] = [];
  const skippedRows: { rowIndex: number; reason: string }[] = [];
  let parsedRows = 0;

  for (let i = 0; i < dataRows.length; i += 1) {
    const raw = dataRows[i];
    if (!Array.isArray(raw) || !raw.some((c) => String(c ?? "").trim() !== "")) {
      skippedRows.push({ rowIndex: dataStartRowIndex + i, reason: "Пустая строка" });
      continue;
    }

    parsedRows += 1;
    const row: Record<string, string> = {};
    for (let col = 0; col < raw.length; col += 1) {
      row[`col_${col}`] = String(raw[col] ?? "").trim();
    }

    try {
      const { line, skipReason } = rowToBudgetLine(row, columnMap, monthColumns, dataStartRowIndex + i);
      if (!line) {
        skippedRows.push({
          rowIndex: dataStartRowIndex + i,
          reason: skipReason ?? "Строка пропущена",
        });
        continue;
      }
      lines.push(line);
    } catch (e) {
      skippedRows.push({
        rowIndex: dataStartRowIndex + i,
        reason: e instanceof Error ? e.message : "Ошибка разбора строки",
      });
    }
  }

  const audit: FinanceBudgetCsvImportAudit = {
    parsedRows,
    loaded: lines.length,
    skipped: skippedRows.length,
    errors: skippedRows.length,
    headers: headerRaw,
    headerRowIndex,
    columnMap,
    monthColumns,
    skippedRows,
  };

  console.log("[finance-budget-csv] import audit", {
    headerRowIndex,
    dataStartRowIndex,
    columnMap,
    codeColumnHeader: columnMap.code >= 0 ? headerRaw[columnMap.code] : null,
    nameColumnHeader: columnMap.name >= 0 ? headerRaw[columnMap.name] : null,
    versionOnColumnHeader: columnMap.versionOn >= 0 ? headerRaw[columnMap.versionOn] : null,
    monthColumns: monthColumns.map((c) => `${c.periodKey}:${c.kind}`),
    parsedRows,
    loaded: lines.length,
    skipped: skippedRows.length,
  });

  logFinanceBudgetImportSummary(headerRowIndex, lines);

  const planMonthColumnCount = monthColumns.filter((c) => c.kind === "plan").length;
  logFinanceBudgetImportCodeDiagnostics(lines, { planMonthColumnCount });

  const budgetVersion =
    detectBudgetVersionFromRows(rawRows, headerRowIndex) ??
    sourceFileName?.replace(/\.csv$/i, "");

  return { lines: cloneFinanceBudgetLines(lines), audit, budgetVersion };
}

/** Разбор CSV бюджета проекта (standalone ETL). */
export async function importFinanceBudgetCsv(file: File): Promise<FinanceBudgetCsvImportResult> {
  const rawRows = await readFinanceCsvRawRows(file);
  return importFinanceBudgetCsvFromRawRows(rawRows, file.name);
}

export function mergeFinanceBudgetImport(
  existing: FinanceBudgetLine[],
  imported: FinanceBudgetLine[],
): FinanceBudgetLine[] {
  const byCode = new Map<string, FinanceBudgetLine>();
  for (const line of existing) {
    const key = normalizeFinanceBudgetCode(line.code) || line.id;
    if (key) byCode.set(key, line);
  }
  for (const line of imported) {
    const key = normalizeFinanceBudgetCode(line.code) || line.id;
    if (key) byCode.set(key, line);
    else byCode.set(line.id, line);
  }
  return [...byCode.values()];
}
