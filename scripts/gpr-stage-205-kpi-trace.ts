/**
 * Полная трассировка KPI этапа 2.05: CSV → Parser → Normalizer → JSON → Stage → KPI → UI.
 * Только диагностика, без изменений данных.
 *
 * npx tsx scripts/gpr-stage-205-kpi-trace.ts [путь-к-csv]
 */
import fs from "fs";
import path from "path";

import { findGprCsvRootTask } from "../lib/gprAggregateRoots";
import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import {
  parseGprReportCsvWithStats,
  type GprReportCsvRow,
} from "../lib/gprReportCsv";
import {
  collapseMonolithBranchForKpi,
  computeGprStageCompletionInsight,
  filterGprTasksForKpiAnalytics,
  getGprKpiWorkItems,
  getGprStageWorkItems,
} from "../lib/gprStageCompletion";
import { mergeGprTasksFromReportCsv } from "../lib/gprTasksMergeFromReportCsv";
import {
  filterGprTasksByObjectScope,
  flattenTasks,
  normalizeGprCodeFinal,
  type GPRTask,
} from "../lib/gprUtils";
import seedPayload from "../data/gpr-import-default.json";

const ROOT = process.cwd();
const csvPath = process.argv[2] ?? path.join(ROOT, "data", "Исполнение ГПР_май.csv");
const STAGE = "2.05";

function matchesBranch(code: string, root: string): boolean {
  const c = normalizeGprCodeFinal(code);
  const r = normalizeGprCodeFinal(root);
  return c === r || c.startsWith(`${r}.`);
}

function countCsvRowsForStage(rows: GprReportCsvRow[], root: string) {
  const inBranch = rows.filter((r) => matchesBranch(r.code, root));
  const withArticle = inBranch.filter((r) => r.articleNumber != null);
  const uniqueCodes = new Set(inBranch.map((r) => normalizeGprCodeFinal(r.code)));
  const uniqueArticles = new Set(
    withArticle.map((r) => `${normalizeGprCodeFinal(r.code)}::art${r.articleNumber}`),
  );
  return {
    totalRows: inBranch.length,
    withArticle: withArticle.length,
    uniqueCodes: uniqueCodes.size,
    uniqueArticles: uniqueArticles.size,
  };
}

function countTasksForStage(tasks: GPRTask[], root: string) {
  const inBranch = tasks.filter((t) => matchesBranch(t.code, root));
  const withArticle = inBranch.filter((t) => t.articleNumber != null);
  const ids = inBranch.map((t) => t.id);
  const globalIds = inBranch.map((t) => t.globalTaskId);
  const dupIds = ids.length - new Set(ids).size;
  const dupGlobal = globalIds.length - new Set(globalIds).size;
  return {
    total: inBranch.length,
    withArticle: withArticle.length,
    dupIds,
    dupGlobal,
  };
}

function leafCount(tasks: GPRTask[], root: string): number {
  const descendants = tasks.filter((t) => matchesBranch(t.code, root) && normalizeGprCodeFinal(t.code) !== normalizeGprCodeFinal(root));
  const leaves = descendants.filter((t) => {
    const nc = normalizeGprCodeFinal(t.code);
    return !descendants.some((o) => {
      const oc = normalizeGprCodeFinal(o.code);
      return oc !== nc && oc.startsWith(`${nc}.`);
    });
  });
  return leaves.length;
}

// --- simulate UI breakdown (mirrors GPRAnalytics.tsx) ---
function simulateUiBreakdown(allTasks: GPRTask[], rootTask: GPRTask, asOf: Date) {
  const insight = computeGprStageCompletionInsight(allTasks, rootTask, asOf);
  const workItems = getGprKpiWorkItems(allTasks, rootTask);
  return {
    completedStages: insight.workCompleted,
    totalStages: insight.workTotal,
    kpiItems: workItems.length,
  };
}

function section(title: string) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

function printRow(label: string, count: number, extra?: string) {
  console.log(`  ${label.padEnd(42)} ${String(count).padStart(5)}${extra ? `  ${extra}` : ""}`);
}

