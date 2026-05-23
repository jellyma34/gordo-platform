import { normalizeMonthKey } from "@/lib/normalizeMonthKey";

/** RU-месяцы для прогноза рассрочки (аббревиатуры и короткие формы). */
export const RU_FORECAST_MONTHS: Record<string, string> = {
  янв: "01",
  январь: "01",
  фев: "02",
  февраль: "02",
  мар: "03",
  март: "03",
  апр: "04",
  апрель: "04",
  май: "05",
  мая: "05",
  июн: "06",
  июнь: "06",
  июл: "07",
  июль: "07",
  авг: "08",
  август: "08",
  сен: "09",
  сент: "09",
  сентябрь: "09",
  окт: "10",
  октябрь: "10",
  ноя: "11",
  ноябрь: "11",
  дек: "12",
  декабрь: "12",
};

function ruMonthCode(ruMonth: string): string | null {
  const key = ruMonth.toLowerCase().replace(/ё/g, "е").trim();
  if (!key) return null;
  return RU_FORECAST_MONTHS[key] ?? RU_FORECAST_MONTHS[key.slice(0, 3)] ?? null;
}

function normalizeRuDotYear(raw: string): string | null {
  const ruMatch = raw.match(/^([а-я]+)\.(\d{2,4})$/i);
  if (!ruMatch) return null;

  const [, ruMonth, yearRaw] = ruMatch;
  const month = ruMonthCode(ruMonth);
  if (!month) return null;

  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  if (!/^\d{4}$/.test(year)) return null;

  return `${year}-${month}`;
}

/**
 * Канонический ключ месяца прогноза `YYYY-MM`.
 * Поддерживает: `2026-05`, `05.2026`, `май.26`, `май 26`, `май.2026`, `май-26`, в т.ч. внутри шапки «План май.26».
 */
export function normalizeForecastMonth(value: string | null | undefined): string | null {
  if (value == null) return null;
  const rawOriginal = String(value).trim();
  if (!rawOriginal) return null;

  const raw = rawOriginal
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim()
    .replace(/,/g, ".")
    .replace(/-/g, ".")
    .replace(/\s+/g, ".");

  let normalized = normalizeRuDotYear(raw);

  if (!normalized) {
    const embedded = raw.match(/([а-я]+)\.(\d{2,4})/i);
    if (embedded) {
      normalized = normalizeRuDotYear(`${embedded[1]}.${embedded[2]}`);
    }
  }

  if (!normalized) {
    normalized = normalizeMonthKey(rawOriginal);
  }

  if (normalized) {
    console.log("FORECAST MONTH", rawOriginal, normalized);
  }

  return normalized;
}
