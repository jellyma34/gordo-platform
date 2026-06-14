/**
 * Универсальная нормализация заголовков RU CSV (Excel / BI export).
 * Multiline в кавычках, CRLF, trailing spaces, кавычки.
 */
export function normalizeCsvHeader(header: unknown): string {
  return String(header ?? "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/"/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Ключ колонки для Record (без переносов; trim). */
export function sanitizeCsvHeaderKey(header: unknown): string {
  return String(header ?? "")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/"/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Склейка без пробела после multiline split: «Планпроекта» → «планпроекта». */
export function compactCsvHeader(header: unknown): string {
  return normalizeCsvHeader(header).replace(/\s/g, "");
}

/** Известные «склеенные» RU-заголовки после битого multiline parse. */
const COLLAPSED_HEADER_LABELS: Record<string, string> = {
  планпроекта: "План проекта",
};

/**
 * Восстанавливает читаемый заголовок и ключ колонки (для Record).
 * После Papa.parse + normalize; multiline в кавычках не трогаем split('\n').
 */
export function repairCsvHeaderLabel(header: unknown): string {
  const sanitized = sanitizeCsvHeaderKey(header);
  const compact = compactCsvHeader(sanitized);
  return COLLAPSED_HEADER_LABELS[compact] ?? sanitized;
}
