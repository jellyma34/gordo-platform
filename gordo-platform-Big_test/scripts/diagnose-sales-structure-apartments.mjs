import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Dynamic import TS modules via tsx
const apartmentsMetrics = await import("../lib/apartmentsCsvMetrics.ts");
const parseApartments = await import("../lib/parseApartmentsCsv.ts");
const parkingMetrics = await import("../lib/parkingCsvMetrics.ts");
const storagesMetrics = await import("../lib/storagesCsvMetrics.ts");
const normalizeSegment = await import("../lib/normalizeDealSegment.ts");

function readCsv(rel) {
  const p = path.join(root, rel);
  const text = fs.readFileSync(p, "utf8");
  const parsed = parseApartments.parseApartmentsCsv(text, path.basename(p));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed;
}

function loadDeals() {
  const p = path.join(root, "src/data/dealsMock.json");
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  const rows = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
  return rows;
}

const aptCsv = readCsv("public/data/analytics/apartments.csv");
const parkCsv = readCsv("public/data/analytics/parking.csv");
const storCsv = readCsv("public/data/analytics/storages.csv");

const aptPool = apartmentsMetrics.sumApartmentsCsvTotalRevenue(aptCsv.headers, aptCsv.rows);
const parkPool = parkingMetrics.sumParkingCsvTotalRevenue(parkCsv.headers, parkCsv.rows);
const storPool = storagesMetrics.sumStoragesCsvTotalRevenue(storCsv.headers, storCsv.rows);

console.log("=== CSV INVENTORY (after import filters) ===");
console.log("Apartments totalCount:", aptPool.totalCount);
console.log("Parking totalCount:", parkPool.totalCount);
console.log("Storages totalCount:", storPool.totalCount);
console.log("Sum (apt+park+stor, no commercial):", aptPool.totalCount + parkPool.totalCount + storPool.totalCount);

// Per-row apartment diagnostics
const priceCol = apartmentsMetrics.findApartmentRegistryPriceColumnIndex(aptCsv.headers);
const headers = aptCsv.headers;
const normCell = (s) => s.trim().toLowerCase().replace(/\s+/g, "");

let idCol = 0;
let externalUuidCol = null;
for (let i = 0; i < headers.length; i++) {
  const h = normCell(headers[i] ?? "");
  if (h === "id") idCol = i;
  if (h.includes("externaluuid") || h === "estateexternaluuid") externalUuidCol = i;
}

const included = [];
const excluded = [];

for (let i = 0; i < aptCsv.rows.length; i++) {
  const row = aptCsv.rows[i];
  const id = (row[idCol] ?? "").trim();
  const uuid = externalUuidCol != null ? (row[externalUuidCol] ?? "").trim() : "";
  const flatNum = row[headers.findIndex((h) => normCell(h).includes("flatnum") && !normCell(h).includes("postoffice"))] ?? "";
  const price = row[priceCol] ?? "";
  const status = row[headers.findIndex((h) => normCell(h).includes("статус"))] ?? "";
  const skip = apartmentsMetrics.isSkippableApartmentsRow(row);
  const hasId = /^\d+$/.test(id.replace(/\s/g, "")) || (uuid.length >= 6);
  const priceNum = parseFloat(String(price).replace(/\s/g, "").replace(",", "."));
  const validPrice = Number.isFinite(priceNum) && priceNum > 0;
  const isReg = !skip && hasId && validPrice;

  const rec = { rowIndex: i + 1, id, uuid, flatNum: flatNum.trim(), price, status: status.trim(), skip, hasId, validPrice };
  if (isReg) included.push(rec);
  else excluded.push(rec);
}

console.log("\n=== APARTMENTS CSV ROWS ===");
console.log("Raw data rows:", aptCsv.rows.length);
console.log("Included in inventory (isRegistryApartmentRow):", included.length);
console.log("Excluded:", excluded.length);

if (excluded.length) {
  console.log("\n--- Excluded rows ---");
  for (const r of excluded) {
    console.log(JSON.stringify(r));
  }
}

console.log("\n--- Included apartment IDs ---");
console.log(included.map((r) => r.id).join(", "));

// Deals
const dealRows = loadDeals();
const normalized = [];
const failed = [];
for (const row of dealRows) {
  const n = normalizeSegment.normalizeDeal?.(row);
  // normalizeDeal is in DealsSection - try deals path
}
console.log("\n(deals analysis needs DealsSection - run tsx with full imports)");
