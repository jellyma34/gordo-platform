import Papa from "papaparse";

import { readCsvFileTextSmart } from "@/lib/csvTextEncoding";

export const FINANCE_CSV_DELIMITER = ";";

export const FINANCE_CSV_HEADER_SCAN_LIMIT = 120;

export const FINANCE_CSV_UNKNOWN_FORMAT_MESSAGE =
  "Не удалось определить формат CSV. Ожидается «Бюджет проекта» (колонки «Код» и «Статьи бюджета») или «Исполнение бюджета» (заголовки «Исполнение бюджета» / «Объекты продажи»).";

function normalizeFinanceCsvCell(value: unknown): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cellMatchesBudgetExecutionMarker(cell: string): boolean {
  const normalized = normalizeFinanceCsvCell(cell);
  if (!normalized) return false;
  return (
    normalized === "исполнение бюджета" ||
    normalized.includes("исполнение бюджета") ||
    normalized === "объекты продажи" ||
    normalized.includes("объекты продажи")
  );
}

function detectFinanceCsvDelimiter(text: string): string {
  const sampleLines = text.split(/\r?\n/).slice(0, 40);
  let semicolonCount = 0;
  let commaCount = 0;

  for (const line of sampleLines) {
    semicolonCount += (line.match(/;/g) ?? []).length;
    commaCount += (line.match(/,/g) ?? []).length;
  }

  return semicolonCount >= commaCount ? ";" : ",";
}

export function parseFinanceCsvTextToRawRows(text: string): unknown[][] {
  const delimiter = detectFinanceCsvDelimiter(text);
  const parsed = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: false,
  });

  if (parsed.errors.length > 0) {
    console.warn("[finance-csv] Papa errors:", parsed.errors.slice(0, 5));
  }

  if (delimiter !== FINANCE_CSV_DELIMITER) {
    console.warn(`[finance-csv] автоматически выбран разделитель «${delimiter}»`);
  }

  return (parsed.data ?? []) as unknown[][];
}

export async function readFinanceCsvRawRows(file: File): Promise<unknown[][]> {
  const text = await readCsvFileTextSmart(file);
  return parseFinanceCsvTextToRawRows(text);
}

export function detectFinanceBudgetExecutionMarkers(rawRows: unknown[][]): boolean {
  const limit = Math.min(FINANCE_CSV_HEADER_SCAN_LIMIT, rawRows.length);

  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const row = rawRows[rowIndex];
    if (!Array.isArray(row) || !row.some((cell) => String(cell ?? "").trim() !== "")) continue;

    for (const cell of row) {
      if (cellMatchesBudgetExecutionMarker(String(cell ?? ""))) return true;
    }
  }

  return false;
}
