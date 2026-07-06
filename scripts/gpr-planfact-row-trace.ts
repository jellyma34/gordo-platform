/**
 * Полная трассировка строк «Динамика выполнения ГПР».
 * Только диагностика, без изменений кода.
 * npx tsx scripts/gpr-planfact-row-trace.ts
 */
import fs from "fs";
import path from "path";

import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { parseGprReportCsv, type GprReportCsvRow } from "../lib/gprReportCsv";
import { mergeGprTasksFromReportCsv } from "../lib/gprTasksMergeFromReportCsv";
import {
  aggregatePlanFactArticleFactSchedule,
  aggregatePlanFactBranchPlanSchedule,
  aggregatePlanFactBranchSchedule,
  buildPlanFactWorkTypeChartModel,
  collectPlanFactArticleWorkItems,
  collectPlanFactBranchTasks,
  planFactGprBarSpanPct,
  type PlanFactWorkTypeChartModel,
} from "../lib/planFactWorkTypeTimeline";
import {
  computeGprStageCompletionInsight,
  isGprCsvArticleWork,
} from "../lib/gprStageCompletion";
import {
  filterGprTasksByObjectScope,
  filterZhDomPlanFactTasksTo205Branch,
  flattenTasks,
  gprWbsLevelFromCode,
  normalizeGprCodeFinal,
  parseDateSafe,
  type GPRTask,
} from "../lib/gprUtils";
import seed from "../data/gpr-import-default.json";

const ROOT = process.cwd();
const csvPath = path.join(ROOT, "data", "Исполнение ГПР_май.csv");
const todayIso = "2026-05-31";
const asOf = new Date(`${todayIso}T12:00:00`);
const BAR_LEVEL = "detailed" as const;

function resolvePlanFactBarRowScheduleDiag(rowTask: GPRTask, allTasks: GPRTask[], todayIso: string) {
  const branch = collectPlanFactBranchTasks(rowTask, allTasks);
  const articleWorks = collectPlanFactArticleWorkItems(rowTask, allTasks);
  const plan = aggregatePlanFactBranchPlanSchedule(branch);
  const fact = aggregatePlanFactArticleFactSchedule(articleWorks, todayIso);
  return {
    planStart: plan?.planStart ?? null,
    planEnd: plan?.planEnd ?? null,
    factStart: fact?.factStart ?? null,
    factEnd: fact?.factEnd ?? null,
  };
}

function chartRowTasksFromModel(model: PlanFactWorkTypeChartModel, flat: GPRTask[]): GPRTask[] {
  return model.labels
    .map((label) => {
      const code = label.split(" — ")[0] ?? label;
      return flat.find((t) => normalizeGprCodeFinal(t.code) === normalizeGprCodeFinal(code)) ?? null;
    })
    .filter((t): t is GPRTask => t != null);
}

