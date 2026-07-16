import fs from "node:fs";
import path from "node:path";
import iconv from "iconv-lite";

import { parseFinanceCsvTextToRawRows } from "../lib/financeCsvFormat";
import { importFinanceBudgetExecutionCsvFromRawRows } from "../lib/financeBudgetExecutionCsvImport";

const dl = path.join(process.env.USERPROFILE ?? "", "Downloads");
const buf = fs.readFileSync(path.join(dl, "бюджет_Май.csv"));
const text = iconv.decode(buf, "win1251");
const rawRows = parseFinanceCsvTextToRawRows(text);

const prev = { log: console.log, warn: console.warn, table: console.table, trace: console.trace };
console.log = () => {};
console.warn = () => {};
console.table = () => {};
console.trace = () => {};

const { snapshot } = importFinanceBudgetExecutionCsvFromRawRows(rawRows, "бюджет_Май.csv");

console.log = prev.log;
console.warn = prev.warn;
console.table = prev.table;
console.trace = prev.trace;

const details = snapshot.expenseChart?.detailSegments ?? [];
const codeFromId = (id: string) => {
  const m = id.match(/^budget-(.+)$/);
  return m?.[1] ?? null;
};
const first = details.find((s) => s.valueRub === 176101800);
const parents = ["2.01", "2.02", "2.03", "2.04"]
  .map((c) => ({
    code: c,
    inDetail: details.some((s) => codeFromId(s.id) === c),
    inSegments: (snapshot.expenseChart?.segments ?? []).some((s) => codeFromId(s.id) === c),
  }));

console.log(
  JSON.stringify(
    {
      firstRow: first
        ? { id: first.id, code: codeFromId(first.id), label: first.label, valueRub: first.valueRub }
        : null,
      parents,
      presentationCount: snapshot.expenseChart?.segments?.length ?? 0,
      detailCount: details.length,
      presentationCodes: (snapshot.expenseChart?.segments ?? []).map((s) => codeFromId(s.id)),
    },
    null,
    2,
  ),
);