// --- main ---
section(`Источник CSV: ${csvPath}`);
if (!fs.existsSync(csvPath)) {
  console.error("Файл не найден:", csvPath);
  process.exit(1);
}

const buf = fs.readFileSync(csvPath);
const text = decodeCsvBytesWithBestEncoding(new Uint8Array(buf));
const { rows: parsedAll, csvPapaRowCount } = parseGprReportCsvWithStats(text);

section("1. CSV (сырые строки после split)");
printRow("Всего непустых строк парсера", parsedAll.length);
printRow("csvPapaRowCount (включая пустые)", csvPapaRowCount);
const csv205 = countCsvRowsForStage(parsedAll, STAGE);
printRow(`Строк в ветке ${STAGE}`, csv205.totalRows);
printRow(`  из них с «№ статей»`, csv205.withArticle);
printRow(`  уникальных шифров`, csv205.uniqueCodes);
printRow(`  уникальных (шифр+№)`, csv205.uniqueArticles);

// Part 1 only (residential) — как в UI для вкладки «Жилой дом»
const part1Merge = mergeGprTasksFromReportCsv([], text, { forcedPartId: 1 });
const part2Merge = mergeGprTasksFromReportCsv([], text, { forcedPartId: 2 });

section("2. Parser (parseGprReportCsvWithStats)");
const part1Rows = parsedAll.filter((r) => {
  const code = normalizeGprCodeFinal(r.code);
  if (code.startsWith("2.06") || code.startsWith("2.07")) return false;
  return true;
});
printRow("Part 1 (жилой дом) строк", part1Merge.stats.parsedRowCount);
printRow("Part 2 (автостоянка) строк", part2Merge.stats.parsedRowCount);
printRow(`Part 1 строк в ветке ${STAGE}`, countCsvRowsForStage(part1Rows, STAGE).totalRows);

section("3. Normalizer (gprCsvRowToTask + normalizeGprCodeFinal)");
const normalizedFromCsv = part1Merge.stats.parsedRowCount;
printRow("Задач после gprCsvRowToTask (part1)", normalizedFromCsv);
const tasksFromRows = part1Merge.stats.parsedRowCount;
const norm205 = countTasksForStage(part1Merge.tasks, STAGE);
printRow(`Задач в ветке ${STAGE} (part1)`, norm205.total);
printRow(`  с articleNumber`, norm205.withArticle);
printRow(`  дубликаты id`, norm205.dupIds);
printRow(`  дубликаты globalTaskId`, norm205.dupGlobal);

section("4. Merge / dedup (taskIdentityKey в mergeGprTasksFromReportCsv)");
printRow("Задач part1 после dedup", part1Merge.tasks.length);
printRow("Задач part2 после dedup", part2Merge.tasks.length);
const dedup205 = countTasksForStage(part1Merge.tasks, STAGE);
printRow(`Ветка ${STAGE} после dedup`, dedup205.total);

// Merge with empty base vs with mock JSON
const mergeWithBase = mergeGprTasksFromReportCsv(
  (Array.isArray(seedPayload) ? seedPayload : seedPayload.tasks ?? []) as GPRTask[],
  text,
  { forcedPartId: 1 },
);
printRow("При merge с gpr-import-default.json (part1)", mergeWithBase.tasks.length);
printRow(`Ветка ${STAGE} после merge с JSON`, countTasksForStage(mergeWithBase.tasks, STAGE).total);
printRow("  updated", mergeWithBase.stats.updated);
printRow("  added", mergeWithBase.stats.added);
printRow("  markedAbsentFromReport", mergeWithBase.stats.markedAbsentFromReport);