function parseFactPercent(label: string): number | null {
  const text = label.trim();
  if (!text || text === "—") return null;
  const value = Number.parseFloat(text.replace("%", "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function fmtSpan(span: { leftPct: number; widthPct: number } | null): string {
  if (!span) return "null";
  return `L=${span.leftPct.toFixed(1)}% W=${span.widthPct.toFixed(1)}%`;
}

function fmtRange(r: [number, number] | null): string {
  if (!r) return "null";
  return `[${r[0].toFixed(2)}, ${r[1].toFixed(2)}]`;
}

function planBarLossReason(opts: {
  planRange: [number, number] | null;
  planSpan: { leftPct: number; widthPct: number } | null;
  hasDates: boolean | undefined;
  planStart: string;
  planEnd: string;
  xMax: number;
}): string {
  const parts: string[] = [];
  if (!opts.planStart && !opts.planEnd) parts.push("нет planStart/planEnd в rowDetails");
  if (opts.hasDates === false) parts.push("hasDates=false");
  if (opts.planRange == null) parts.push("planRanges[i]=null");
  else {
    const w = opts.planRange[1] - opts.planRange[0];
    if (w < 0.25) parts.push(`planRange узкий (${w.toFixed(2)} мес) — stub у today, не реальный план`);
  }
  if (opts.planSpan == null) parts.push("planFactGprBarSpanPct→null (width<=0)");
  else if (opts.planSpan.widthPct < 1) parts.push(`planSpan слишком узкий (${opts.planSpan.widthPct.toFixed(2)}%)`);
  return parts.length ? parts.join("; ") : "OK";
}

function factBarLossReason(opts: {
  factRange: [number, number] | null;
  factSpan: { leftPct: number; widthPct: number } | null;
  displayedFactSpan: { leftPct: number; widthPct: number } | null;
  factStart: string | null;
  factEnd: string | null;
  factLabel: string;
  showFact: boolean;
  showZeroFactPercent: boolean;
}): string {
  const parts: string[] = [];
  if (!opts.factStart && !opts.factEnd) parts.push("нет factStart/factEnd в rowDetails");
  if (opts.factRange == null) parts.push("factRanges[i]=null");
  const pct = parseFactPercent(opts.factLabel);
  if (pct == null || pct <= 0) parts.push(`showFact=false (factLabel=${opts.factLabel || "—"}, pct=${pct})`);
  if (opts.factSpan == null && opts.factRange != null)
    parts.push("factSpan=null при ненулевом factRange (width<=0)");
  if (opts.showFact && opts.factSpan && !opts.displayedFactSpan)
    parts.push("React gate: showFact без displayedFactSpan");
  if (!opts.showFact && opts.factRange != null)
    parts.push("факт в модели есть, но React showFact=false");
  if (opts.showFact && !opts.factSpan && !opts.showZeroFactPercent)
    parts.push("showFact=true но factSpan=null и showZeroFactPercent=false");
  return parts.length ? parts.join("; ") : "OK";
}

function simulateDisplayedSpans(
  model: PlanFactWorkTypeChartModel,
  index: number,
  showZeroFactPercent = false,
) {
  const planRange = model.planRanges[index] ?? null;
  const factRange = model.factRanges[index] ?? null;
  const planSpan = planFactGprBarSpanPct(planRange, model.xMin, model.xMax);
  const factSpan = planFactGprBarSpanPct(factRange, model.xMin, model.xMax);
  const factPctRaw = model.factCompletionLabels[index]?.trim() ?? "";
  const factPercent = parseFactPercent(factPctRaw);
  const showFact =
    (factPercent != null && (factPercent > 0 || (showZeroFactPercent && factPercent <= 0))) ||
    Boolean(factSpan && factSpan.widthPct > 0);
  const displayedFactSpan =
    showFact && factSpan
      ? factSpan
      : showFact && showZeroFactPercent && factPercent === 0 && planSpan
        ? { leftPct: planSpan.leftPct, widthPct: Math.max(1.5, planSpan.widthPct * 0.06) }
        : null;
  return { planSpan, factSpan, displayedPlanSpan: planSpan, displayedFactSpan, showFact, factPercent };
}

// ─── 1. CSV raw ───
const csvText = decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync(csvPath)));
const csvRows = parseGprReportCsv(csvText);
const jsonTasks = (seed as { tasks: GPRTask[] }).tasks;

const csvWithPlan = csvRows.filter((r) => parseDateSafe(r.planStart) && parseDateSafe(r.planEnd));
const csvWithFact = csvRows.filter((r) => parseDateSafe(r.factStart) || parseDateSafe(r.factEnd));
const csvArtRows = csvRows.filter((r) => r.articleNumber != null && r.articleNumber > 0);

