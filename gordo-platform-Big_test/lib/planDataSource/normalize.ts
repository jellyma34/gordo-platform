function stripBom(s: string): string {
  if (!s) return "";
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s.replace(/^\uFEFF/, "");
}

/** Нормализация подписи сегмента / root-row (BOM, NBSP, ё, пробелы). */
export function normalizeEntityLabel(value: unknown): string {
  if (value == null) return "";
  return stripBom(String(value))
    .toLowerCase()
    .replace(/[\u00a0\u202f\u2009\u2007\u2008]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ё/g, "е")
    .trim();
}

/** Нормализация строк для сопоставления сегментов / типов / периодов. */
export function normalizeMatchKey(value: unknown): string {
  return normalizeEntityLabel(value);
}