section("5. JSON model (data/gpr-import-default.json)");
type Seed = { tasks?: GPRTask[]; sourceCsv?: string; updatedAt?: string };
const seed = seedPayload as Seed | GPRTask[];
const jsonTasks = (Array.isArray(seed) ? seed : seed.tasks ?? []) as GPRTask[];
const seedMeta = Array.isArray(seed) ? {} : seed;
printRow("Всего задач в JSON", jsonTasks.length);
if (!Array.isArray(seed)) {
  console.log(`  sourceCsv: ${seedMeta.sourceCsv ?? "—"}`);
  console.log(`  updatedAt: ${seedMeta.updatedAt ?? "—"}`);
}
const json205 = countTasksForStage(jsonTasks, STAGE);
printRow(`Ветка ${STAGE} в JSON`, json205.total);
printRow(`  с articleNumber`, json205.withArticle);

// GET /api/gpr/import пишет в data/gpr-import-{projectId}.json (= default)
const apiSnapPath = path.join(ROOT, "data", "gpr-import-default.json");
if (fs.existsSync(apiSnapPath)) {
  const raw = JSON.parse(fs.readFileSync(apiSnapPath, "utf-8")) as { tasks?: GPRTask[] };
  const n = raw.tasks?.length ?? 0;
  const s205 = raw.tasks ? countTasksForStage(raw.tasks, STAGE).total : 0;
  console.log(`  API/localStorage snapshot: tasks=${n}, ${STAGE}=${s205}`);
} else {
  console.log("  API snapshot gpr-import-default.json: отсутствует");
}

section("6. Enrich / scope filters (как GPRAnalytics)");
const asOf = new Date();
const scopedResidential = filterGprTasksByObjectScope(jsonTasks, 1);
printRow("После filterGprTasksByObjectScope(residential)", scopedResidential.length);
const scoped205 = countTasksForStage(scopedResidential, STAGE);
printRow(`Ветка ${STAGE} после scope`, scoped205.total);

const forKpi = filterGprTasksForKpiAnalytics(scopedResidential);
printRow("После filterGprTasksForKpiAnalytics", forKpi.length);
const kpiFilter205 = countTasksForStage(forKpi, STAGE);
printRow(`Ветка ${STAGE} после KPI filter`, kpiFilter205.total);

const flat = flattenTasks(forKpi);
printRow("После flattenTasks", flat.length);

section("7. Stage model (getGprStageWorkItems / leaves)");
const root205 = findGprCsvRootTask(flat, STAGE);
if (!root205) {
  console.error("Корень 2.05 не найден!");
  process.exit(1);
}
const stageWorkItems = getGprStageWorkItems(flat, root205);
printRow("getGprStageWorkItems (листья WBS)", stageWorkItems.length);
printRow("  с articleNumber", stageWorkItems.filter((t) => t.articleNumber != null).length);

const collapsed = collapseMonolithBranchForKpi(flat, stageWorkItems);
printRow("После collapseMonolithBranchForKpi", collapsed.length);

section("8. KPI (getGprKpiWorkItems / computeGprStageCompletionInsight)");
const kpiWorks = getGprKpiWorkItems(flat, root205);
printRow("getGprKpiWorkItems", kpiWorks.length);
const insight = computeGprStageCompletionInsight(flat, root205, asOf);
printRow("insight.workTotal", insight.workTotal);
printRow("insight.workCompleted", insight.workCompleted);

section("9. UI (computeGprStageStatusBreakdown simulation)");
const ui = simulateUiBreakdown(flat, root205, asOf);
printRow("totalStages (карточка «из N»)", ui.totalStages);
printRow("completedStages (числитель)", ui.completedStages);
printRow("Формат карточки", 0, `${ui.completedStages} из ${ui.totalStages} работ`);

