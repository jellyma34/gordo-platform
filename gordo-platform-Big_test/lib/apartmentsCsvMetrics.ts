import { normalizeCsvHeaderLabel } from "@/lib/marketingInvestorsCsv";
import { preprocessCell } from "@/lib/salesPlanExecutionCsv";
import { parseRuNumber } from "@/src/shared/lib/csv/parseInvestorsCsv";

export const APARTMENTS_PRICE_COLUMN_WARNING =
  "Не найдена колонка стоимости квартир для расчёта доли выручки.";

/**
 * Нормализованные имена колонки стоимости в построчном реестре квартир.
 * Исходники: «Стоимость квартир, ₽», «Стоимость квартир», estate_price_income.
 */
const REGISTRY_APARTMENT_PRICE_COLUMN_KEYS = new Set([
  "стоимостьквартир",
  "стоимостьквартир₽",
  "стоимостьквартирруб",
  "estatepriceincome",
  "price",
  "fullprice",
]);

function normCell(s: string): string {
  return normalizeCsvHeaderLabel(s);
}

/** Колонка «Стоимость квартир, ₽» (и эквиваленты) в реестре квартир. */
export function findApartmentRegistryPriceColumnIndex(headers: string[]): number {
  const normalized = headers.map((h) => normCell(h));
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    if (!h) continue;
    if (REGISTRY_APARTMENT_PRICE_COLUMN_KEYS.has(h)) return i;
  }
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    if (!h) continue;
    if (h.includes("м2") || h.includes("квм") || h.includes("площад")) continue;
    if (h.includes("ценазакв") || (h.includes("цен") && h.includes("м2"))) continue;
    if (h.includes("стоим") && h.includes("квартир")) return i;
    if (h === "estatepriceincome" || h.includes("priceincome")) return i;
  }
  return -1;
}

/** @deprecated используйте {@link findApartmentRegistryPriceColumnIndex} */
export function findApartmentsPriceColumnIndex(headers: string[]): number {
  return findApartmentRegistryPriceColumnIndex(headers);
}

export function isSkippableApartmentsRow(row: string[]): boolean {
  if (row.length === 0) return true;
  if (row.every((c) => preprocessCell(c) === "")) return true;
  const c0 = normCell(row[0] ?? "");
  const rowText = row.map((c) => normCell(c)).join(" ");
  if (c0.includes("итого") || rowText.includes("итого")) return true;
  if (c0.includes("расторж") || rowText.includes("расторж")) return true;
  if (c0 === "id" || c0 === "№квартиры") return true;
  return false;
}

function findApartmentRegistryIdentityColumns(headers: string[]): {
  idCol: number;
  externalUuidCol: number | null;
} {
  let idCol = 0;
  let externalUuidCol: number | null = null;
  const normalized = headers.map((h) => normCell(h));
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    if (h === "id") idCol = i;
    if (h.includes("externaluuid") || h === "estateexternaluuid") externalUuidCol = i;
  }
  return { idCol, externalUuidCol };
}

function rowHasRegistryIdentity(
  row: string[],
  idCol: number,
  externalUuidCol: number | null,
): boolean {
  const idRaw = preprocessCell(row[idCol] ?? "").trim();
  if (idRaw && idRaw.toLowerCase() !== "id" && /^\d+$/.test(idRaw.replace(/\s/g, ""))) {
    return true;
  }
  if (externalUuidCol != null) {
    const uuid = preprocessCell(row[externalUuidCol] ?? "").trim();
    if (uuid.length >= 6 && uuid.toLowerCase() !== "id") return true;
  }
  return false;
}

function isRegistryApartmentRow(
  row: string[],
  headers: string[],
  priceCol: number,
  idCol: number,
  externalUuidCol: number | null,
): boolean {
  if (isSkippableApartmentsRow(row)) return false;
  if (!rowHasRegistryIdentity(row, idCol, externalUuidCol)) return false;
  const priceLabel = normCell(row[priceCol] ?? "");
  if (priceLabel.includes("стоим") && priceLabel.includes("квартир")) return false;
  const n = parseRuNumber(row[priceCol]);
  return Number.isFinite(n) && n > 0;
}

export type ApartmentsCsvRevenuePool = {
  totalRevenue: number;
  /** Валидные квартиры в реестре CSV (с id/uuid и стоимостью > 0). */
  totalCount: number;
  priceColumnIndex: number | null;
  priceColumnLabel: string | null;
  format: "registry" | null;
};

/**
 * Сумма «Стоимость квартир, ₽» по всем строкам реестра (знаменатель доли выручки).
 */
export function sumApartmentsCsvTotalRevenue(headers: string[], rows: string[][]): ApartmentsCsvRevenuePool {
  const priceCol = findApartmentRegistryPriceColumnIndex(headers);
  if (priceCol < 0) {
    console.log("[apartments rows parsed]", 0);
    console.log("[apartments total count]", 0);
    console.log("[apartments total revenue]", 0);
    return {
      totalRevenue: 0,
      totalCount: 0,
      priceColumnIndex: null,
      priceColumnLabel: null,
      format: null,
    };
  }

  const { idCol, externalUuidCol } = findApartmentRegistryIdentityColumns(headers);
  let totalRevenue = 0;
  let totalCount = 0;
  for (const row of rows) {
    if (!isRegistryApartmentRow(row, headers, priceCol, idCol, externalUuidCol)) continue;
    totalCount++;
    totalRevenue += parseRuNumber(row[priceCol]);
  }

  console.log("[apartments rows parsed]", totalCount);
  console.log("[apartments total count]", totalCount);
  console.log("[apartments total revenue]", totalRevenue);

  return {
    totalRevenue,
    totalCount,
    priceColumnIndex: priceCol,
    priceColumnLabel: headers[priceCol]?.trim() || "Стоимость квартир, ₽",
    format: "registry",
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