console.log("═══════════════════════════════════════════════════════════");
console.log("  ТРАССИРОВКА «Динамика выполнения ГПР» (detailed, жилой дом)");
console.log("═══════════════════════════════════════════════════════════");
console.log("\n── 1. CSV Parser ──");
console.log(`  строк CSV (задачи): ${csvRows.length}`);
console.log(`  с articleNumber: ${csvArtRows.length}`);
console.log(`  с planStart+planEnd: ${csvWithPlan.length}`);
console.log(`  с factStart/factEnd: ${csvWithFact.length}`);

// ─── 2. Merge JSON + CSV (как в приложении) ───
const merged = mergeGprTasksFromReportCsv(jsonTasks, csvText, { forcedPartId: 1 });
const mergedTasks = merged.tasks;

const scoped = filterGprTasksByObjectScope(mergedTasks, 1);
const planFactTree = filterZhDomPlanFactTasksTo205Branch(scoped);
const planFactFlat = flattenTasks(planFactTree).filter((t) => t.partId === 1);

console.log("\n── 2. JSON + mergeGprTasksFromReportCsv ──");
console.log(`  merged tasks part1: ${planFactFlat.length}`);
console.log(`  articleNumber rows: ${planFactFlat.filter(isGprCsvArticleWork).length}`);
console.log(`  WBS rows (no article): ${planFactFlat.filter((t) => !isGprCsvArticleWork(t)).length}`);
console.log(
  `  merged with planStart+planEnd: ${planFactFlat.filter((t) => parseDateSafe(t.planStart) && parseDateSafe(t.planEnd)).length}`,
);
console.log(
  `  merged WBS with plan: ${planFactFlat.filter((t) => !isGprCsvArticleWork(t) && parseDateSafe(t.planStart)).length}`,
);
console.log(
  `  merged article with plan: ${planFactFlat.filter((t) => isGprCsvArticleWork(t) && parseDateSafe(t.planStart)).length}`,
);

// ─── 5. planStart lost after parsing ───
type CsvLossRow = { code: string; article: number | null; csvPlanStart: string | null; mergedPlanStart: string | null };
const planLostAfterParse: CsvLossRow[] = [];
for (const row of csvRows) {
  if (!parseDateSafe(row.planStart)) continue;
  const code = normalizeGprCodeFinal(row.code);
  const match = planFactFlat.find(
    (t) =>
      normalizeGprCodeFinal(t.code) === code &&
      (row.articleNumber == null
        ? !isGprCsvArticleWork(t)
        : t.articleNumber === row.articleNumber),
  );
  if (!match || !parseDateSafe(match.planStart)) {
    planLostAfterParse.push({
      code,
      article: row.articleNumber,
      csvPlanStart: row.planStart,
      mergedPlanStart: match?.planStart ?? null,
    });
  }
}
console.log("\n── 5. planStart в CSV, но null после merge ──");
console.log(`  потерянных строк: ${planLostAfterParse.length}`);
for (const r of planLostAfterParse.slice(0, 8)) {
  console.log(`    ${r.code} art=${r.article ?? "—"} csv=${r.csvPlanStart} → merged=${r.mergedPlanStart ?? "null"}`);
}

// ─── Chart model ───
const model = buildPlanFactWorkTypeChartModel(
  planFactFlat,
  "residential",
  todayIso,
  BAR_LEVEL,
  planFactFlat,
);
if (!model) {
  console.error("model=null");
  process.exit(1);
}

const chartRowTasks = chartRowTasksFromModel(model, planFactFlat);
console.log("\n── 3. filterGprTasksForPlanFactBarLevel (detailed, level=2) ──");
console.log(`  строк графика (WBS level 2): ${chartRowTasks.length}`);
console.log(
  `  из них articleNumber: ${chartRowTasks.filter(isGprCsvArticleWork).length} (ожидается 0 — график на WBS)`,
);
console.log(
  `  WBS chart rows с planStart: ${chartRowTasks.filter((t) => parseDateSafe(t.planStart)).length}`,
);

console.log("\n── buildGprPlanFactBarChartModel ──");
console.log(`  xMin=${model.xMin} xMax=${model.xMax.toFixed(2)} todayX=${model.todayX?.toFixed(2)}`);
console.log(`  rows: ${model.labels.length}`);

