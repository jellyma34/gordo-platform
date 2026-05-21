import Papa from "papaparse";

import type { DealsAnalyticsSegmentKey } from "@/lib/buildDealsSegmentMonthAnalytics";
import type { FactRevenueBySegment } from "@/lib/getFactRevenueBySegment";
import { parseSalesExecutionMoneyCell } from "@/lib/transformSalesExecutionCsv";

export type RevenueFactRow = {
  /** Значение колонки «Наименование». */
  name: string;
  /** Факт поступлений по строке, ₽. */
  factRevenueRub: number;
  /** Сегмент после маппинга; null — строка не попала в агрегат. */
  segment: DealsAnalyticsSegmentKey | null;
};

export type RevenueFactSummary = {
  /** Учтённые строки (валидное имя + сумма > 0 + известный сегмент). */
  rowCount: number;
  /** Пропущено (пусто, битая сумма, неизвестный тип, тех. строки). */
  skippedCount: number;
  bySegment: FactRevenueBySegment;
  /** Сумма по строкам с неизвестным «Наименованием». */
  unmappedRub: number;
};

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function preprocessCell(raw: string | undefined | null): string {
  return stripBom(String(raw ?? ""))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeaderKey(raw: string): string {
  return preprocessCell(raw)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/_/g, " ");
}

function normalizeNameLabel(raw: string): string {
  return normalizeHeaderKey(raw);
}

function findColIndex(headers: string[], matcher: (h: string) => boolean): number | null {
  for (let i = 0; i < headers.length; i++) {
    const h = normalizeHeaderKey(headers[i] ?? "");
    if (matcher(h)) return i;
  }
  return null;
}

/** CSV «Наименование» + «Факт поступлений». */
export function detectRevenueFactCsvHeader(headers: string[]): boolean {
  const keys = headers.map(normalizeHeaderKey);
  const hasName = keys.some((h) => h === "наименование" || h.startsWith("наименован"));
  const hasFact = keys.some((h) => h.includes("факт") && h.includes("поступлен"));
  return hasName && hasFact;
}

function resolveRevenueFactColumns(headers: string[]): { name: number; fact: number } | null {
  if (!detectRevenueFactCsvHeader(headers)) return null;
  const name = findColIndex(headers, (h) => h === "наименование" || h.startsWith("наименован"));
  const fact = findColIndex(headers, (h) => h.includes("факт") && h.includes("поступлен"));
  if (name == null || fact == null) return null;
  return { name, fact };
}

function detectCsvDelimiter(firstDataLine: string): string {
  const semi = (firstDataLine.match(/;/g) ?? []).length;
  const comma = (firstDataLine.match(/,/g) ?? []).length;
  return semi >= comma ? ";" : ",";
}

function isFooterOrTechnicalRow(firstCell: string): boolean {
  const t = normalizeHeaderKey(firstCell);
  if (!t) return true;
  return t.startsWith("итого") || t.startsWith("всего") || t.includes("примечан") || t.includes("технич");
}

