/**
 * Инвесторский CSV: декодирование (UTF-8 vs Windows-1251) и распознавание строки заголовка.
 */

const REPLACEMENT_CHAR = "\uFFFD";

function stripLeadingBom(s: string): string {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s.replace(/^\uFEFF/, "");
}

/**
 * Декодирует бинарный CSV: сначала UTF-8; при большом числе символов замены — Windows-1251.
 */
export function decodeInvestorsCsvArrayBuffer(buffer: ArrayBuffer): string {
  try {
    let raw = new TextDecoder("utf-8").decode(buffer);
    raw = stripLeadingBom(raw);
    const brokenCount = (raw.match(new RegExp(REPLACEMENT_CHAR, "g")) || []).length;
    if (brokenCount > 10) {
      raw = new TextDecoder("windows-1251").decode(buffer);
      raw = stripLeadingBom(raw);
    }
    return raw;
  } catch {
    let raw = new TextDecoder("windows-1251").decode(buffer);
    raw = stripLeadingBom(raw);
    return raw;
  }
}

export async function readInvestorsCsvFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return decodeInvestorsCsvArrayBuffer(buffer);
}

/**
 * Строка заголовка: только includes(), без точного совпадения ячеек.
 */
export function isInvestorsCsvHeaderLine(line: string): boolean {
  const normalized = stripLeadingBom(line).replace(/\r$/, "").trim().toLowerCase();
  return (
    normalized.includes("год") &&
    normalized.includes("месяц") &&
    normalized.includes("квартир")
  );
}

/**
 * Служебные подписи в колонке «месяц» (итоги Excel, отклонения, доп. блоки) —
 * пропускать строку без предупреждений.
 */
export function shouldSilentlySkipInvestorsCsvMonthLabel(monthRaw: string): boolean {
  const m = stripLeadingBom(monthRaw)
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
  if (!m) return true;
  if (m.includes("итого")) return true;
  if (m.includes("отклонение")) return true;
  if (m.includes("расторж")) return true;
  if (m.includes("доп.")) return true;
  if (m.startsWith("доп ") || m.includes("дополн")) return true;
  return false;
}

/**
 * Нормализация числа для графиков и агрегации: только `number` или строка вида «39 314 694,00», «26,5».
 * Объекты и прочие типы — 0 (см. {@link parseRuNumber} для ячеек CSV).
 */
export function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== "string") {
    return 0;
  }
  const n = Number(
    value
      .replace(/[\s\u00a0\u202f\u2009]+/g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, ""),
  );
  return Number.isFinite(n) ? n : 0;
}

/**
 * Суммы в формате «39 314 694,00» (пробелы / NBSP, запятая — десятичный разделитель).
 * Для произвольных значений ячеек CSV (не только string/number).
 */
export function parseRuNumber(value: unknown): number {
  if (typeof value === "number" || typeof value === "string") {
    return toNumber(value);
  }
  if (value == null) return 0;
  return toNumber(String(value).trim());
}
