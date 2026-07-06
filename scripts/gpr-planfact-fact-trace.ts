/**
 * Трассировка «Динамика выполнения ГПР»: где теряется факт.
 * Без изменений кода. npx tsx scripts/gpr-planfact-fact-trace.ts
 */
import fs from "fs";
import path from "path";

import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { mergeGprTasksFromReportCsv } from "../lib/gprTasksMergeFromReportCsv";
import {
  aggregatePlanFactBranchSchedule,
  auditPlanFactChartModel,
  buildPlanFactWorkTypeChartModel,
  collectPlanFactBranchTasks,
  planFactGprBarSpanPct,
  resolvePlanFactChartFactEnd,
  type PlanFactTasksBarLevel,
} from "../lib/planFactWorkTypeTimeline";
import {
  computeGprStageCompletionInsight,
  filterGprTasksForKpiAnalytics,
  getGprKpiWorkItems,
  getGprStageWorkItems,
  isGprCsvArticleWork,
  isGprTaskFactCompleted,
} from "../lib/gprStageCompletion";
import {
  filterGprTasksByObjectScope,
  filterZhDomPlanFactTasksTo205Branch,
  flattenTasks,
  getCalendarFactProgressPercent,
  normalizeGprCodeFinal,
  parseDateSafe,
  type GPRTask,
} from "../lib/gprUtils";
import seed from "../data/gpr-import-default.json";

const ROOT = process.cwd();
const csvPath = path.join(ROOT, "data", "Исполнение ГПР_май.csv");
const todayIso = "2026-05-31";
const asOf = new Date(`${todayIso}T12:00:00`);

function parseFactPercent(label: string): number | null {
  const text = label.trim();
  if (!text || text === "—") return null;
  const value = Number.parseFloat(text.replace("%", "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function factLossReason(opts: {
  factRange: [number, number] | null;
  factLabel: string;
  factSpanWidth: number | null;
  fs: string | null;
  fe: string | null;
  showFactGate: boolean;
}): string {
  const parts: string[] = [];
  if (!opts.fs && !opts.fe) parts.push("нет factStart/factEnd в rowDetails");
  if (opts.factRange == null) parts.push("factRanges[i]=null в модели таймлайна");
  if (opts.factLabel === "" || opts.factLabel === "—")
    parts.push(`factCompletionLabels пусто («${opts.factLabel}»)`);
  const pct = parseFactPercent(opts.factLabel);
  if (pct == null || pct <= 0) parts.push(`showFact=false (parseFactPercent=${pct})`);
  if (opts.factSpanWidth == null || opts.factSpanWidth <= 0)
    parts.push(`factSpan width=${opts.factSpanWidth}`);
  if (!opts.showFactGate) parts.push("React: showFact=false → displayedFactSpan=null");
  return parts.length > 0 ? parts.join("; ") : "OK — должен отображаться";
}

// --- 1. CSV → merge ---
const text = decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync(csvPath)));
const part1 = mergeGprTasksFromReportCsv([], text, { forcedPartId: 1 }).tasks;
const jsonTasks = (seed as { tasks: GPRTask[] }).tasks;

console.log("=== 1. CSV → Parser → JSON ===");
console.log("CSV part1 tasks:", part1.length);
console.log("JSON tasks:", jsonTasks.length);
console.log("part1 with articleNumber:", part1.filter(isGprCsvArticleWork).length);

// --- 2. KPI first completed work ---
const scoped = filterGprTasksByObjectScope(jsonTasks, 1);
const planFactSource = filterZhDomPlanFactTasksTo205Branch(scoped);
const kpiPool = filterGprTasksForKpiAnalytics(scoped);
const kpiWorks = kpiPool.filter((t) => isGprTaskFactCompleted(t, asOf));
kpiWorks.sort((a, b) => (a.articleNumber ?? 0) - (b.articleNumber ?? 0));
const firstCompleted = kpiWorks[0] ?? null;

console.log("\n=== 2. Первая выполненная работа KPI (жилой дом) ===");
if (firstCompleted) {
  console.log({
    id: firstCompleted.id,
    articleNumber: firstCompleted.articleNumber,
    code: firstCompleted.code,
    planStart: firstCompleted.planStart,
    planEnd: firstCompleted.planEnd,
    factStart: firstCompleted.factStart,
    factEnd: firstCompleted.factEnd,
    completion: firstCompleted.completion,
    calendarFactPct: getCalendarFactProgressPercent(firstCompleted, asOf),
  });
} else {
  console.log("(нет выполненных)");
}

// --- 3. Chart model (detailed = default UI) ---
const planFactFlat = flattenTasks(planFactSource).filter((t) => t.partId === 1);