// ─── Per-row trace ───
type RowTrace = {
  index: number;
  code: string;
  articleNumber: number | null;
  chartRowKind: string;
  planStart: string;
  planEnd: string;
  factStart: string | null;
  factEnd: string | null;
  completion: string;
  hasDates: boolean | undefined;
  planRange: string;
  factRange: string;
  planSpan: string;
  factSpan: string;
  displayedPlanSpan: string;
  displayedFactSpan: string;
  factLabel: string;
  planLoss: string;
  factLoss: string;
  branchArticles: number;
  branchPlanAgg: string;
  branchSched: string;
};

const traces: RowTrace[] = [];

for (let i = 0; i < model.labels.length; i++) {
  const label = model.labels[i]!;
  const code = label.split(" — ")[0] ?? label;
  const chartTask =
    chartRowTasks.find((t) => normalizeGprCodeFinal(t.code) === normalizeGprCodeFinal(code)) ??
    planFactFlat.find((t) => normalizeGprCodeFinal(t.code) === normalizeGprCodeFinal(code)) ??
    null;

  const d = model.rowDetails[i]!;
  const planRange = model.planRanges[i] ?? null;
  const factRange = model.factRanges[i] ?? null;
  const spans = simulateDisplayedSpans(model, i, false);

  const branch = chartTask
    ? collectPlanFactBranchTasks(chartTask, planFactFlat)
    : [];
  const articles = chartTask
    ? collectPlanFactArticleWorkItems(chartTask, planFactFlat)
    : [];
  const planAgg = aggregatePlanFactBranchPlanSchedule(branch);
  const branchSched = chartTask
    ? aggregatePlanFactBranchSchedule(branch, todayIso)
    : null;
  const rowSched = chartTask
    ? resolvePlanFactBarRowScheduleDiag(chartTask, planFactFlat, todayIso)
    : null;

  const insight = chartTask
    ? computeGprStageCompletionInsight(planFactFlat, chartTask, asOf)
    : null;

  traces.push({
    index: i,
    code,
    articleNumber: chartTask?.articleNumber ?? null,
    chartRowKind: chartTask
      ? isGprCsvArticleWork(chartTask)
        ? "articleNumber"
        : `WBS-L${gprWbsLevelFromCode(chartTask.code, chartTask.level)}`
      : "—",
    planStart: d.planStart || chartTask?.planStart || "—",
    planEnd: d.planEnd || chartTask?.planEnd || "—",
    factStart: d.factStart,
    factEnd: d.factEnd,
    completion: insight ? `${insight.factPercent}%` : "—",
    hasDates: d.hasDates,
    planRange: fmtRange(planRange),
    factRange: fmtRange(factRange),
    planSpan: fmtSpan(spans.planSpan),
    factSpan: fmtSpan(spans.factSpan),
    displayedPlanSpan: fmtSpan(spans.displayedPlanSpan),
    displayedFactSpan: fmtSpan(spans.displayedFactSpan),
    factLabel: model.factCompletionLabels[i] ?? "",
    planLoss: planBarLossReason({
      planRange,
      planSpan: spans.planSpan,
      hasDates: d.hasDates,
      planStart: d.planStart,
      planEnd: d.planEnd,
      xMax: model.xMax,
    }),
    factLoss: factBarLossReason({
      factRange,
      factSpan: spans.factSpan,
      displayedFactSpan: spans.displayedFactSpan,
      factStart: d.factStart,
      factEnd: d.factEnd,
      factLabel: model.factCompletionLabels[i] ?? "",
      showFact: spans.showFact,
      showZeroFactPercent: false,
    }),
    branchArticles: articles.length,
    branchPlanAgg: planAgg ? `${planAgg.planStart}…${planAgg.planEnd}` : "null",
    branchSched: rowSched
      ? `P:${rowSched.planStart ?? "∅"}/${rowSched.planEnd ?? "∅"} F:${rowSched.factStart ?? "∅"}/${rowSched.factEnd ?? "∅"}`
      : "—",
  });

  // Extra dump for aggregate chain on first rows
  if (i < 3 && chartTask) {
    console.log(`\n  [chain ${code}] chartTask.planStart=${chartTask.planStart ?? "null"}`);
    console.log(`    branch=${branch.length} articles=${articles.length} planAgg=${traces[i]!.branchPlanAgg}`);
    console.log(`    resolvePlanFactBarRowSchedule: ${traces[i]!.branchSched}`);
    const artWithPlan = articles.filter((t) => parseDateSafe(t.planStart)).length;
    const artWithFact = articles.filter((t) => parseDateSafe(t.factStart)).length;
    console.log(`    articles: plan=${artWithPlan}/${articles.length} fact=${artWithFact}/${articles.length}`);
  }
}

