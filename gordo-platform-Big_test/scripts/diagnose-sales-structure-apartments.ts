/**
 * Диагностика «Структура продаж»: сверка квартир CSV → inventory → deals → UI count.
 * Запуск: npx tsx scripts/diagnose-sales-structure-apartments.ts
 */
import fs from "fs";
import path from "path";

import { parseApartmentsCsv } from "@/lib/parseApartmentsCsv";
import {
  findApartmentRegistryPriceColumnIndex,
  isSkippableApartmentsRow,
  sumApartmentsCsvTotalRevenue,
} from "@/lib/apartmentsCsvMetrics";
import { sumParkingCsvTotalRevenue } from "@/lib/parkingCsvMetrics";
import { sumStoragesCsvTotalRevenue } from "@/lib/storagesCsvMetrics";
import { parseParkingCsv } from "@/lib/parseParkingCsv";
import { parseStoragesCsv } from "@/lib/parseStoragesCsv";
import { preprocessCell } from "@/lib/salesPlanExecutionCsv";
import { parseRuNumber } from "@/src/shared/lib/csv/parseInvestorsCsv";
import { normalizeDealSegment } from "@/lib/normalizeDealSegment";
import {
  extractNormalizedDeals,
  groupDealsBySegment,
  normalizedTypeToDealSegment,
  type DealExportRow,
} from "@/components/marketing/DealsSection";

const root = process.cwd();

function readText(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function parseCsv(rel: string, kind: "apartments" | "parking" | "storages") {
  const text = readText(rel);
  const name = path.basename(rel);
  if (kind === "apartments") return parseApartmentsCsv(text, name);
  if (kind === "parking") return parseParkingCsv(text, name);
  return parseStoragesCsv(text, name);
}

function findCol(headers: string[], pred: (h: string) => boolean): number {
  return headers.findIndex((h) => pred(h.trim().toLowerCase()));
}

function apartmentRowDiagnostics(headers: string[], rows: string[][]) {
  const priceCol = findApartmentRegistryPriceColumnIndex(headers);
  let idCol = 0;
  let externalUuidCol: number | null = null;
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!.trim().toLowerCase().replace(/\s+/g, "");
    if (h === "id") idCol = i;
    if (h.includes("externaluuid") || h === "estateexternaluuid") externalUuidCol = i;
  }
  const flatCol = findCol(headers, (h) => h.includes("flatnum") && !h.includes("postoffice"));
  const statusCol = findCol(headers, (h) => h.includes("статус"));

  const included: Array<Record<string, unknown>> = [];
  const excluded: Array<Record<string, unknown>> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const id = preprocessCell(row[idCol] ?? "").trim();
    const uuid = externalUuidCol != null ? preprocessCell(row[externalUuidCol] ?? "").trim() : "";
    const flatNum = flatCol >= 0 ? preprocessCell(row[flatCol] ?? "").trim() : "";
    const priceRaw = priceCol >= 0 ? row[priceCol] ?? "" : "";
    const price = parseRuNumber(priceRaw);
    const status = statusCol >= 0 ? preprocessCell(row[statusCol] ?? "").trim() : "";
    const skip = isSkippableApartmentsRow(row);
    const hasId =
      (id && id.toLowerCase() !== "id" && /^\d+$/.test(id.replace(/\s/g, ""))) ||
      (uuid.length >= 6 && uuid.toLowerCase() !== "id");
    const validPrice = Number.isFinite(price) && price > 0;
    const includedInInventory = !skip && hasId && validPrice;

    const rec = {
      csvLine: i + 1,
      id,
      estate_external_uuid: uuid || null,
      flatNum: flatNum || null,
      priceRaw,
      price,
      status,
      skipRow: skip,
      hasIdentity: hasId,
      validPrice,
      reason: includedInInventory
        ? "OK"
        : skip
          ? "skipped (итого/заголовок/пустая)"
          : !hasId
            ? "нет id/uuid"
            : !validPrice
              ? "стоимость <= 0 или не число"
              : "unknown",
    };
    if (includedInInventory) included.push(rec);
    else excluded.push(rec);
  }
  return { priceCol, included, excluded };
}

function loadDeals(): DealExportRow[] {
  const raw = JSON.parse(readText("src/data/dealsMock.json")) as { data?: DealExportRow[] };
  return Array.isArray(raw.data) ? raw.data : [];
}

// --- run ---
const aptParsed = parseCsv("public/data/analytics/apartments.csv", "apartments");
if (!aptParsed.ok) throw new Error(aptParsed.error);

