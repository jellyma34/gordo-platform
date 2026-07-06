/**
 * Трассировка порядка строк «Динамика выполнения ГПР».
 * npx tsx scripts/gpr-planfact-sort-trace.ts
 */
import fs from "fs";
import path from "path";

import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { parseGprReportCsvWithStats } from "../lib/gprReportCsv";
import { mergeGprTasksFromReportCsv } from "../lib/gprTasksMergeFromReportCsv";
import {
  buildPlanFactWorkTypeChartModel,
  isGprMonolithChartStageCode,
  isLeafTask,
} from "../lib/planFactWorkTypeTimeline";
import { isGprCsvArticleWork } from "../lib/gprStageCompletion";
import {
  compareGprCodesByNumericPath,
  filterGprTasksByObjectScope,
  filterZhDomPlanFactTasksTo205Branch,
  flattenTasks,
  gprWbsLevelFromCode,
  normalizeGprCodeFinal,
  type GPRTask,
} from "../lib/gprUtils";
import seed from "../data/gpr-import-default.json";

const csvPath = path.join(process.cwd(), "data", "Исполнение ГПР_май.csv");
const todayIso = "2026-05-31";
const LIMIT = 30;

function filterFullBarTasks(tasks: GPRTask[]): GPRTask[] {
  const branch = tasks.filter((t) => {
    const c = normalizeGprCodeFinal(t.code);
    return c.startsWith("2.05") || c.startsWith("2.04");
  });
  const normCodes = [...new Set(branch.map((t) => normalizeGprCodeFinal(t.code)))];
  return branch.filter((t) => {
    const c = normalizeGprCodeFinal(t.code);
    return isLeafTask(c, normCodes);
  });
}


type Row = {
  index: number;
  code: string;
  articleNumber: number | null;
  wbsLevel: number;
  displayOrder: string;
};

function toRow(t: GPRTask | { code: string; articleNumber?: number | null }, index: number): Row {
  const code = normalizeGprCodeFinal("code" in t ? t.code : "");
  return {
    index,
    code,
    articleNumber: "articleNumber" in t ? (t.articleNumber ?? null) : null,
    wbsLevel: gprWbsLevelFromCode(code, "level" in t ? t.level : undefined),
    displayOrder: code,
  };
}

function printStage(title: string, rows: Row[]) {
  console.log(`\n── ${title} (first ${LIMIT}) ──`);
  for (const r of rows.slice(0, LIMIT)) {
    console.log(
      `${String(r.index).padStart(4)} | ${r.code.padEnd(14)} | art=${String(r.articleNumber ?? "—").padEnd(4)} | L${r.wbsLevel}`,
    );
  }
  detectOrderBreak(title, rows);
}

function detectOrderBreak(title: string, rows: Row[]) {
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!.code;
    const cur = rows[i]!.code;
    if (compareGprCodesByNumericPath(prev, cur) > 0) {
      console.log(`  ⚠ ORDER BREAK at [${title}] i=${i}: ${prev} > ${cur}`);
      return;
    }
  }
  const monolithIdx = rows.findIndex((r) => r.code.startsWith("2.05.04.2."));
  const idx20512 = rows.findIndex((r) => r.code === "2.05.12" || r.code.startsWith("2.05.12."));
  if (monolithIdx >= 0 && idx20512 >= 0 && monolithIdx > idx20512) {
    console.log(
      `  ⚠ MONOLITH AFTER 2.05.12: monolith@${monolithIdx} 2.05.12@${idx20512}`,
    );
  }
}

const csvText = decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync(csvPath)));
const parsed = parseGprReportCsvWithStats(csvText);
const merged = mergeGprTasksFromReportCsv((seed as { tasks: GPRTask[] }).tasks, csvText, {
  forcedPartId: 1,
});

const scoped = filterGprTasksByObjectScope(merged.tasks, 1);
const tree = filterZhDomPlanFactTasksTo205Branch(scoped);
const flat = flattenTasks(tree).filter((t) => t.partId === 1);

printStage(
  "1. CSV Parser (sourceRowIndex order, 2.05.*)",
  parsed.rows
    .filter((r) => normalizeGprCodeFinal(r.code).startsWith("2.05"))
    .map((r, i) => toRow({ code: r.code, articleNumber: r.articleNumber }, r.sourceRowIndex)),
);

printStage(
  "2. mergeGprTasksFromReportCsv (flat part1, 2.05.*)",
  flat
    .filter((t) => normalizeGprCodeFinal(t.code).startsWith("2.05"))
    .map((t, i) => toRow(t, i)),
);

const barLevel = "full" as const;
const filtered = filterFullBarTasks(flat);
printStage(
  "3. filterGprTasksForPlanFactBarLevel (unsorted)",
  filtered.map((t, i) => toRow(t, i)),
);

const sorted = [...filtered].sort((a, b) => compareGprCodesByNumericPath(a.code, b.code));
printStage("4. after compareGprCodesByNumericPath sort", sorted.map((t, i) => toRow(t, i)));

const model = buildPlanFactWorkTypeChartModel(flat, "residential", todayIso, barLevel, flat);
const chartRows: Row[] =
  model?.labels.map((label, i) => {
    const code = label.split(" — ")[0] ?? label;
    const task = flat.find((t) => normalizeGprCodeFinal(t.code) === normalizeGprCodeFinal(code));
    return toRow(task ?? { code, articleNumber: null }, i);
  }) ?? [];

printStage("5. buildGprPlanFactBarChartModel → labels", chartRows);

const monolithInFiltered = filtered.filter((t) => isGprMonolithChartStageCode(t.code));
const monolithLeaves = filtered.filter((t) =>
  normalizeGprCodeFinal(t.code).startsWith("2.05.04.2."),
);
console.log("\n── Monolith diagnostics ──");
console.log("2.05.04.2 in filtered leaves:", monolithInFiltered.length);
console.log("2.05.04.2.* leaves in filtered:", monolithLeaves.length);
console.log(
  "2.05.04 in filtered:",
  filtered.some((t) => normalizeGprCodeFinal(t.code) === "2.05.04"),
);