for (const barLevel of ["detailed", "full", "simplified"] as PlanFactTasksBarLevel[]) {
  console.log(`\n=== 3. Модель таймлайна [${barLevel}] ===`);
  const planFactFlatRows = planFactFlat;
  const model = buildPlanFactWorkTypeChartModel(
    planFactFlatRows,
    "residential",
    todayIso,
    barLevel,
    planFactFlatRows,
  );
  if (!model) {
    console.log("model=null");
    continue;
  }
  const audit = auditPlanFactChartModel(model);
  console.log("rows:", model.labels.length);
  console.log("audit:", audit);

  let firstNullFactIdx: number | null = null;
  let firstZeroWidthIdx: number | null = null;
  let firstShowFactFalseIdx: number | null = null;

  const rows = model.labels.map((label, i) => {
    const d = model.rowDetails[i]!;
    const planRange = model.planRanges[i] ?? null;
    const factRange = model.factRanges[i] ?? null;
    const planSpan = planFactGprBarSpanPct(planRange, model.xMin, model.xMax);
    const factSpan = planFactGprBarSpanPct(factRange, model.xMin, model.xMax);
    const factLabel = model.factCompletionLabels[i] ?? "";
    const pct = parseFactPercent(factLabel);
    const showFact = pct != null && pct > 0;
    const displayedFact =
      showFact && factSpan
        ? factSpan
        : null;

    if (firstNullFactIdx == null && factRange == null) firstNullFactIdx = i;
    if (firstZeroWidthIdx == null && factSpan && factSpan.widthPct <= 0) firstZeroWidthIdx = i;
    if (firstShowFactFalseIdx == null && !showFact && factRange != null) firstShowFactFalseIdx = i;

    const code = label.split(" — ")[0] ?? label;
    const chartTask = planFactFlat.find(
      (t) => normalizeGprCodeFinal(t.code) === normalizeGprCodeFinal(code),
    );

    return {
      index: i,
      label: label.slice(0, 48),
      chartRowCode: code,
      chartRowId: chartTask?.id ?? "—",
      chartRowArticle: chartTask?.articleNumber ?? null,
      plannedStart: d.planStart || null,
      plannedFinish: d.planEnd || null,
      factStart: d.factStart,
      factFinish: d.factEnd,
      factPercentLabel: factLabel,
      factPercentParsed: pct,
      planSpan: planSpan ? `${planSpan.leftPct.toFixed(1)}% w=${planSpan.widthPct.toFixed(1)}%` : null,
      factSpan: factSpan ? `${factSpan.leftPct.toFixed(1)}% w=${factSpan.widthPct.toFixed(1)}%` : null,
      factRangeRaw: factRange,
      displayedFactSpan: displayedFact
        ? `w=${displayedFact.widthPct.toFixed(1)}%`
        : null,
      showFact,
      reason: factLossReason({
        factRange,
        factLabel,
        factSpanWidth: factSpan?.widthPct ?? null,
        fs: d.factStart,
        fe: d.factEnd,
        showFactGate: showFact,
      }),
    };
  });

  const withFact = rows.filter((r) => r.displayedFactSpan != null);
  const withKpiPct = rows.filter((r) => r.factPercentParsed != null && r.factPercentParsed > 0);
  const withFactRange = rows.filter((r) => r.factRangeRaw != null);
  console.log(`displayedFactSpan>0: ${withFact.length}/${rows.length}`);
  console.log(`factRanges non-null: ${withFactRange.length}/${rows.length}`);
  console.log(`factPercent>0 labels: ${withKpiPct.length}/${rows.length}`);
  console.log("first factRanges=null at index:", firstNullFactIdx);
  console.log("first showFact=false despite factRange at:", firstShowFactFalseIdx);

  // Rows with any fact signal
  const interesting = rows.filter(
    (r) =>
      r.factPercentParsed != null && r.factPercentParsed > 0 ||
      r.factStart ||
      r.factFinish,
  );
  console.log("\n--- Строки с фактом (первые 8) ---");
  for (const r of interesting.slice(0, 8)) {
    console.log(r);
  }

  // Trace first completed KPI work's parent chart row
  if (firstCompleted && barLevel === "detailed") {
    const parentCode = normalizeGprCodeFinal(firstCompleted.code)
      .split(".")
      .slice(0, 3)
      .join(".");
    const parentRow = rows.find((r) => normalizeGprCodeFinal(r.chartRowCode) === parentCode);
    console.log(`\n--- Родительская строка графика для KPI work ${firstCompleted.code} (parent ${parentCode}) ---`);
    console.log(parentRow ?? "(строка не найдена в графике)");

    const branch = collectPlanFactBranchTasks(
      planFactFlat.find((t) => normalizeGprCodeFinal(t.code) === parentCode) ?? firstCompleted,
      planFactFlat,
    );
    const sched = aggregatePlanFactBranchSchedule(branch, todayIso);
    const artInBranch = branch.filter(isGprCsvArticleWork);
    const leavesInBranch = getGprStageWorkItems(planFactFlat, branch[0] ?? firstCompleted);
    console.log("branch tasks:", branch.length, "article:", artInBranch.length, "wbs leaves:", leavesInBranch.length);
    console.log("aggregatePlanFactBranchSchedule:", sched);
    console.log(
      "KPI items under parent:",
      getGprKpiWorkItems(planFactFlat, branch.find((t) => normalizeGprCodeFinal(t.code) === parentCode) ?? firstCompleted).length,
    );
  }
}

// --- 4. First completed: direct fact end resolution ---
if (firstCompleted) {
  console.log("\n=== 4. resolvePlanFactChartFactEnd (первая KPI-работа) ===");
  console.log("factEnd:", resolvePlanFactChartFactEnd(firstCompleted, planFactFlat, todayIso));
  console.log("parseDateSafe factStart:", parseDateSafe(firstCompleted.factStart));
  console.log("parseDateSafe factEnd:", parseDateSafe(firstCompleted.factEnd));
}