// --- First appearance of 122 ---
section("Поиск первого появления числа 122 в цепочке");
type Step = { step: string; count: number; file: string; fn: string; line: string };
const steps: Step[] = [
  { step: "CSV все строки part2", count: part2Merge.stats.parsedRowCount, file: "lib/gprTasksMergeFromReportCsv.ts", fn: "csvRowMatchesForcedPart + parse", line: "~191-195" },
  { step: "CSV строки ветки 2.05 (все секции)", count: csv205.totalRows, file: "lib/gprReportCsv.ts", fn: "parseGprReportCsvWithStats", line: "~200+" },
  { step: "CSV 2.05 с № статей", count: csv205.withArticle, file: "lib/gprReportCsv.ts", fn: "parseGprReportCsvWithStats", line: "articleIdx" },
  { step: "Parser part1 tasks total", count: part1Merge.tasks.length, file: "lib/gprTasksMergeFromReportCsv.ts", fn: "mergeGprTasksFromReportCsv", line: "~212" },
  { step: "JSON model total", count: jsonTasks.length, file: "data/gpr-import-default.json", fn: "(file)", line: "—" },
  { step: "JSON ветка 2.05", count: json205.total, file: "data/gpr-import-default.json", fn: "—", line: "—" },
  { step: "Stage leaves getGprStageWorkItems", count: stageWorkItems.length, file: "lib/gprStageCompletion.ts", fn: "getGprStageWorkItems", line: "523-528" },
  { step: "После collapseMonolith", count: collapsed.length, file: "lib/gprStageCompletion.ts", fn: "collapseMonolithBranchForKpi", line: "150-162" },
  { step: "KPI getGprKpiWorkItems", count: kpiWorks.length, file: "lib/gprStageCompletion.ts", fn: "getGprKpiWorkItems", line: "532-535" },
  { step: "insight.workTotal", count: insight.workTotal, file: "lib/gprStageCompletion.ts", fn: "countWorkStats", line: "442" },
  { step: "UI totalStages", count: ui.totalStages, file: "components/construction/GPRAnalytics.tsx", fn: "computeGprStageStatusBreakdown", line: "2228-2239" },
];

for (const s of steps) {
  const mark = s.count === 122 ? " ← 122" : "";
  console.log(`  ${s.step.padEnd(40)} ${String(s.count).padStart(5)}${mark}`);
}

const first122 = steps.find((s) => s.count === 122);
if (first122) {
  section("ИТОГ: первое появление 122");
  console.log(`  Шаг:     ${first122.step}`);
  console.log(`  Файл:    ${first122.file}`);
  console.log(`  Функция: ${first122.fn}`);
  console.log(`  Строка:  ${first122.line}`);
} else {
  section("ИТОГ: 122 не найдено в стандартной цепочке — детальный разбор");
  for (const s of steps) {
    if (s.count > 100) console.log(`  ${s.step}: ${s.count}`);
  }
}

section(`Правильное количество работ по CSV (этап ${STAGE})`);
console.log(`  Строк CSV в ветке ${STAGE} (все секции файла): ${csv205.totalRows}`);
console.log(`  Строк с колонкой «№ статей» в ветке ${STAGE}: ${csv205.withArticle}`);
console.log(`  Уникальных шифров WBS в ветке ${STAGE}: ${csv205.uniqueCodes}`);
console.log(`  Листьев WBS (текущая логика KPI до collapse): ${stageWorkItems.length}`);
console.log(`  После collapse монолита (текущий KPI): ${kpiWorks.length}`);

// List monolith branch
const monolithChildren = stageWorkItems.filter((t) =>
  normalizeGprCodeFinal(t.code).startsWith("2.05.04.2"),
);
console.log(`\n  Строк ветки 2.05.04.2.* среди листьев: ${monolithChildren.length}`);
if (monolithChildren.length > 1) {
  console.log("  (collapseMonolithBranchForKpi схлопывает их в 1 работу)");
}

// Duplicate analysis in JSON for 2.05
const branchTasks = jsonTasks.filter((t) => matchesBranch(t.code, STAGE));
const byCode = new Map<string, GPRTask[]>();
for (const t of branchTasks) {
  const c = normalizeGprCodeFinal(t.code);
  const arr = byCode.get(c) ?? [];
  arr.push(t);
  byCode.set(c, arr);
}
const multiCode = [...byCode.entries()].filter(([, arr]) => arr.length > 1);
if (multiCode.length > 0) {
  console.log(`\n  Дубликаты шифра в JSON (ветка ${STAGE}): ${multiCode.length} шифров`);
  for (const [code, arr] of multiCode.slice(0, 5)) {
    console.log(`    ${code}: ${arr.length} записей`, arr.map((t) => t.id));
  }
}
