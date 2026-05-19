/**
 * CSV из Excel (RU): UTF-8 или Windows-1251 / cp1251 и распознавание строки заголовка (инвесторский и др. модули).
 */

function stripLeadingBom(s: string): string {
  if (s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s.replace(/^\uFEFF/, "");
}

function firstNonEmptyLine(s: string): string {
  for (const line of s.split(/\r?\n/)) {
    if (line.replace(/\ufeff/g, "").trim()) return line;
  }
  return "";
}

function cyrillicCharCount(s: string): number {
  return (s.match(/[\u0400-\u04FF]/g) || []).length;
}

function csvHeaderLooksRussian(line: string): boolean {
  const n = line.toLowerCase().replace(/ё/g, "е");
  return (
    n.includes("наимен") ||
    n.includes("план") ||
    n.includes("факт") ||
    n.includes("количество") ||
    (n.includes("год") && n.includes("месяц")) ||
    n.includes("квартир")
  );
}

/**
 * Декодирует бинарный CSV: UTF-8 (в т.ч. с BOM); при невалидном UTF-8 или явном выигрыше cp1251 по кириллице — Windows-1251.
 */
export function decodeRuCsvArrayBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return stripLeadingBom(new TextDecoder("utf-8").decode(buffer));
  }

  let utf8: string;
  try {
    utf8 = stripLeadingBom(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } catch {
    return stripLeadingBom(new TextDecoder("windows-1251").decode(buffer));
  }

  const from1251 = stripLeadingBom(new TextDecoder("windows-1251").decode(buffer));
  const sampleLen = Math.min(utf8.length, 4096);
  const headU = utf8.slice(0, sampleLen);
  const headC = from1251.slice(0, sampleLen);
  const cyU = cyrillicCharCount(headU);
  const cyC = cyrillicCharCount(headC);
  const lineU = firstNonEmptyLine(headU);
  const lineC = firstNonEmptyLine(headC);
  const nonAsciiU = (headU.match(/[^\x00-\x7F\s;,\t"]/g) || []).length;

  const repl = (headU.match(/\uFFFD/g) || []).length;
  if (repl > 0) return from1251;
  if (csvHeaderLooksRussian(lineC) && !csvHeaderLooksRussian(lineU)) return from1251;
  if (cyC >= 3 && cyU === 0 && nonAsciiU > 0) return from1251;
  if (cyC >= cyU + 3) return from1251;

  return utf8;
}

/** @deprecated то же, что {@link decodeRuCsvArrayBuffer}. */
export const decodeInvestorsCsvArrayBuffer = decodeRuCsvArrayBuffer;

export async function readInvestorsCsvFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return decodeRuCsvArrayBuffer(buffer);
}

export async function readMarketingCsvFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return decodeRuCsvArrayBuffer(buffer);
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
function normalizeRuMoneyToken(raw: string): string {
  let s = raw
    .replace(/[\s\u00a0\u202f\u2009\u2007\u2008\u200a\u200b]+/g, "")
    .replace(/руб\.?/giu, "")
    .replace(/₽/g, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  return s.replace(/[^\d.-]/g, "");
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== "string") {
    return 0;
  }
  const token = normalizeRuMoneyToken(value.trim());
  if (!token || token === "-" || token === ".") return 0;
  const n = Number(token);
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
