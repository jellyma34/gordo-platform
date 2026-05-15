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
 * Суммы в формате «39 314 694,00» (пробелы / NBSP, запятая — десятичный разделитель).
 */
export function parseRuNumber(value: unknown): number {
  if (value == null) return 0;
  const str = String(value)
    .trim()
    .replace(/[\s\u00a0\u202f]+/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const num = Number(str);
  return Number.isFinite(num) ? num : 0;
}