// ─── Table first 20 ───
console.log("\n═══════════════════════════════════════════════════════════");
console.log("  ТАБЛИЦА: первые 20 строк графика");
console.log("═══════════════════════════════════════════════════════════");
const hdr =
  "Код".padEnd(10) +
  "| Art | planStart  | planEnd    | factStart  | factEnd    | planSpan              | factSpan              | причина";
console.log(hdr);
console.log("-".repeat(hdr.length + 40));

for (const t of traces.slice(0, 20)) {
  const reason =
    t.displayedPlanSpan === "null" || t.planSpan.includes("W=0") || t.planSpan.includes("W=0.")
      ? `ПЛАН: ${t.planLoss}`
      : t.displayedFactSpan === "null" && (t.factStart || t.factEnd || parseFactPercent(t.factLabel) != null)
        ? `ФАКТ: ${t.factLoss}`
        : t.displayedFactSpan === "null" && parseFactPercent(t.factLabel) === 0
          ? "нет факта (0%)"
          : "OK";
  console.log(
    `${t.code.padEnd(10)}| ${String(t.articleNumber ?? "—").padEnd(3)} | ${(t.planStart || "—").slice(0, 10).padEnd(10)} | ${(t.planEnd || "—").slice(0, 10).padEnd(10)} | ${(t.factStart || "—").slice(0, 10).padEnd(10)} | ${(t.factEnd || "—").slice(0, 10).padEnd(10)} | ${t.planSpan.padEnd(21)} | ${t.factSpan.padEnd(21)} | ${reason.slice(0, 60)}`,
  );
}

// ─── Full detail all rows ───
console.log("\n═══════════════════════════════════════════════════════════");
console.log("  ПОЛНЫЙ DUMP (все строки)");
console.log("═══════════════════════════════════════════════════════════");
for (const t of traces) {
  console.log(JSON.stringify(t, null, 0));
}

// ─── Summary questions ───
const planMissing = traces.filter(
  (t) => t.planSpan === "null" || t.planSpan.includes("W=0.") || t.planLoss.includes("stub"),
);
const factWithDatesNoSpan = traces.filter(
  (t) => (t.factStart || t.factEnd) && t.displayedFactSpan === "null",
);
const inProgressNoSpan = traces.filter((t) => {
  const pct = parseFactPercent(t.factLabel);
  return pct != null && pct > 0 && pct < 100 && t.displayedFactSpan === "null";
});

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  ОТВЕТЫ НА ВОПРОСЫ");
console.log("═══════════════════════════════════════════════════════════");