/** Парсинг суммы из колонки «Факт поступлений»: пробелы, ₽, запятая как десятичный разделитель. */
export function parseRevenueFactAmountCell(raw: string | undefined | null): number {
  const n = parseSalesExecutionMoneyCell(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Маппинг «Наименование» → сегмент карточки «Структура продаж».
 * Неизвестные значения → null (не падаем).
 */
export function mapRevenueFactNameToSegment(nameRaw: string): DealsAnalyticsSegmentKey | null {
  const n = normalizeNameLabel(nameRaw);
  if (!n) return null;

  if (n === "квартира" || n === "квартиры" || n.includes("квартир")) return "apartment";

  if (
    n === "машиноместо" ||
    n === "машино-место" ||
    n === "машино место" ||
    n.includes("машиномест") ||
    n === "парковка" ||
    n === "паркинг" ||
    n.includes("парков") ||
    n.includes("паркинг")
  ) {
    return "parking";
  }

  if (n === "кладовка" || n === "кладовые" || n.includes("кладов")) return "storage";

  if (
    n === "коммерция" ||
    n === "коммерческое помещение" ||
    n === "коммерческие помещения" ||
    n.includes("коммерческ") ||
    n === "коммерч"
  ) {
    return "commercial";
  }

  return null;
}

const EMPTY_BY_SEGMENT = (): FactRevenueBySegment => ({
  apartment: 0,
  parking: 0,
  storage: 0,
  commercial: 0,
});

/** Агрегация распознанных строк по сегментам. */
export function buildRevenueFactSummary(rows: RevenueFactRow[]): RevenueFactSummary {
  const bySegment = EMPTY_BY_SEGMENT();
  let rowCount = 0;
  let skippedCount = 0;
  let unmappedRub = 0;

  for (const row of rows) {
    const amount = Number.isFinite(row.factRevenueRub) ? row.factRevenueRub : 0;
    if (amount <= 0) {
      skippedCount += 1;
      continue;
    }
    if (row.segment == null) {
      skippedCount += 1;
      unmappedRub += amount;
      continue;
    }
    bySegment[row.segment] += amount;
    rowCount += 1;
  }

  return { rowCount, skippedCount, bySegment, unmappedRub };
}

export type ParseRevenueFactCsvOk = {
  ok: true;
  rows: RevenueFactRow[];
  summary: RevenueFactSummary;
  warnings: string[];
};

export type ParseRevenueFactCsvFail = {
  ok: false;
  error: string;
  warnings: string[];
};

export type ParseRevenueFactCsvResult = ParseRevenueFactCsvOk | ParseRevenueFactCsvFail;

/**
 * Парсер CSV факта поступлений для «Структура продаж»:
 * колонки «Наименование», «Факт поступлений».
 */
export function parseRevenueFactCsv(text: string): ParseRevenueFactCsvResult {
  const trimmed = stripBom(String(text ?? "").trim());
  if (!trimmed) {
    return { ok: false, error: "Файл пустой.", warnings: [] };
  }

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const delimiter = lines.length > 1 ? detectCsvDelimiter(lines[1]!) : ";";

  const parsed = Papa.parse<string[]>(trimmed, {
    delimiter,
    skipEmptyLines: true,
    header: false,
  });

  const warnings: string[] = [];
  const data = (parsed.data ?? []).filter((row) => Array.isArray(row) && row.some((c) => preprocessCell(c) !== ""));

  if (data.length < 2) {
    return {
      ok: false,
      error: "Ожидается CSV с заголовком: Наименование;Факт поступлений (минимум одна строка данных).",
      warnings,
    };
  }

  let headerRowIndex = 0;
  let col: ReturnType<typeof resolveRevenueFactColumns> = null;
  for (let i = 0; i < Math.min(data.length, 8); i++) {
    const hdr = (data[i] ?? []).map((c) => preprocessCell(c));
    const c = resolveRevenueFactColumns(hdr);
    if (c) {
      headerRowIndex = i;
      col = c;
      break;
    }
  }

  if (!col) {
    return {
      ok: false,
      error: "Не найдены колонки «Наименование» и «Факт поступлений».",
      warnings,
    };
  }

  const rows: RevenueFactRow[] = [];

  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i] ?? [];
    const name = preprocessCell(row[col.name]);
    if (isFooterOrTechnicalRow(name)) continue;
    if (!name) continue;

    const factRaw = row[col.fact];
    const factRevenueRub = parseRevenueFactAmountCell(factRaw);
    if (factRevenueRub <= 0) continue;

    const segment = mapRevenueFactNameToSegment(name);
    rows.push({ name, factRevenueRub, segment });
  }

  const summary = buildRevenueFactSummary(rows);

  if (summary.rowCount === 0) {
    return {
      ok: false,
      error: "В файле нет строк с распознанным типом объекта и суммой «Факт поступлений».",
      warnings,
    };
  }

  if (summary.unmappedRub > 0) {
    warnings.push(
      `Не сопоставлено с сегментом: ${summary.skippedCount} строк(и), ${Math.round(summary.unmappedRub).toLocaleString("ru-RU")} ₽.`,
    );
  }

  return { ok: true, rows, summary, warnings };
}
