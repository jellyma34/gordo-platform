import fs from "fs";

import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { parseGprReportCsvWithStats } from "../lib/gprReportCsv";
import { gprStableIdFromCode } from "../lib/gprTasksMergeFromReportCsv";
import { normalizeGprCodeFinal } from "../lib/gprUtils";

/** Дубли id при старом stableSuffix: forcedPartId=1 → всем задачам суффикс `residential`. */
const text = decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync("data/gpr-report-sample.csv")));
const { rows } = parseGprReportCsvWithStats(text);
const tasks = rows.map((row) => {
  const code = normalizeGprCodeFinal(row.code);
  const objectType = (row.objectType ?? "").trim() || "Жилой дом";
  const id = `${gprStableIdFromCode(code)}--residential`;
  return {
    id,
    globalTaskId: `${code}::${objectType}::__csv${row.sourceRowIndex}`,
    code,
    objectType,
  };
});

const byId = new Map<string, typeof tasks>();
for (const t of tasks) {
  const list = byId.get(t.id) ?? [];
  list.push(t);
  byId.set(t.id, list);
}

const dups = [...byId.entries()].filter(([, list]) => list.length > 1);
console.log("OLD bug duplicate id groups:", dups.length);
for (const [id, list] of dups) {
  console.log(`id=${id}`);
  for (const r of list) {
    console.log(`  code=${r.code} global_task_id=${r.globalTaskId}`);
  }
}
