import fs from "node:fs";
import path from "node:path";
import iconv from "iconv-lite";

import { parseFinanceCsvTextToRawRows } from "../lib/financeCsvFormat";
import { parseFinanceExecutionExpenseChart } from "../lib/financeExecutionCsvCharts";

const dl = path.join(process.env.USERPROFILE ?? "", "Downloads");
const buf = fs.readFileSync(path.join(dl, "бюджет_Май.csv"));
const text = iconv.decode(buf, "win1251");
const rawRows = parseFinanceCsvTextToRawRows(text);

const prev = {
  log: console.log,
  warn: console.warn,
  table: console.table,
  trace: console.trace,
};
console.log = () => {};
console.warn = () => {};
console.table = () => {};
console.trace = () => {};
try {
  parseFinanceExecutionExpenseChart(rawRows);
} finally {
  console.log = prev.log;
  console.warn = prev.warn;
  console.table = prev.table;
  console.trace = prev.trace;
}

const out = path.join(process.cwd(), "scripts", "_row-176101800.json");
console.log(fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "DUMP MISSING");
