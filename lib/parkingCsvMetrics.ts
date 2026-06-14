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

/** Колонка полной стоимости машино-места (не цена за м²). */
export function findParkingRegistryPriceColumnIndex(headers: string[]): number {
  const normalized = headers.map((h) => normCell(h));
  const compact = normalized.map((h) => compactHeaderKey(h));

  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    const c = compact[i]!;
    if (!h || isPricePerM2Column(h)) continue;
    if (REGISTRY_PARKING_PRICE_COLUMN_KEYS.has(c) || REGISTRY_PARKING_PRICE_COLUMN_KEYS.has(h.replace(/\s/g, ""))) {
      return i;
    }
  }
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]!;
    if (!h || isPricePerM2Column(h)) continue;
    if (h.includes("стоим") && (h.includes("мест") || h.includes("машин") || h.includes("паркинг"))) return i;
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

function isRegistryParkingRow(row: string[], priceCol: number): boolean {
  if (isSkippableParkingMetricsRow(row)) return false;
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

  let totalRevenue = 0;
  let totalCount = 0;
  for (const row of rows) {
    if (!isRegistryParkingRow(row, priceCol)) continue;
    totalCount++;
    totalRevenue += parseRuNumber(row[priceCol]);
  }

  console.log("[parking csv pool]", {
    priceColumnIndex: priceCol,
    priceColumnLabel: headers[priceCol]?.trim(),
    totalCount,
    totalRevenue,
  });

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
  opts?: { soldCount?: number },
): number | null {
  if (!pool || pool.priceColumnIndex == null || pool.totalRevenue <= 0) return null;
  if (!Number.isFinite(soldRevenueRub) || soldRevenueRub < 0) return 0;
  const share = soldRevenueRub / pool.totalRevenue;
  console.log("[PARKING SHARE]", {
    soldRevenue: soldRevenueRub,
    totalParkingRevenue: pool.totalRevenue,
    share,
    soldCount: opts?.soldCount ?? null,
    totalCount: pool.totalCount,
  });
  return share;
}
