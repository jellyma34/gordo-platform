/**
 * Диагностика цепочки: импорт → загрузка → фильтрация → диаграмма «План vs факт».
 * Запуск: node scripts/diagnose-gpr-presentation-pipeline.mjs [путь-к-csv|json]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// Dynamic import TS modules via tsx if available; fallback: compile-less replicate key filters inline.
async function loadModules() {
  try {
    const { register } = await import("tsx/esm/api");
    register();
  } catch {
    // tsx may already be registered
  }
  const gprUtils = await import("../lib/gprUtils.ts");
  const merge = await import("../lib/gprTasksMergeFromReportCsv.ts");
  const planFact = await import("../lib/planFactWorkTypeTimeline.ts");
  const encoding = await import("../lib/csvTextEncoding.ts");
  return { ...gprUtils, ...merge, ...planFact, ...encoding };
}

function flattenTasks(tasks) {
  const stack = [];
  return tasks.map((task) => {
    const level = Math.max(1, task.level ?? task.code.split(".").length - 1);
    while (stack.length >= level) stack.pop();
    const parent = stack[level - 2];
    const row = { ...task, level, parentId: parent?.id };
    stack.push(row);
    return row;
  });
}

function tasksForPlanFactAnalytics(tasks, activePartScope, matchesGprCodeBranch, PROJECT_PART_KEY_TO_ID) {
  if (activePartScope === "project") return tasks;
  if (activePartScope === PROJECT_PART_KEY_TO_ID.residential) {
    return tasks.filter(
      (t) => matchesGprCodeBranch(t.code, "2.04") || matchesGprCodeBranch(t.code, "2.05"),
    );
  }
  if (activePartScope === PROJECT_PART_KEY_TO_ID.parking) {
    return tasks.filter(
      (t) =>
        matchesGprCodeBranch(t.code, "2.06") ||
        matchesGprCodeBranch(t.code, "2.07") ||
        matchesGprCodeBranch(t.code, "2.04") ||
        matchesGprCodeBranch(t.code, "2.05"),
    );
  }
  return tasks;
}

function planFactFlatTasks(tasksForPlanFact, activePartScope, isProjectWide) {
  return flattenTasks(tasksForPlanFact).filter(
    (t) => isProjectWide || t.partId === activePartScope,
  );
}

function loadTasksFromArg(argPath) {
  const raw = fs.readFileSync(argPath, "utf-8");
  if (argPath.endsWith(".json")) {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : parsed.tasks ?? [];
  }
  return null;
}

async function main() {
  const M = await loadModules();
  const {
    filterGprTasksByObjectScope,
    matchesGprCodeBranch,
    normalizeGprCodeFinal,
    gprWbsLevelFromCode,
    resolveGprTaskEffectivePartId,
    PROJECT_PART_KEY_TO_ID,
    mergeGprTasksFromReportCsv,
    decodeCsvBytesWithBestEncoding,
    buildPlanFactWorkTypeChartModel,
  } = M;

  const arg = process.argv[2];
  let tasks = [];
  let source = "sample-csv";

  if (arg) {
    const p = path.isAbsolute(arg) ? arg : path.join(root, arg);
    if (p.endsWith(".json")) {
      tasks = loadTasksFromArg(p);
      source = `json:${p}`;
    } else {
      const buf = fs.readFileSync(p);
      const text = decodeCsvBytesWithBestEncoding(new Uint8Array(buf));
      const { tasks: merged } = mergeGprTasksFromReportCsv([], text);
      tasks = merged;
      source = `csv:${p}`;
    }
  } else {
    const jsonPath = path.join(root, "data", "gpr-import-default.json");
    if (fs.existsSync(jsonPath)) {
      tasks = loadTasksFromArg(jsonPath);
      source = `json:${jsonPath}`;
    } else {
      const csvPath = path.join(root, "data", "gpr-report-sample.csv");
      const buf = fs.readFileSync(csvPath);
      const text = decodeCsvBytesWithBestEncoding(new Uint8Array(buf));
      const { tasks: merged, stats } = mergeGprTasksFromReportCsv([], text);
      tasks = merged;
      source = `csv:${csvPath} (parsed=${stats.parsedRowCount})`;
    }
  }

  const activePartScope = Number(process.env.GPR_SCOPE ?? "1"); // 1=ЖД, 2=стоянка
  const isProjectWide = false;
  const scopeLabel = activePartScope === 2 ? "Автостоянка" : "Жилой дом";

  console.log("=== Источник ===");
  console.log(source);
  console.log("Всего задач после импорта/загрузки:", tasks.length);

  const codes = [...new Set(tasks.map((t) => normalizeGprCodeFinal(t.code)).filter(Boolean))].sort();
  console.log("\n=== Уникальные шифры (первые 30) ===");
  console.log(codes.slice(0, 30).join(", ") || "(нет)");
  console.log("Всего уникальных шифров:", codes.length);

  const partIds = new Map();
  const effPartIds = new Map();
  for (const t of tasks) {
    partIds.set(t.partId, (partIds.get(t.partId) ?? 0) + 1);
    const e = resolveGprTaskEffectivePartId(t);
    effPartIds.set(e, (effPartIds.get(e) ?? 0) + 1);
  }
  console.log("\n=== partId (сырой) ===", Object.fromEntries(partIds));
  console.log("=== effectivePartId ===", Object.fromEntries(effPartIds));

  const wbsLevels = new Map();
  for (const t of tasks) {
    const lv = gprWbsLevelFromCode(t.code, t.level);
    wbsLevels.set(lv, (wbsLevels.get(lv) ?? 0) + 1);
  }
  console.log("\n=== WBS level (gprWbsLevelFromCode) ===", Object.fromEntries(wbsLevels));

  const branch204 = tasks.filter((t) => matchesGprCodeBranch(t.code, "2.04")).length;
  const branch205 = tasks.filter((t) => matchesGprCodeBranch(t.code, "2.05")).length;
  const branch206 = tasks.filter((t) => matchesGprCodeBranch(t.code, "2.06")).length;
  const branch207 = tasks.filter((t) => matchesGprCodeBranch(t.code, "2.07")).length;
  console.log("\n=== Ветки шифров ===");
  console.log(`2.04*: ${branch204}, 2.05*: ${branch205}, 2.06*: ${branch206}, 2.07*: ${branch207}`);

  const step1 = filterGprTasksByObjectScope(tasks, activePartScope);
  console.log(`\n=== Этап: filterGprTasksByObjectScope(${scopeLabel}) ===`);
  console.log("Осталось:", step1.length);

  const step2 = tasksForPlanFactAnalytics(step1, activePartScope, matchesGprCodeBranch, PROJECT_PART_KEY_TO_ID);
  console.log("\n=== Этап: tasksForPlanFactAnalytics (2.04|2.05) ===");
  console.log("Осталось:", step2.length);

  const step3 = planFactFlatTasks(step2, activePartScope, isProjectWide);
  console.log("\n=== Этап: planFactFlatTasks (partId === activePartScope) ===");
  console.log("Осталось:", step3.length);
  const partIdMismatch = step2.filter((t) => t.partId !== activePartScope).length;
  console.log("Отброшено из-за partId !== 1:", partIdMismatch);

  const todayIso = new Date().toISOString().slice(0, 10);
  for (const barLevel of ["detailed", "simplified", "full"]) {
    const model = buildPlanFactWorkTypeChartModel(step3, "residential", todayIso, barLevel);
    const n = model?.labels?.length ?? 0;
    console.log(`\n=== buildPlanFactWorkTypeChartModel (barLevel=${barLevel}) ===`);
    console.log("Строк на диаграмме:", n);
    if (n === 0 && step3.length > 0) {
      const roots = ["2.04", "2.05"];
      const branch = step3.filter((t) => roots.some((r) => matchesGprCodeBranch(t.code, r)));
      const byWbs = new Map();
      for (const t of branch) {
        const lv = gprWbsLevelFromCode(t.code, t.level);
        byWbs.set(lv, (byWbs.get(lv) ?? 0) + 1);
      }
      console.log("  В ветке 2.04/2.05 по WBS level:", Object.fromEntries(byWbs));
      console.log(
        `  detailed требует wbsLevel===2; simplified — level 1 (2.04/2.05); full — только листья`,
      );
    }
  }

  const part1Only = tasks.filter((t) => t.partId === 1);
  console.log(`\n=== Сценарий: только partId=1 (${part1Only.length} задач, как после импорта на вкладке ЖД) ===`);
  console.log(
    "filterGprTasksByObjectScope(Жилой дом):",
    filterGprTasksByObjectScope(part1Only, 1).length,
  );
  const fixedResidential = part1Only.map((t) => ({
    ...t,
    objectType: "Жилой дом",
    projectPartKey: "residential",
    planFactScope: "house",
  }));
  const fixedFiltered = filterGprTasksByObjectScope(fixedResidential, 1);
  console.log("если objectType=«Жилой дом» → filter:", fixedFiltered.length);
  if (fixedFiltered.length > 0) {
    const pf2 = tasksForPlanFactAnalytics(fixedFiltered, 1, matchesGprCodeBranch, PROJECT_PART_KEY_TO_ID);
    const flat2 = planFactFlatTasks(pf2, 1, false);
    const m2 = buildPlanFactWorkTypeChartModel(flat2, "residential", todayIso, "detailed");
    console.log("диаграмма (detailed) при исправленном objectType:", m2?.labels?.length ?? 0);
  }

  console.log("\n=== Первые 20 задач (после filterGprTasksByObjectScope) ===");
  for (const t of step1.slice(0, 20)) {
    const lv = gprWbsLevelFromCode(t.code, t.level);
    console.log(
      [
        `шифр=${t.code}`,
        `название=${(t.name ?? "").slice(0, 40)}`,
        `объект=${t.objectType ?? "—"}`,
        `partId=${t.partId}`,
        `eff=${resolveGprTaskEffectivePartId(t)}`,
        `wbs=${lv}`,
        `план=${t.planStart ?? "—"}…${t.planEnd ?? "—"}`,
        `факт=${t.factStart ?? "—"}…${t.factEnd ?? "—"}`,
      ].join(" | "),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