const parkParsed = parseCsv("public/data/analytics/parking.csv", "parking");
const storParsed = parseCsv("public/data/analytics/storages.csv", "storages");

const aptPool = sumApartmentsCsvTotalRevenue(aptParsed.headers, aptParsed.rows);
const parkPool = parkParsed.ok ? sumParkingCsvTotalRevenue(parkParsed.headers, parkParsed.rows) : null;
const storPool = storParsed.ok ? sumStoragesCsvTotalRevenue(storParsed.headers, storParsed.rows) : null;

const aptDiag = apartmentRowDiagnostics(aptParsed.headers, aptParsed.rows);

const deals = loadDeals();
const normalized = extractNormalizedDeals(deals);
const grouped = groupDealsBySegment(normalized);
const aptDeals = grouped.apartment;

console.log("=== СТРУКТУРА ПРОДАЖ — СВЕРКА ===\n");

console.log("| Тип | CSV строк (data) | После импорта (inventory) | Сделки (витрина) | UI card count | UI inventoryTotal |");
console.log("|---|---:|---:|---:|---:|---:|");
console.log(
  `| Квартиры | ${aptParsed.rows.length} | ${aptPool.totalCount} | ${aptDeals.length} | ${aptDeals.length} | ${aptPool.totalCount} |`,
);
console.log(
  `| Машино-места | ${parkParsed.ok ? parkParsed.rows.length : "?"} | ${parkPool?.totalCount ?? "?"} | ${grouped.parking.length} | ${grouped.parking.length} | ${parkPool?.totalCount ?? "?"} |`,
);
console.log(
  `| Кладовые | ${storParsed.ok ? storParsed.rows.length : "?"} | ${storPool?.totalCount ?? "?"} | ${grouped.storage.length} | ${grouped.storage.length} | ${storPool?.totalCount ?? "?"} |`,
);
console.log(
  `| Коммерция | — | — | ${grouped.commercial.length} | ${grouped.commercial.length} | (отдельный источник) |`,
);

const invSum =
  aptPool.totalCount + (parkPool?.totalCount ?? 0) + (storPool?.totalCount ?? 0) + grouped.commercial.length;
console.log(`\nСумма inventory (кв+мм+клад+коммерция deals count): ${invSum}`);
console.log(`Сумма card count (deals по сегментам): ${normalized.length}`);

console.log("\n=== ИСКЛЮЧЁННЫЕ СТРОКИ CSV КВАРТИР (${aptDiag.excluded.length}) ===");
for (const r of aptDiag.excluded) {
  console.log(JSON.stringify(r));
}

console.log("\n=== ВСЕ КВАРТИРЫ В CSV (included, id + flatNum + status) ===");
for (const r of aptDiag.included) {
  console.log(`${r.id}\tflat=${r.flatNum}\tstatus=${r.status}\tprice=${r.price}`);
}

// Deals apartment IDs
console.log("\n=== КВАРТИРЫ В ВИТРИНЕ СДЕЛОК ===");
const dealIds = new Set<string>();
for (const d of aptDeals) {
  const oid = d.objectParams?.objectId ?? d.objectParams?.externalId ?? d.dealId;
  console.log(
    `dealId=${d.dealId}\tobjectId=${oid ?? "—"}\tsum=${d.sumRub}\tstatus=${d.dealStatus ?? "—"}\tdate=${d.dealDate ?? "—"}`,
  );
  if (oid != null) dealIds.add(String(oid));
}

const csvIds = new Set(aptDiag.included.map((r) => String(r.id)));
const inCsvNotInventory = aptDiag.excluded.filter((r) => r.id && /^\d+$/.test(String(r.id)));
const inInventoryNotInDeals = [...csvIds].filter((id) => !dealIds.has(id));

console.log("\n=== РАСХОЖДЕНИЕ 79 vs 78 ===");
console.log(`CSV data rows: ${aptParsed.rows.length}`);
console.log(`После фильтра isRegistryApartmentRow (inventoryTotal): ${aptPool.totalCount}`);
console.log(`Ожидалось по проекту: 79`);
console.log(`Дельта inventory: ${79 - aptPool.totalCount} квартира(ы)`);

if (aptDiag.excluded.length === 1) {
  console.log("\n>>> Отсутствующая в inventory квартира (строка CSV):");
  console.log(JSON.stringify(aptDiag.excluded[0], null, 2));
}