console.log("\n1. Почему плановые полосы отсутствуют при датах в CSV?");
const wbsNoPlan = chartRowTasks.filter((t) => !parseDateSafe(t.planStart)).length;
console.log(`   - Строки графика = WBS level 2 (${chartRowTasks.length} шт), не articleNumber`);
console.log(`   - WBS chart rows без planStart на самой строке: ${wbsNoPlan}/${chartRowTasks.length}`);
const stubPlan = traces.filter((t) => t.planLoss.includes("stub")).length;
const realPlan = traces.filter((t) => t.planSpan !== "null" && !t.planLoss.includes("stub") && t.hasDates).length;
console.log(`   - Строк с реальным planRange (hasDates): ${realPlan}`);
console.log(`   - Строк со stub-plan у today (ширина <0.25 мес): ${stubPlan}`);
console.log(`   - planLostAfterParse (CSV→merge): ${planLostAfterParse.length} строк`);

console.log("\n2. Почему «выполняется» без factSpan?");
console.log(`   - Строк in-progress (0<pct<100) без displayedFactSpan: ${inProgressNoSpan.length}`);
for (const t of inProgressNoSpan.slice(0, 5)) {
  console.log(`     ${t.code}: ${t.factLoss}`);
}

console.log("\n3. Использует ли график WBS вместо articleNumber?");
console.log(
  `   - Да. detailed mode: filterGprTasksForPlanFactBarLevel → wbsLevel===2, article в строках: ${chartRowTasks.filter(isGprCsvArticleWork).length}`,
);
console.log(`   - Факт агрегируется из articleNumber через collectPlanFactArticleWorkItems`);

console.log("\n4. Агрегирование веток WBS — потеря дат:");
const aggFails = traces.filter((t) => t.branchArticles > 0 && t.branchPlanAgg === "null");
console.log(`   - Строк с articles>0 но planAgg=null: ${aggFails.length}`);
for (const t of aggFails.slice(0, 5)) {
  console.log(`     ${t.code}: articles=${t.branchArticles} planAgg=null`);
}
const aggOkNoBar = traces.filter((t) => t.branchPlanAgg !== "null" && t.planLoss.includes("stub"));
console.log(`   - planAgg OK, но bar stub (даты не попали в rowDetails): ${aggOkNoBar.length}`);

console.log("\n5. planStart в CSV → null после парсинга:");
console.log(`   - ${planLostAfterParse.length} строк (см. выше)`);

console.log("\n6. factStart/factEnd есть, factSpan null:");
console.log(`   - ${factWithDatesNoSpan.length} строк`);
for (const t of factWithDatesNoSpan.slice(0, 8)) {
  console.log(`     ${t.code}: ${t.factLoss} | factRange=${t.factRange}`);
}

// First break point
console.log("\n═══════════════════════════════════════════════════════════");
console.log("  ПЕРВОЕ МЕСТО ПОТЕРИ ДАННЫХ");
console.log("═══════════════════════════════════════════════════════════");

let breakPoint = "";
if (chartRowTasks.filter((t) => !parseDateSafe(t.planStart)).length === chartRowTasks.length) {
  breakPoint =
    "filterGprTasksForPlanFactBarLevel → WBS level-2 строки: planStart/planEnd = null на самих узлах (данные только у articleNumber-дочерних)";
} else if (planLostAfterParse.length > 0) {
  breakPoint = "mergeGprTasksFromReportCsv / taskIdentityKey — коллизия шифра WBS и article, CSV-даты затираются или не сливаются";
} else {
  const firstStub = traces.find((t) => t.branchPlanAgg !== "null" && t.planLoss.includes("stub"));
  if (firstStub) {
    breakPoint = `buildGprPlanFactBarChartModel (строка ${firstStub.code}): resolvePlanFactBarRowSchedule возвращает даты, но hasPlanDates=false → stub [today±0.12] вместо planSpan`;
  } else {
    const firstFact = factWithDatesNoSpan[0];
    if (firstFact) {
      breakPoint = `buildGprPlanFactBarChartModel / clampFactMonthFloatRangeToPlan (строка ${firstFact.code}): ${firstFact.factLoss}`;
    } else {
      breakPoint = "PlanFactGprDynamicsChartPanel: showFact gate скрывает factSpan при factPercent=0";
    }
  }
}
console.log(`  → ${breakPoint}`);
