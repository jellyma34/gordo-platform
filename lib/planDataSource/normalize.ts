/** Нормализация строк для сопоставления сегментов / типов / периодов. */
export function normalizeMatchKey(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ё/g, "е");
}
