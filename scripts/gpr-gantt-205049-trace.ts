/**
 * Трассировка работы 2.05.04.9 («Прочие») по цепочке до диаграммы Ганта / «Динамика выполнения ГПР».
 * npx tsx scripts/gpr-gantt-205049-trace.ts
 */
import fs from "fs";
import path from "path";

import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { parseGprReportCsv } from "../lib/gprReportCsv";
import { mergeGprTasksFromReportCsv } from "../lib/gprTasksMergeFromReportCsv";
import {
  buildPlanFactWorkTypeChartModel,
  isGprPlanFactChartExcludedMiscStageName,
} from "../lib/planFactWorkTypeTimeline";
import { isGprCsvArticleWork } from "../lib/gprStageCompletion";
import {
  filterGprTasksByObjectScope,
  filterZhDomPlanFactTasksTo205Branch,
  flattenTasks,
  gprWbsLevelFromCode,
  normalizeGprCodeFinal,
  parseDateSafe,
  type GPRTask,
} from "../lib/gprUtils";
import {
  filterKvartalyTasksForGantt,
  getGanttXWindow,
} from "../lib/gprQuarterlyTimeline";
import { kvartalyRowsToGprTasksForAllParts } from "../lib/kvartalyGpr";
import seed from "../data/gpr-import-default.json";

const TARGET = "2.05.04.9";
const ROOT = process.cwd();
const csvPath = path.join(ROOT, "data", "Исполнение ГПР_май.csv");
const todayIso = "2026-05-31";

function norm(code: string): string {
  return normalizeGprCodeFinal(code);
}

function isLeafTask(code: string, normCodes: string[]): boolean {
  const c = norm(code);
  return !normCodes.some((other) => other !== c && other.startsWith(`${c}.`));
}

function filterGprTasksForPlanFactBarLevelDiag(
  tasks: GPRTask[],
  barLevel: "simplified" | "detailed" | "full",
): { kept: GPRTask[]; drops: Array<{ task: GPRTask; reason: string }> } {
  const roots = ["2.04", "2.05"];
  const branch = tasks.filter((t) => roots.some((r) => norm(t.code).startsWith(norm(r))));
  const partitions = new Map<string, GPRTask[]>();
  for (const t of branch) {
    const k = `${t.partId}_${norm(t.code).split(".").slice(0, 2).join(".")}`;
    const arr = partitions.get(k);
    if (arr) arr.push(t);
    else partitions.set(k, [t]);
  }

  const kept: GPRTask[] = [];
  const drops: Array<{ task: GPRTask; reason: string }> = [];

  for (const [, group] of partitions) {
    const normCodes = [...new Set(group.map((t) => norm(t.code)))];
    for (const t of group) {
      const c = norm(t.code);
      const wbsLevel = gprWbsLevelFromCode(c, t.level);
      if (norm(c) !== TARGET) continue;

      if (barLevel === "simplified") {
        if (wbsLevel !== 1) {
          drops.push({ task: t, reason: `simplified: wbsLevel=${wbsLevel} !== 1` });
          continue;
        }
        if (!roots.some((r) => c === norm(r))) {
          drops.push({ task: t, reason: "simplified: not root 2.04/2.05" });
          continue;
        }
        kept.push(t);
      } else if (barLevel === "detailed") {
        if (wbsLevel !== 2) {
          drops.push({ task: t, reason: `detailed: wbsLevel=${wbsLevel} !== 2` });
          continue;
        }
        kept.push(t);
      } else {
        if (!isLeafTask(c, normCodes)) {
          drops.push({ task: t, reason: "full: not leaf (has children in pool)" });
          continue;
        }
        kept.push(t);
      }
    }
  }
  return { kept, drops };
}

