/**
 * npx tsx scripts/tender-layout-trace-run.ts
 */
import { readFileSync } from "node:fs";

import { parseTenderCsvText } from "../lib/tenderCsvImport";

const text = readFileSync("data/tender-gpr-articles-149.csv", "utf8");
console.log("\n=== UTF-8 merged headers (expected procurement) ===\n");
const p1 = parseTenderCsvText(text);
console.log("parse result layout:", p1.layout, "rows:", p1.rows.length);

// Simulate browser: row1 is data not subheader (flat path)
const lines = text.split(/\r?\n/);
const broken = [lines[0], lines[2], ...lines.slice(3)].join("\n");
console.log("\n=== Simulated: subheader row missing (row1 = first data row) ===\n");
const p2 = parseTenderCsvText(broken);
console.log("parse result layout:", p2.layout, "rows:", p2.rows.length);
