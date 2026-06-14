/**
 * UI: даты в формате ДД-ММ-ГГГГ; хранение и API — ISO YYYY-MM-DD.
 */

export const RU_DATE_PLACEHOLDER = "ДД-ММ-ГГГГ";

const YEAR_MIN = 1900;
const YEAR_MAX = 2100;

/** Привести значение из API к YYYY-MM-DD (дата по UTC-календарю для ISO-строк со временем). */
export function toIsoDateOnly(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** ISO → ДД-ММ-ГГГГ (пустая строка, если не ISO). */
export function isoToRuDmy(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** Отображение в таблицах: ISO как ДД-ММ-ГГГГ, иначе как есть или «—». */
export function formatStoredDateForUi(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  const day = toIsoDateOnly(value);
  if (day) return isoToRuDmy(day);
  return String(value);
}

/** Только цифры из ввода; поддержка вставки ISO и ДД.ММ.ГГГГ / ДД/ММ/ГГГГ. */
export function normalizePastedOrTypedToDigits(raw: string): string {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split("-");
    return `${d}${m}${y}`;
  }
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/.test(t)) {
    const parts = t.split(/[./-]/).filter(Boolean);
    if (parts.length === 3) {
      const d0 = parts[0]!.padStart(2, "0");
      const m0 = parts[1]!.padStart(2, "0");
      const y0 = parts[2]!;
      return `${d0}${m0}${y0}`;
    }
  }
  return t.replace(/\D/g, "");
}

/** Маска: до 8 цифр → ДД-ММ-ГГГГ (частично допустимо). */
export function digitsToDmyFormatted(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`;
}

/**
 * Разбор полной строки ДД-ММ-ГГГГ → ISO или null (невалидный день/месяц/год).
 */
export function parseRuDmyToIso(dmy: string): string | null {
  const digits = dmy.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const day = parseInt(digits.slice(0, 2), 10);
  const month = parseInt(digits.slice(2, 4), 10);
  const year = parseInt(digits.slice(4, 8), 10);
  if (year < YEAR_MIN || year > YEAR_MAX) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
