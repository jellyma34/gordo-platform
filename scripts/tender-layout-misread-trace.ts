import iconv from "iconv-lite";
import { readFileSync } from "node:fs";

import { parseTenderCsvText } from "../lib/tenderCsvImport";

const utf8 = readFileSync("data/tender-gpr-articles-149.csv", "utf8");
const mis = new TextDecoder("utf-8", { fatal: false }).decode(iconv.encode(utf8, "win1251"));
console.log("\n=== CP1251 misread as UTF-8 ===\n");
const p = parseTenderCsvText(mis);
console.log("layout:", p.layout, "rows:", p.rows.length, "headers sample:", p.headers.slice(0, 4));
