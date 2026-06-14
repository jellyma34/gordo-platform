import Papa from "papaparse";
import {
  compactCsvHeader,
  normalizeCsvHeader,
  repairCsvHeaderLabel,
} from "@/lib/csvHeaderNormalize";

/** Предпочитаемый разделитель RU Excel-экспорта (`;` по умолчанию). */
export function detectRuPlanCsvDelimiter(text: string): string {
  const sample = text.slice(0, 12_000);
  const sc = (sample.match(/;/g) || []).length;
  const cc = (sample.match(/,/g) || []).length;
  const tc = (sample.match(/\t/g) || []).length;
  if (sc > 0 && sc >= cc && sc >= tc) return ";";
  if (tc > sc && tc >= cc) return "\t";
  if (cc > sc) return ",";
  return sc > 0 ? ";" : ",";
}

export type RuPlanCsvGrid = {
  delimiter: string;
  rawHeaders: string[];
  normalizedHeaders: string[];
  rows: Record<string, unknown>[];
};

function matrixFromPapa(text: string, delimiter: string): string[][] {
  const parsed = Papa.parse<string[]>(text, {
    delimiter,
    header: false,
    skipEmptyLines: "greedy",
    quoteChar: '"',
    escapeChar: '"',
  });
  return (parsed.data ?? []).filter((row) => row.some((c) => String(c ?? "").trim() !== ""));
}

export type RuCsvHeaderMatcher = (normalizedHeaderCells: string[]) => boolean;

export const ruPlanSalesHeaderMatcher: RuCsvHeaderMatcher = (norms) =>
  norms.some((n) => n.includes("наименован")) &&
  (norms.some((n) => n.includes("план")) || norms.length >= 3);

export const ruAreaWideTableHeaderMatcher: RuCsvHeaderMatcher = (norms) =>
  norms.some((n) => n.includes("наименован")) &&
  (norms.some((n) => n.includes("площад")) || norms.some((n) => n.includes("план")) || norms.length >= 3);

function findHeaderRowIndex(matrix: string[][], matcher: RuCsvHeaderMatcher): number {
  for (let i = 0; i < Math.min(matrix.length, 24); i++) {
    const row = matrix[i] ?? [];
    const norms = row.map((c) => normalizeCsvHeader(c));
    if (matcher(norms)) return i;
  }
  return 0;
}

/**
 * Разбор RU plan CSV: только Papa на полном rawText (без text.split('\\n')).
 * Сначала matrix (header:false, quoted multiline), затем header:true на срезе таблицы.
 */
export function parseRuCsvToGrid(text: string, headerMatcher: RuCsvHeaderMatcher = ruPlanSalesHeaderMatcher): RuPlanCsvGrid {
  const delimiter = detectRuPlanCsvDelimiter(text);
  const matrix = matrixFromPapa(text, delimiter);
  const headerIdx = findHeaderRowIndex(matrix, headerMatcher);
  const tableMatrix = matrix.slice(headerIdx);

  if (!tableMatrix.length) {
    return { delimiter, rawHeaders: [], normalizedHeaders: [], rows: [] };
  }

  const subText = Papa.unparse(tableMatrix, { delimiter, newline: "\r\n" });
  const parsed = Papa.parse<Record<string, unknown>>(subText, {
    delimiter,
    header: true,
    skipEmptyLines: "greedy",
    quoteChar: '"',
    escapeChar: '"',
    transformHeader: (h) => repairCsvHeaderLabel(h),
  });

  let rawHeaders = (parsed.meta.fields ?? []).map((h) => repairCsvHeaderLabel(h)).filter(Boolean);

  if (!rawHeaders.length) {
    const headerRow = (tableMatrix[0] ?? []).map((c) => repairCsvHeaderLabel(c));
    rawHeaders = headerRow.filter(Boolean);
  }

  const normalizedHeaders = rawHeaders.map((h) => normalizeCsvHeader(h));
  const rows = (parsed.data ?? []).filter((rec) =>
    Object.values(rec).some((v) => String(v ?? "").trim() !== ""),
  );

  return { delimiter, rawHeaders, normalizedHeaders, rows };
}

/** @deprecated Используйте {@link parseRuCsvToGrid} с {@link ruPlanSalesHeaderMatcher}. */
export function parseRuPlanCsvToGrid(text: string): RuPlanCsvGrid {
  return parseRuCsvToGrid(text, ruPlanSalesHeaderMatcher);
}
