import fs from "fs";

import { findGprCsvRootTask } from "../lib/gprAggregateRoots";
import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { parseGprReportCsvWithStats } from "../lib/gprReportCsv";
import { getGprKpiWorkItems } from "../lib/gprStageCompletion";
import { mergeGprTasksFromReportCsv } from "../lib/gprTasksMergeFromReportCsv";
import { normalizeGprCodeFinal } from "../lib/gprUtils";

const csvPath = process.argv[2] ?? "data/gpr-report-sample.csv";
const buf = fs.readFileSync(csvPath);
const text = decodeCsvBytesWithBestEncoding(new Uint8Array(buf));
const { rows } = parseGprReportCsvWithStats(text);
console.log("parsed rows", rows.length);
console.log(
  "sample",
  rows.slice(0, 5).map((r) => ({
    article: r.articleNumber,
    code: r.code,
    name: r.name.slice(0, 36),
    completion: r.completion,
  })),
);

const { tasks } = mergeGprTasksFromReportCsv([], text, { forcedPartId: 1 });
console.log("merged tasks (part 1)", tasks.length);

for (const rootCode of ["2.04", "2.05"]) {
  const root = findGprCsvRootTask(tasks, rootCode);
  if (!root) {
    console.log(`stage ${rootCode}: root not found`);
    continue;
  }
  const works = getGprKpiWorkItems(tasks, root);
  console.log(
    `stage ${rootCode}: ${works.length} KPI works`,
    works.map((w) => ({ art: w.articleNumber, code: w.code })),
  );
}

const withArticle = tasks.filter((t) => t.articleNumber != null);
console.log("tasks with articleNumber", withArticle.length);
