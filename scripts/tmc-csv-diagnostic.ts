import fs from "fs";

import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import {
  buildTmcColumnMap,
  describeTmcColumnMap,
  detectTripletMetricLayout,
  normalizeTmcCsvRows,
  parseTmcCsvText,
} from "../lib/tmcCsvImport";

const path = process.argv[2] ?? "data/tmc-supply-sample.csv";
const buf = fs.readFileSync(path);
const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
const smart = decodeCsvBytesWithBestEncoding(new Uint8Array(buf));
const text = process.argv.includes("--smart") ? smart : utf8;

const { rows, headers } = parseTmcCsvText(text);
const metric = detectTripletMetricLayout(headers);
const map = buildTmcColumnMap(headers);

console.log("File:", path);
console.log("Columns:", headers.length);
console.log("Metric layout:", metric.layout, "tripletStart:", metric.tripletStart);
console.log("\n=== Column map (index | header | first row value) ===");
const first = rows[0] ?? {};
for (let i = 0; i < headers.length; i += 1) {
  const h = headers[i] ?? "";
  const v = first[h] ?? "";
  console.log(`${String(i).padStart(2)} | ${h} | ${v}`);
}

console.log("\n=== Mapped fields ===");
console.log(describeTmcColumnMap(headers, map));

try {
  const items = normalizeTmcCsvRows(rows, headers);
  console.log("\n=== First TMC item ===");
  console.log(
    JSON.stringify(
      {
        volumePlan: items[0]?.volumePlan,
        volumeFact: items[0]?.volumeFact,
        pricePlan: items[0]?.pricePlan,
        priceFact: items[0]?.priceFact,
        planCost: items[0]?.planCost,
        factCost: items[0]?.factCost,
      },
      null,
      2,
    ),
  );
  console.log("OK: first row control passed, items:", items.length);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
