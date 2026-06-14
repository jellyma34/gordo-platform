import { normalizeCsvHeaderLabel } from "@/lib/marketingInvestorsCsv";
import { preprocessCell } from "@/lib/salesPlanExecutionCsv";
import { parseRuNumber } from "@/src/shared/lib/csv/parseInvestorsCsv";

const REGISTRY_STORAGE_PRICE_COLUMN_KEYS = new Set([
  "estatepriceincome",
  "стоимостькладовых",
  "стоимостькладовой",
  "стоимостькладового",
  "стоимостькладов",
  "fullprice",
  "totalprice",
  "price",
  "сумма",
  "стоимость",
]);

function normCell(s: string): string {
  return normalizeCsvHeaderLabel(s);
}

function compactHeaderKey(h: string): string {
  return h.replace(/\s+/g, "").replace(/[,?₽руб.]/g, "");
}

function isPricePerM2Column(h: string): boolean {
  if (!h) return false;
  const compact = compactHeaderKey(h);
  if (compact.includes("м2") || compact.includes("квм") || compact.includes("квм2")) return true;
  if (h.includes("кв.м") || h.includes("кв м") || h.includes("за кв") || h.includes("закв") || h.includes("ценазакв")) {
    return true;
  }
  if (compact.includes("pricem2") || compact.includes("price_m2") || compact.includes("estatepricem2")) return true;
  if ((h.includes("цен") || h.includes("цена")) && (compact.includes("м2") || h.includes("кв.м"))) return true;
  return false;
}

/** Колонка полной стоимости кладовой (не цена за м²). */
export function findStoragesRegistryPriceColumnIndex(headers: string[]): number {
  const normalized = headers.map((h) => normCell(h));
  const compact = normalized.map((h) => compactHeaderKey(h));

  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    const c = compact[i]!;
    if (!h || isPricePerM2Column(h)) continue;
    if (REGISTRY_STORAGE_PRICE_COLUMN_KEYS.has(c) || REGISTRY_STORAGE_PRICE_COLUMN_KEYS.has(h.replace(/\s/g, ""))) {
      return i;
    }
  }
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    if (!h || isPricePerM2Column(h)) continue;
    if (h.includes("стоим") && (h.includes("клад") || h.includes("storage"))) return i;
    if (h === "estatepriceincome" || h.includes("priceincome")) return i;
    if (compact[i]!.includes("fullprice") || compact[i]!.includes("totalprice")) return i;
  }
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    if (!h || isPricePerM2Column(h)) continue;
    if (h.includes("стоим") && !h.includes("площад")) return i;
    if (h.includes("сумма") && !h.includes("итог")) return i;
    if ((h.includes("цена") || h === "price") && !h.includes("спец")) return i;
  }
  return -1;
}

export function isSkippableStoragesMetricsRow(row: string[]): boolean {
  if (row.length === 0) return true;
  if (row.every((c) => preprocessCell(c) === "")) return true;
  const c0 = normCell(row[0] ?? "");
  const rowText = row.map((c) => normCell(c)).join(" ");
  if (c0.includes("итого") || rowText.includes("итого")) return true;
  if (c0.includes("расторж") || rowText.includes("расторж")) return true;
  if (c0 === "id" || c0 === "№кладовой" || c0 === "№кладового") return true;
  return false;
}

function isRegistryStorageRow(row: string[], priceCol: number): boolean {
  if (isSkippableStoragesMetricsRow(row)) return false;
  const priceLabel = normCell(row[priceCol] ?? "");
  if (priceLabel.includes("стоим") && priceLabel.includes("клад")) return false;
  const n = parseRuNumber(row[priceCol]);
  return Number.isFinite(n) && n > 0;
}

export type StoragesCsvRevenuePool = {
  totalRevenue: number;
  totalCount: number;
  priceColumnIndex: number | null;
  priceColumnLabel: string | null;
  format: "registry" | null;
};

/** Сумма стоимости по всем кладовым в реестре (знаменатель доли выручки). */
export function sumStoragesCsvTotalRevenue(headers: string[], rows: string[][]): StoragesCsvRevenuePool {
  const priceCol = findStoragesRegistryPriceColumnIndex(headers);
  if (priceCol < 0) {
    return {
      totalRevenue: 0,
      totalCount: 0,
      priceColumnIndex: null,
      priceColumnLabel: null,
      format: null,
    };
  }

  let totalRevenue = 0;
  let totalCount = 0;
  for (const row of rows) {
    if (!isRegistryStorageRow(row, priceCol)) continue;
    totalCount++;
    totalRevenue += parseRuNumber(row[priceCol]);
  }

  return {
    totalRevenue,
    totalCount,
    priceColumnIndex: priceCol,
    priceColumnLabel: headers[priceCol]?.trim() || "Стоимость кладовой",
    format: "registry",
  };
}

/** Доля выручки проданных кладовых от всего пула CSV (0–1). */
export function storageRevenueShareFromCsvPool(
  soldRevenueRub: number,
  pool: StoragesCsvRevenuePool | null | undefined,
): number | null {
  if (!pool || pool.priceColumnIndex == null || pool.totalRevenue <= 0) return null;
  if (!Number.isFinite(soldRevenueRub) || soldRevenueRub < 0) return 0;
  return soldRevenueRub / pool.totalRevenue;
}
