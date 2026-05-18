import { parseRuNumber } from "@/src/shared/lib/csv/parseInvestorsCsv";

export const APARTMENTS_PRICE_COLUMN_WARNING =
  "Не найдена колонка стоимости квартир для расчёта доли выручки.";

function normalizeApartmentsHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\s_\u00a0.\-/]+/g, "");
}

const EXACT_PRICE_HEADERS = new Set([
  "стоимость",
  "цена",
  "сумма",
  "totalprice",
  "fullprice",
  "ценаквартиры",
  "стоимостьквартиры",
  "ценаполная",
  "полнаяцена",
  "стоимостькв",
]);

/**
 * Индекс колонки стоимости квартиры в CSV квартир (-1 если не найдена).
 */
export function findApartmentsPriceColumnIndex(headers: string[]): number {
  const normalized = headers.map(normalizeApartmentsHeader);
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    if (!h) continue;
    if (EXACT_PRICE_HEADERS.has(h)) return i;
    for (const p of ["totalprice", "fullprice", "стоимость", "ценаквартир", "стоимостьквартир"]) {
      if (h.includes(p)) return i;
    }
  }
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    if (!h) continue;
    if (h.includes("м2") || h.includes("квм") || h.includes("площад")) continue;
    if ((h.includes("стоим") || h === "цена" || h.startsWith("цена")) && h.length <= 24) return i;
  }
  return -1;
}

export type ApartmentsCsvRevenuePool = {
  totalRevenue: number;
  priceColumnIndex: number | null;
  priceColumnLabel: string | null;
};

/** Сумма стоимости всех квартир из CSV (потенциальная выручка пула). */
export function sumApartmentsCsvTotalRevenue(headers: string[], rows: string[][]): ApartmentsCsvRevenuePool {
  const priceColumnIndex = findApartmentsPriceColumnIndex(headers);
  if (priceColumnIndex < 0) {
    return { totalRevenue: 0, priceColumnIndex: null, priceColumnLabel: null };
  }
  let totalRevenue = 0;
  for (const row of rows) {
    const n = parseRuNumber(row[priceColumnIndex]);
    if (Number.isFinite(n) && n > 0) totalRevenue += n;
  }
  return {
    totalRevenue,
    priceColumnIndex,
    priceColumnLabel: headers[priceColumnIndex]?.trim() || null,
  };
}

/** Доля выручки проданных квартир от всего пула CSV (0–1). */
export function apartmentRevenueShareFromCsvPool(
  soldRevenueRub: number,
  pool: ApartmentsCsvRevenuePool | null | undefined,
): number | null {
  if (!pool || pool.priceColumnIndex == null || pool.totalRevenue <= 0) return null;
  if (!Number.isFinite(soldRevenueRub) || soldRevenueRub < 0) return 0;
  return soldRevenueRub / pool.totalRevenue;
}
