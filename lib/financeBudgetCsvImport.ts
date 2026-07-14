import Papa from "papaparse";

import { readCsvFileTextSmart } from "@/lib/csvTextEncoding";
import {
  cloneFinanceBudgetLines,
  logFinanceBudgetImportCodeDiagnostics,
  normalizeFinanceBudgetCode,
  type FinanceBudgetLine,
} from "@/lib/financeBudgetData";
import { normalizeForecastMonth } from "@/lib/normalizeForecastMonth";

export const FINANCE_BUDGET_CSV_DELIMITER = ";";

export const FINANCE_BUDGET_CSV_HEADER_SCAN_LIMIT = 30;

export const FINANCE_BUDGET_CSV_HEADER_MIN_SIGNATURES = 2;

export type FinanceBudgetColumnKey = "code" | "name" | "category" | "unit" | "totalPlan";

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
  { key: "name", patterns: ["наименование статьи", "наименование", "статья", "название", "показатель"] },
  { key: "category", patterns: ["раздел", "группа", "блок", "тип"] },
  { key: "unit", patterns: ["ед. изм", "ед изм", "единица измерения"] },
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

/** Колонка «Наименование» — точное совпадение в приоритете. */
export function findFinanceBudgetNameColumnIndex(headers: string[]): number {
  const normalized = headers.map((h) => normalizeHeader(h));

  const exactIdx = normalized.findIndex((h) => h === "наименование");
  if (exactIdx >= 0) return exactIdx;

  const articleIdx = normalized.findIndex((h) => h === "наименование статьи");
  if (articleIdx >= 0) return articleIdx;

  for (const { patterns } of [{ patterns: ["наименование", "статья", "название", "показатель"] }]) {
    const sorted = [...patterns].sort((a, b) => b.length - a.length);
    for (const pattern of sorted) {
      const idx = normalized.findIndex((h) => h.includes(pattern));
      if (idx >= 0) return idx;
    }
  }

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

function scoreFinanceBudgetHeaderRow(row: unknown[]): number {
  const cells = row.map((c) => normalizeHeader(String(c ?? "")));
  let score = 0;

  if (cells.some((h) => h === "код")) score += 4;
  else if (cells.some((h) => h === "код бюджета")) score += 3;
  else if (cells.some((h) => h.includes("код") && !isExcludedFinanceBudgetCodeHeader(h))) score += 1;

  if (cells.some((h) => h === "наименование")) score += 3;
  else if (cells.some((h) => h.includes("наименован") || h.includes("статья"))) score += 1;

  const monthLike = cells.filter((h) => extractPeriodKeyFromHeader(h) != null).length;
  if (monthLike >= 2) score += 2;
  else if (monthLike >= 1) score += 1;

  return score;
}

export function detectFinanceBudgetHeaderRowIndex(rawRows: unknown[][]): number {
  const limit = Math.min(FINANCE_BUDGET_CSV_HEADER_SCAN_LIMIT, rawRows.length);
  let bestIndex = -1;
  let bestScore = 0;

  for (let i = 0; i < limit; i += 1) {
    const row = rawRows[i];
    if (!Array.isArray(row) || !row.some((c) => String(c ?? "").trim() !== "")) continue;
    const score = scoreFinanceBudgetHeaderRow(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestScore >= 4 ? bestIndex : -1;
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
): FinanceBudgetLine | null {
  const code = columnMap.code >= 0 ? String(row[`col_${columnMap.code}`] ?? "").trim() : "";
  const name = columnMap.name >= 0 ? String(row[`col_${columnMap.name}`] ?? "").trim() : "";
  if (!code && !name) return null;

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

  const totalFromColumn =
    columnMap.totalPlan >= 0 ? parseBudgetNumber(row[`col_${columnMap.totalPlan}`]) : null;
  const totalFromMonths = Object.values(monthlyPlanRub).reduce((sum, value) => sum + value, 0);
  const totalPlanRub = totalFromColumn ?? (totalFromMonths > 0 ? totalFromMonths : undefined);

  const category =
    columnMap.category >= 0 ? String(row[`col_${columnMap.category}`] ?? "").trim() : "";
  const unit = columnMap.unit >= 0 ? String(row[`col_${columnMap.unit}`] ?? "").trim() : "";

  return {
    id: stableBudgetLineId(code, name, rowIndex),
    code: code || name,
    name: name || code,
    category: category || undefined,
    unit: unit || undefined,
    totalPlanRub: totalPlanRub ?? undefined,
    monthlyPlanRub,
    monthlyFactRub: Object.keys(monthlyFactRub).length > 0 ? monthlyFactRub : undefined,
  };
}

export type FinanceBudgetCsvImportResult = {
  lines: FinanceBudgetLine[];
  audit: FinanceBudgetCsvImportAudit;
};

/** Разбор CSV бюджета проекта (standalone ETL). */
export async function importFinanceBudgetCsv(file: File): Promise<FinanceBudgetCsvImportResult> {
  const text = await readCsvFileTextSmart(file);
  const parsed = Papa.parse<string[]>(text, {
    delimiter: FINANCE_BUDGET_CSV_DELIMITER,
    skipEmptyLines: false,
  });

  if (parsed.errors.length > 0) {
    console.warn("[finance-budget-csv] Papa errors:", parsed.errors.slice(0, 5));
  }

  const rawRows = (parsed.data ?? []) as unknown[][];
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
    return { lines: [], audit: emptyAudit("Не найдена строка заголовков бюджета") };
  }

  const headerRaw = (rawRows[headerRowIndex] ?? []).map((c) => String(c ?? ""));
  const columnMap = buildFinanceBudgetColumnMap(headerRaw);
  const monthColumns = detectFinanceBudgetMonthColumns(headerRaw);

  if (columnMap.code < 0 && columnMap.name < 0) {
    return {
      lines: [],
      audit: {
        ...emptyAudit("Не найдены колонки «Код» и «Наименование»"),
        headers: headerRaw,
        headerRowIndex,
        columnMap,
        monthColumns,
      },
    };
  }

  const dataRows = rawRows.slice(headerRowIndex + 1);
  const lines: FinanceBudgetLine[] = [];
  const skippedRows: { rowIndex: number; reason: string }[] = [];
  let parsedRows = 0;

  for (let i = 0; i < dataRows.length; i += 1) {
    const raw = dataRows[i];
    if (!Array.isArray(raw) || !raw.some((c) => String(c ?? "").trim() !== "")) continue;

    parsedRows += 1;
    const row: Record<string, string> = {};
    for (let col = 0; col < raw.length; col += 1) {
      row[`col_${col}`] = String(raw[col] ?? "").trim();
    }

    try {
      const line = rowToBudgetLine(row, columnMap, monthColumns, headerRowIndex + 1 + i);
      if (!line) {
        skippedRows.push({ rowIndex: headerRowIndex + 1 + i, reason: "Пустой код и наименование" });
        continue;
      }
      lines.push(line);
    } catch (e) {
      skippedRows.push({
        rowIndex: headerRowIndex + 1 + i,
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
    columnMap,
    codeColumnHeader: columnMap.code >= 0 ? headerRaw[columnMap.code] : null,
    nameColumnHeader: columnMap.name >= 0 ? headerRaw[columnMap.name] : null,
    monthColumns: monthColumns.map((c) => `${c.periodKey}:${c.kind}`),
    parsedRows,
    loaded: lines.length,
    skipped: skippedRows.length,
  });

  const planMonthColumnCount = monthColumns.filter((c) => c.kind === "plan").length;
  logFinanceBudgetImportCodeDiagnostics(lines, { planMonthColumnCount });

  return { lines: cloneFinanceBudgetLines(lines), audit };
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
