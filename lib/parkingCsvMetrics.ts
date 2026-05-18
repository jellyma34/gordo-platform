import { normalizeCsvHeaderLabel } from "@/lib/marketingInvestorsCsv";
import { preprocessCell } from "@/lib/salesPlanExecutionCsv";
import { parseRuNumber } from "@/src/shared/lib/csv/parseInvestorsCsv";

/** Нормализованные имена колонки стоимости в реестре машино-мест. */
const REGISTRY_PARKING_PRICE_COLUMN_KEYS = new Set([
  "estatepriceincome",
  "стоимостьмашиномест",
  "стоимостьмашиномест₽",
  "стоимостьмашиноместруб",
  "fullprice",
  "totalprice",
  "price",
  "сумма",
  "стоимость",
]);

function normCell(s: string): string {
  return normalizeCsvHeaderLabel(s);
}

function isPricePerM2Column(h: string): boolean {
  if (!h) return false;
  if (h.includes("м2") || h.includes("квм") || h.includes("квм2")) return true;
  if (h.includes("ценазакв") || (h.includes("цен") && h.includes("м2"))) return true;
  if (h.includes("pricem2") || h.includes("price_m2")) return true;
  return false;
}

/** Колонка полной стоимости машино-места (не цена за м²). */
export function findParkingRegistryPriceColumnIndex(headers: string[]): number {
  const normalized = headers.map((h) => normCell(h));
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    if (!h || isPricePerM2Column(h)) continue;
    if (REGISTRY_PARKING_PRICE_COLUMN_KEYS.has(h)) return i;
  }
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    if (!h || isPricePerM2Column(h)) continue;
    if (h.includes("fullprice") || h.includes("totalprice")) return i;
    if (h.includes("стоим") && (h.includes("мест") || h.includes("машин") || h.includes("паркинг"))) return i;
    if (h.includes("стоим") && !h.includes("площад")) return i;
    if ((h.includes("цена") || h === "price") && !h.includes("спец")) return i;
    if (h.includes("сумма") && !h.includes("итог")) return i;
  }
  return -1;
}

export function isSkippableParkingMetricsRow(row: string[]): boolean {
  if (row.length === 0) return true;
  if (row.every((c) => preprocessCell(c) === "")) return true;
  const c0 = normCell(row[0] ?? "");
  const rowText = row.map((c) => normCell(c)).join(" ");
  if (c0.includes("итого") || rowText.includes("итого")) return true;
  if (c0.includes("расторж") || rowText.includes("расторж")) return true;
  if (c0 === "id" || c0 === "№машиноместа") return true;
  return false;
}

function findParkingRegistryIdentityColumns(headers: string[]): {
  idCol: number;
  externalUuidCol: number | null;
  flatNumCol: number | null;
} {
  let idCol = 0;
  let externalUuidCol: number | null = null;
  let flatNumCol: number | null = null;
  const normalized = headers.map((h) => normCell(h));
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    if (h === "id") idCol = i;
    if (h.includes("externaluuid") || h === "estateexternaluuid") externalUuidCol = i;
    if (h.includes("flatnum") || h.includes("машиномест") || h === "№машиноместа") flatNumCol = i;
  }
  return { idCol, externalUuidCol, flatNumCol };
}

function rowHasRegistryIdentity(
  row: string[],
  idCol: number,
  externalUuidCol: number | null,
  flatNumCol: number | null,
): boolean {
  const idRaw = preprocessCell(row[idCol] ?? "").trim();
  if (idRaw && idRaw.toLowerCase() !== "id" && /^\d+$/.test(idRaw.replace(/\s/g, ""))) {
    return true;
  }
  if (externalUuidCol != null) {
    const uuid = preprocessCell(row[externalUuidCol] ?? "").trim();
    if (uuid.length >= 6 && uuid.toLowerCase() !== "id") return true;
  }
  if (flatNumCol != null) {
    const num = preprocessCell(row[flatNumCol] ?? "").trim();
    if (num && num.toLowerCase() !== "id" && /^\d+$/.test(num.replace(/\s/g, ""))) return true;
  }
  return false;
}

function isRegistryParkingRow(
  row: string[],
  priceCol: number,
  idCol: number,
  externalUuidCol: number | null,
  flatNumCol: number | null,
): boolean {
  if (isSkippableParkingMetricsRow(row)) return false;
  if (!rowHasRegistryIdentity(row, idCol, externalUuidCol, flatNumCol)) return false;
  const priceLabel = normCell(row[priceCol] ?? "");
  if (priceLabel.includes("стоим") && (priceLabel.includes("мест") || priceLabel.includes("машин"))) return false;
  const n = parseRuNumber(row[priceCol]);
  return Number.isFinite(n) && n > 0;
}

export type ParkingCsvRevenuePool = {
  totalRevenue: number;
  /** Валидные машино-места в реестре CSV (с id/uuid/№ и стоимостью > 0). */
  totalCount: number;
  priceColumnIndex: number | null;
  priceColumnLabel: string | null;
  format: "registry" | null;
};

/** Сумма стоимости по всем машино-местам в реестре (знаменатель доли выручки). */
export function sumParkingCsvTotalRevenue(headers: string[], rows: string[][]): ParkingCsvRevenuePool {
  const priceCol = findParkingRegistryPriceColumnIndex(headers);
  if (priceCol < 0) {
    return {
      totalRevenue: 0,
      totalCount: 0,
      priceColumnIndex: null,
      priceColumnLabel: null,
      format: null,
    };
  }

  const { idCol, externalUuidCol, flatNumCol } = findParkingRegistryIdentityColumns(headers);
  let totalRevenue = 0;
  let totalCount = 0;
  for (const row of rows) {
    if (!isRegistryParkingRow(row, priceCol, idCol, externalUuidCol, flatNumCol)) continue;
    totalCount++;
    totalRevenue += parseRuNumber(row[priceCol]);
  }

  return {
    totalRevenue,
    totalCount,
    priceColumnIndex: priceCol,
    priceColumnLabel: headers[priceCol]?.trim() || "Стоимость машино-мест",
    format: "registry",
  };
}

/** Доля выручки проданных машино-мест от всего пула CSV (0–1). */
export function parkingRevenueShareFromCsvPool(
  soldRevenueRub: number,
  pool: ParkingCsvRevenuePool | null | undefined,
): number | null {
  if (!pool || pool.priceColumnIndex == null || pool.totalRevenue <= 0) return null;
  if (!Number.isFinite(soldRevenueRub) || soldRevenueRub < 0) return 0;
  return soldRevenueRub / pool.totalRevenue;
}
