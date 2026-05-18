import { normalizeCsvHeaderLabel } from "@/lib/marketingInvestorsCsv";
import { preprocessCell } from "@/lib/salesPlanExecutionCsv";
import {
  parseRuNumber,
  shouldSilentlySkipInvestorsCsvMonthLabel,
} from "@/src/shared/lib/csv/parseInvestorsCsv";

export const APARTMENTS_PRICE_COLUMN_WARNING =
  "Не найдена колонка стоимости квартир для расчёта доли выручки.";

/** Явные имена агрегированной колонки выручки по квартирам. */
const AGGREGATED_APARTMENTS_SUM_KEYS = new Set(["квартирысумма", "apartmentssum"]);

function normCell(s: string): string {
  return normalizeCsvHeaderLabel(s);
}

function findYearMonthColumns(headers: string[]): { year: number; month: number } | null {
  let year = -1;
  let month = -1;
  for (let i = 0; i < headers.length; i++) {
    const n = normCell(headers[i] ?? "");
    if (n === "год" || n === "year") year = i;
    else if (n.includes("год") && !n.includes("месяц") && year < 0) year = i;
  }
  for (let i = 0; i < headers.length; i++) {
    const n = normCell(headers[i] ?? "");
    if (n === "месяц" || n === "month") month = i;
  }
  if (year < 0 || month < 0) return null;
  return { year, month };
}

/** Агрегированный wide-table CSV (год / месяц / «квартиры сумма»). */
export function isAggregatedApartmentsCsv(headers: string[]): boolean {
  if (findAggregatedApartmentsSumColumnIndex(headers) < 0) return false;
  return findYearMonthColumns(headers) != null;
}

/**
 * Колонка «квартиры сумма» (агрегированная выручка по квартирам).
 * Приоритет: точное имя → квартиры + сумма (без паркинга/кладовых/коммерции).
 */
export function findAggregatedApartmentsSumColumnIndex(headers: string[]): number {
  const normalized = headers.map((h) => normCell(h));
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    if (!h) continue;
    if (AGGREGATED_APARTMENTS_SUM_KEYS.has(h)) return i;
  }
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    if (!h) continue;
    if (h.includes("итого") || h.includes("расторж")) continue;
    if (!h.includes("квартир")) continue;
    if (!h.includes("сумм")) continue;
    if (h.includes("парк") || h.includes("парков") || h.includes("кладов") || h.includes("коммерч")) continue;
    return i;
  }
  return -1;
}

/** Построчный реестр квартир: «Стоимость квартир» / estate_price_income (только если нет «квартиры сумма»). */
function findPerUnitApartmentPriceColumnIndex(headers: string[]): number {
  const normalized = headers.map((h) => normCell(h));
  const exact = new Set([
    "стоимостьквартир",
    "estatepriceincome",
    "стоимостькв",
    "ценаквартир",
  ]);
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    if (exact.has(h)) return i;
  }
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    if (h.includes("м2") || h.includes("квм") || h.includes("площад")) continue;
    if (h.includes("стоим") && h.includes("квартир")) return i;
    if (h === "estatepriceincome" || h.includes("priceincome")) return i;
  }
  return -1;
}

/** @deprecated используйте {@link findAggregatedApartmentsSumColumnIndex} */
export function findApartmentsPriceColumnIndex(headers: string[]): number {
  const agg = findAggregatedApartmentsSumColumnIndex(headers);
  if (agg >= 0) return agg;
  return findPerUnitApartmentPriceColumnIndex(headers);
}

function isSkippableApartmentsRow(row: string[]): boolean {
  if (row.length === 0) return true;
  if (row.every((c) => preprocessCell(c) === "")) return true;
  const c0 = normCell(row[0] ?? "");
  if (/^\d{4}$/.test(preprocessCell(row[0] ?? "").trim())) return false;
  const rowText = row.map((c) => normCell(c)).join(" ");
  if (c0.includes("итого") || rowText.includes("итого")) return true;
  if (c0.includes("расторж") || rowText.includes("расторж")) return true;
  if (c0 === "id" || c0 === "№квартиры") return true;
  return false;
}

function isMonthlyDataRow(row: string[], yearCol: number, monthCol: number): boolean {
  if (isSkippableApartmentsRow(row)) return false;
  const yearRaw = preprocessCell(row[yearCol] ?? "").trim();
  if (!/^\d{4}$/.test(yearRaw)) return false;
  const monthRaw = preprocessCell(row[monthCol] ?? "").trim();
  if (!monthRaw) return false;
  if (shouldSilentlySkipInvestorsCsvMonthLabel(monthRaw)) return false;
  return true;
}

function isPerUnitDataRow(row: string[]): boolean {
  if (isSkippableApartmentsRow(row)) return false;
  const id = preprocessCell(row[0] ?? "").trim();
  if (!id || id.toLowerCase() === "id") return false;
  if (!/^\d+$/.test(id.replace(/\s/g, ""))) return false;
  return true;
}

export type ApartmentsCsvRevenuePool = {
  totalRevenue: number;
  priceColumnIndex: number | null;
  priceColumnLabel: string | null;
  /** Агрегированный помесячный CSV vs построчный реестр. */
  format: "aggregated" | "per_unit" | null;
};

/** Сумма выручки по квартирам из CSV (знаменатель доли в карточке «Квартиры»). */
export function sumApartmentsCsvTotalRevenue(headers: string[], rows: string[][]): ApartmentsCsvRevenuePool {
  const aggregatedCol = findAggregatedApartmentsSumColumnIndex(headers);
  const yearMonth = findYearMonthColumns(headers);

  if (aggregatedCol >= 0 && yearMonth) {
    let totalRevenue = 0;
    for (const row of rows) {
      if (!isMonthlyDataRow(row, yearMonth.year, yearMonth.month)) continue;
      const n = parseRuNumber(row[aggregatedCol]);
      if (Number.isFinite(n) && n > 0) totalRevenue += n;
    }
    return {
      totalRevenue,
      priceColumnIndex: aggregatedCol,
      priceColumnLabel: headers[aggregatedCol]?.trim() || "квартиры сумма",
      format: "aggregated",
    };
  }

  if (aggregatedCol >= 0) {
    let totalRevenue = 0;
    for (const row of rows) {
      if (isSkippableApartmentsRow(row)) continue;
      const n = parseRuNumber(row[aggregatedCol]);
      if (Number.isFinite(n) && n > 0) totalRevenue += n;
    }
    return {
      totalRevenue,
      priceColumnIndex: aggregatedCol,
      priceColumnLabel: headers[aggregatedCol]?.trim() || null,
      format: "aggregated",
    };
  }

  const unitCol = findPerUnitApartmentPriceColumnIndex(headers);
  if (unitCol < 0) {
    return { totalRevenue: 0, priceColumnIndex: null, priceColumnLabel: null, format: null };
  }
  let totalRevenue = 0;
  for (const row of rows) {
    if (!isPerUnitDataRow(row)) continue;
    const n = parseRuNumber(row[unitCol]);
    if (Number.isFinite(n) && n > 0) totalRevenue += n;
  }
  return {
    totalRevenue,
    priceColumnIndex: unitCol,
    priceColumnLabel: headers[unitCol]?.trim() || null,
    format: "per_unit",
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
