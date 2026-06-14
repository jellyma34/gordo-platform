import fs from "fs";
import Papa from "papaparse";

const text = fs.readFileSync("data/tmc-supply-sample.csv", "utf8");
const lines = text.split(/\r?\n/);
console.log("lines", lines.length);
console.log("line0", lines[0]?.slice(0, 80));
const r = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true, delimiter: ";" });
console.log("parsed rows", r.data.length);
console.log("row0 len", (r.data[0] as string[])?.length);
console.log("row0", r.data[0]);
console.log("row1", r.data[1]);

import { parseTmcCsvText, detectTripletMetricLayout, normalizeTmcCsvRows } from "../lib/tmcCsvImport";
const parsed = parseTmcCsvText(text);
console.log("headers", parsed.headers.length);
console.log("triplet", detectTripletMetricLayout(parsed.headers));
const items = normalizeTmcCsvRows(parsed.rows, parsed.headers);
console.log("item0", {
  volumePlan: items[0]?.volumePlan,
  volumeFact: items[0]?.volumeFact,
  pricePlan: items[0]?.pricePlan,
  priceFact: items[0]?.priceFact,
  planCost: items[0]?.planCost,
  factCost: items[0]?.factCost,
});