function rowVisibleInGanttWindow(
  task: GPRTask,
  origin: Date,
  maxSerial: number,
): boolean {
  const clamp = (start: string | null, end: string | null) => {
    if (!start?.trim() || !end?.trim()) return null;
    const s = new Date(`${start}T00:00:00`);
    const e = new Date(`${end}T00:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
    const oMs = origin.getTime();
    const sSer = (s.getTime() - oMs) / 86400000;
    const eSer = (e.getTime() - oMs) / 86400000;
    const lo = Math.max(0, Math.min(sSer, eSer));
    const hi = Math.min(maxSerial, Math.max(sSer, eSer));
    if (hi < lo) return null;
    return { lo, hi };
  };
  if (clamp(task.planStart, task.planEnd)) return true;
  if (task.factStart && task.factEnd && clamp(task.factStart, task.factEnd)) return true;
  return false;
}

console.log("═══════════════════════════════════════════════════════════");
console.log(`  ТРАССИРОВКА ${TARGET} → диаграмма Ганта / Динамика ГПР`);
console.log("═══════════════════════════════════════════════════════════\n");

// 1. CSV
const csvText = decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync(csvPath)));
const csvRows = parseGprReportCsv(csvText);
const csvMatches = csvRows.filter((r) => norm(r.code) === TARGET);
console.log("── 1. CSV ──");
console.log(`  строк с кодом ${TARGET}: ${csvMatches.length}`);
for (const r of csvMatches) {
  console.log(
    `    art=${r.articleNumber ?? "—"} name=${JSON.stringify(r.name)} plan=${r.planStart}..${r.planEnd} fact=${r.factStart}..${r.factEnd}`,
  );
}

// 2. Parser (already in csvRows)
console.log("\n── 2. Parser (parseGprReportCsv) ──");
console.log(`  parsed rows total: ${csvRows.length}`);
console.log(`  ${TARGET} in parser output: ${csvMatches.length > 0 ? "YES" : "NO"}`);

// 3. Merge / normalizer
const jsonTasks = (seed as { tasks: GPRTask[] }).tasks;
const merged = mergeGprTasksFromReportCsv(jsonTasks, csvText, { forcedPartId: 1 });
const scoped = filterGprTasksByObjectScope(merged.tasks, 1);
const planFactTree = filterZhDomPlanFactTasksTo205Branch(scoped);
const planFactFlat = flattenTasks(planFactTree).filter((t) => t.partId === 1);
const modelTask = planFactFlat.find((t) => norm(t.code) === TARGET);

console.log("\n── 3. Normalizer / mergeGprTasksFromReportCsv ──");
if (!modelTask) {
  console.log(`  ${TARGET}: NOT IN MODEL after merge`);
} else {
  console.log(`  ${TARGET}: IN MODEL`);
  console.log(
    `    id=${modelTask.id} name=${JSON.stringify(modelTask.name)} article=${modelTask.articleNumber ?? "—"} wbsLevel=${gprWbsLevelFromCode(modelTask.code, modelTask.level)}`,
  );
  console.log(
    `    plan=${modelTask.planStart}..${modelTask.planEnd} fact=${modelTask.factStart}..${modelTask.factEnd} isArticle=${isGprCsvArticleWork(modelTask)}`,
  );
}

// 4. Analytics pool
console.log("\n── 4. Analytics pool (planFactFlat) ──");
console.log(`  ${TARGET} present: ${modelTask ? "YES" : "NO"}`);

// 5. Tasks-mode chart (PlanFact bar chart / Gantt-like)
for (const barLevel of ["detailed", "full", "simplified"] as const) {
  console.log(`\n── 5. buildPlanFactWorkTypeChartModel (tasks, ${barLevel}) ──`);
  const { kept, drops } = filterGprTasksForPlanFactBarLevelDiag(planFactFlat, barLevel);
  const targetInBarLevel = kept.some((t) => norm(t.code) === TARGET);
  const targetDrop = drops.find((d) => norm(d.task.code) === TARGET);

  if (targetDrop) {
    console.log(`  filterGprTasksForPlanFactBarLevel: DROP — ${targetDrop.reason}`);
  } else if (targetInBarLevel) {
    console.log(`  filterGprTasksForPlanFactBarLevel: PASS`);
  } else if (!modelTask) {
    console.log(`  filterGprTasksForPlanFactBarLevel: N/A (not in model)`);
  } else {
    console.log(`  filterGprTasksForPlanFactBarLevel: not evaluated (partition?)`);
  }

  if (modelTask && targetInBarLevel) {
    const miscExcluded = isGprPlanFactChartExcludedMiscStageName(modelTask.name);
    if (barLevel !== "simplified" && miscExcluded) {
      console.log(
        `  filterGprPlanFactChartMiscDisplayTasks (planFactWorkTypeTimeline.ts:846-851): DROP — name includes «Прочие/Прочее»`,
      );
    } else if (barLevel !== "simplified") {
      console.log(`  filterGprPlanFactChartMiscDisplayTasks: PASS`);
    } else {
      console.log(`  filterGprPlanFactChartMiscDisplayTasks: skipped (simplified)`);
    }
  }

  const chartModel = buildPlanFactWorkTypeChartModel(
    planFactFlat,
    "residential",
    todayIso,
    barLevel,
    planFactFlat,
  );
  const labels = chartModel?.labels ?? [];
  const inChart = labels.some((l) => l.startsWith(TARGET));
  console.log(`  chart labels count: ${labels.length}`);
  console.log(`  ${TARGET} in chart labels: ${inChart ? "YES" : "NO"}`);
  if (!inChart && modelTask) {
    const misc = labels.filter((l) => l.includes("Прочие") || l.includes("Прочее"));
    console.log(`  other «Прочие» rows in chart: ${misc.length}`);
  }
}

// 6. Kvartaly Gantt path
console.log("\n── 6. Kvartaly Gantt (kvartaly_gpr_quarterly.json) ──");
const kvFlat = flattenTasks(kvartalyRowsToGprTasksForAllParts());
const kvTask = kvFlat.find((t) => norm(t.code) === TARGET);
console.log(`  ${TARGET} in kvartaly model: ${kvTask ? "YES" : "NO"}`);
if (kvTask) {
  const candidates = filterKvartalyTasksForGantt(kvFlat, { filterType: "all" });
  const inCandidates = candidates.some((t) => norm(t.code) === TARGET);
  console.log(`  filterKvartalyTasksForGantt(all): ${inCandidates ? "PASS" : "DROP"}`);
  const gw = getGanttXWindow(candidates, { filterType: "all" });
  if (gw) {
    const vis = candidates.filter((t) => rowVisibleInGanttWindow(t, gw.origin, gw.maxSerial));
    const inVis = vis.some((t) => norm(t.code) === TARGET);
    console.log(`  rowVisibleInGanttWindow: ${inVis ? "PASS" : "DROP"}`);
  }
}

console.log("\n── ИТОГ ──");
console.log(
  "  Первое исключение для режима «Все этапы» (full): см. filterGprPlanFactChartMiscDisplayTasks",
);
console.log(
  "  Первое исключение для режима «Детально» (detailed): wbsLevel !== 2 (не «Прочие»-фильтр)",
);
