import {
  compareGprCodesByNumericPath,
  gprPlanFactCompositeKey,
  gprPlanFactScopeFromTask,
  gprWbsLevelFromCode,
  matchesGprCodeBranch,
  normalizeGprCodeFinal,
  parseDateSafe,
  sortGprTasksByCode,
  type GPRTask,
  type ProjectPartKey,
} from "@/lib/gprUtils";
import { buildPlanFactProjectWideRows } from "@/lib/gprProjectPlanFactStages";
import { aggregateWorksToProjectPlanFactBounds } from "@/lib/gprProjectOverview";
import {
  computeGprStageCompletionInsight,
  filterGprTasksForKpiAnalytics,
  formatGprStageFactPercentValue,
  formatGprStageKpiFactDisplay,
  formatGprStageKpiPlanDisplay,
  gprStageWorkItemBusinessStatus,
  isGprCsvArticleWork,
  isGprStageFactCompletionNoData,
} from "@/lib/gprStageCompletion";

export {
  buildAggregatedProjectWideStagesSummary,
  type AggregatedProjectWideStage,
  type AggregatedProjectWideStageId,
} from "@/lib/gprProjectPlanFactStages";

const RU_MONTH_SHORT = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек",
] as const;

/** Подпись сетки: «Янв 26» (без дня). */
export function formatPlanFactGridMonthLabel(d: Date): string {
  return `${RU_MONTH_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}

/**
 * Подпись строки диаграммы «План vs Факт»: только шифр и «Этап работ» из CSV.
 * @example `2.05.01 — Земляные работы`
 */
export function formatGprPlanFactBarLabel(code: string, stageName: string): string {
  const codeDisp = normalizeGprCodeFinal(code);
  const stage = String(stageName ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!codeDisp) return stage || "—";
  if (!stage) return codeDisp;
  return `${codeDisp} — ${stage}`;
}

/** «Плановая дата окончания» — только месяц и год, без дня. */
export function formatPlanEndMonthYearOnly(iso: string): string {
  const d = new Date(`${iso.trim()}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(d);
}

const WORK_TYPE_GROUPS: Record<
  ProjectPartKey,
  { key: string; label: string; match: (code: string) => boolean }[]
> = {
  residential: [
    { key: "build", label: "Строительство", match: (c) => normalizeGprCodeFinal(c).startsWith("2.05") },
  ],
  parking: [
    { key: "build", label: "Строительство", match: (c) => matchesGprCodeBranch(c, "2.05") },
    { key: "net", label: "Инженерные сети", match: (c) => matchesGprCodeBranch(c, "2.06") },
    { key: "improve", label: "Благоустройство", match: (c) => matchesGprCodeBranch(c, "2.07") },
  ],
};

export type PlanFactWorkTypePartKey = ProjectPartKey | "project";

export type PlanFactWorkTypeRow = {
  key: string;
  label: string;
  bounds: ReturnType<typeof aggregateWorksToProjectPlanFactBounds>;
};

export function buildPlanFactWorkTypeRows(
  tasks: GPRTask[],
  partKey: PlanFactWorkTypePartKey,
): PlanFactWorkTypeRow[] {
  if (partKey === "project") {
    return buildPlanFactProjectWideRows(tasks);
  }
  const groups = WORK_TYPE_GROUPS[partKey];
  return groups.map((g) => ({
    key: g.key,
    label: g.label,
    bounds: aggregateWorksToProjectPlanFactBounds(
      tasks.filter((t) => g.match(normalizeGprCodeFinal(t.code))),
    ),
  }));
}

function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate();
}

/** Месяцы (дробь) от начала `originMonth` (первое число месяца). */
function monthFloatFromIso(iso: string, originMonth: Date): number | null {
  const t = iso?.trim();
  if (!t) return null;
  const d = new Date(`${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const oy = originMonth.getFullYear();
  const om = originMonth.getMonth();
  let months = (d.getFullYear() - oy) * 12 + (d.getMonth() - om);
  const dim = daysInMonth(d.getFullYear(), d.getMonth());
  months += (d.getDate() - 1) / Math.max(1, dim);
  return months;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isoDayMs(iso: string | null | undefined): number | null {
  const s = parseDateSafe(iso ?? undefined);
  if (!s) return null;
  const ms = new Date(`${s}T12:00:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function minIsoDate(isos: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestMs = Infinity;
  for (const raw of isos) {
    const iso = parseDateSafe(raw ?? undefined);
    if (!iso) continue;
    const ms = isoDayMs(iso);
    if (ms == null || ms >= bestMs) continue;
    bestMs = ms;
    best = iso;
  }
  return best;
}

function maxIsoDate(isos: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const raw of isos) {
    const iso = parseDateSafe(raw ?? undefined);
    if (!iso) continue;
    const ms = isoDayMs(iso);
    if (ms == null || ms <= bestMs) continue;
    bestMs = ms;
    best = iso;
  }
  return best;
}

export type PlanFactBarSchedule = {
  planStart: string | null;
  planEnd: string | null;
  factStart: string | null;
  factEnd: string | null;
};

/** Все работы ветки `root` / `root.*` в той же секции объекта, что и строка диаграммы. */
export function collectPlanFactBranchTasks(rowTask: GPRTask, allTasks: GPRTask[]): GPRTask[] {
  const root = normalizeGprCodeFinal(rowTask.code);
  if (!root) return [rowTask];
  const partition = planFactBarPartitionKey(rowTask);
  const prefix = `${root}.`;
  return allTasks.filter((t) => {
    if (planFactBarPartitionKey(t) !== partition) return false;
    const c = normalizeGprCodeFinal(t.code);
    return c === root || c.startsWith(prefix);
  });
}

/** CSV-работы («№ статей») в ветке строки диаграммы — источник факта. */
export function collectPlanFactArticleWorkItems(rowTask: GPRTask, allTasks: GPRTask[]): GPRTask[] {
  const branch = collectPlanFactBranchTasks(rowTask, allTasks);
  return branch.filter(isGprCsvArticleWork);
}

/** Плановые сроки ветки: приоритет CSV-работ (articleNumber), иначе WBS. */
export function aggregatePlanFactBranchPlanSchedule(
  branchTasks: GPRTask[],
): { planStart: string; planEnd: string } | null {
  if (branchTasks.length === 0) return null;
  const articles = branchTasks.filter(isGprCsvArticleWork);
  const sources = articles.length > 0 ? articles : branchTasks;
  let planStart = minIsoDate(sources.map((t) => t.planStart));
  let planEnd = maxIsoDate(sources.map((t) => t.planEnd));
  if (!planStart || !planEnd) {
    planStart = minIsoDate(branchTasks.map((t) => t.planStart));
    planEnd = maxIsoDate(branchTasks.map((t) => t.planEnd));
  }
  if (!planStart || !planEnd) return null;
  const psm = isoDayMs(planStart);
  const pem = isoDayMs(planEnd);
  if (psm == null || pem == null || pem < psm) return null;
  return { planStart, planEnd };
}

/**
 * Фактические сроки по CSV-работам (articleNumber): factStart / factEnd / completion.
 * Не зависит от planStart WBS-узлов.
 */
export function aggregatePlanFactArticleFactSchedule(
  articleTasks: GPRTask[],
  todayIso: string,
): { factStart: string; factEnd: string } | null {
  if (articleTasks.length === 0) return null;

  const hasAnyFact = articleTasks.some(
    (t) =>
      parseDateSafe(t.factStart) ||
      parseDateSafe(t.factEnd) ||
      (Number(t.completion) || 0) > 0,
  );
  if (!hasAnyFact) return null;

  let factStart = minIsoDate(articleTasks.map((t) => t.factStart));
  let factEnd = resolvePlanFactGroupChartFactEnd(articleTasks, todayIso);
  if (!factEnd) {
    factEnd = maxIsoDate(articleTasks.map((t) => t.factEnd));
  }

  if (!factStart) {
    const proxyCandidates: (string | null | undefined)[] = [];
    for (const t of articleTasks) {
      if (!parseDateSafe(t.factEnd) && (Number(t.completion) || 0) <= 0) continue;
      proxyCandidates.push(t.factEnd, t.planEnd);
    }
    const proxyStart = minIsoDate(proxyCandidates);
    if (proxyStart) factStart = proxyStart;
    else if (factEnd) factStart = factEnd;
  }

  if (!factEnd && factStart) {
    factEnd = parseDateSafe(todayIso) ?? todayIso.trim();
  }

  if (!factStart || !factEnd) return null;

  const fsm = isoDayMs(factStart);
  const fem = isoDayMs(factEnd);
  if (fsm == null || fem == null) return null;
  if (fem < fsm) return { factStart, factEnd: factStart };
  return { factStart, factEnd };
}

/**
 * Сроки строки диаграммы: план из WBS, факт из CSV (articleNumber).
 * Не возвращает null целиком — отсутствие плана не блокирует факт.
 */
export function aggregatePlanFactBranchSchedule(
  branchTasks: GPRTask[],
  todayIso: string,
): PlanFactBarSchedule {
  const plan = aggregatePlanFactBranchPlanSchedule(branchTasks);
  const fact = aggregatePlanFactArticleFactSchedule(
    branchTasks.filter(isGprCsvArticleWork),
    todayIso,
  );
  return {
    planStart: plan?.planStart ?? null,
    planEnd: plan?.planEnd ?? null,
    factStart: fact?.factStart ?? null,
    factEnd: fact?.factEnd ?? null,
  };
}

/** Факт одной строки графика (full): только сама задача, без агрегации ветки. */
function resolvePlanFactBarRowFactSchedule(
  rowTask: GPRTask,
  todayIso: string,
): { factStart: string | null; factEnd: string | null } {
  if (isGprCsvArticleWork(rowTask)) {
    const fact = aggregatePlanFactArticleFactSchedule([rowTask], todayIso);
    return { factStart: fact?.factStart ?? null, factEnd: fact?.factEnd ?? null };
  }
  const factStart = parseDateSafe(rowTask.factStart);
  const factEnd = parseDateSafe(rowTask.factEnd);
  if (!factStart && !factEnd && (Number(rowTask.completion) || 0) <= 0) {
    return { factStart: null, factEnd: null };
  }
  if (factEnd) {
    return { factStart: factStart ?? factEnd, factEnd };
  }
  if (factStart) {
    const extended =
      resolvePlanFactChartFactEnd(rowTask, [rowTask], todayIso) ?? factStart;
    return { factStart, factEnd: extended };
  }
  return { factStart: null, factEnd: null };
}

/** План (WBS) и факт (CSV) для одной строки bar-chart. */
function resolvePlanFactBarRowSchedule(
  rowTask: GPRTask,
  allTasks: GPRTask[],
  todayIso: string,
  barLevel: PlanFactTasksBarLevel,
): PlanFactBarSchedule {
  if (barLevel === "full") {
    return {
      planStart: parseDateSafe(rowTask.planStart),
      planEnd: parseDateSafe(rowTask.planEnd),
      ...resolvePlanFactBarRowFactSchedule(rowTask, todayIso),
    };
  }

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

export type PlanFactWorkTypeRowDetail = {
  planStart: string;
  planEnd: string;
  factStart: string | null;
  factEnd: string | null;
  /** Ложь — только серые полосы «нет данных», без отсева задачи. */
  hasDates?: boolean;
};

export type PlanFactWorkTypeChartModel = {
  labels: string[];
  planRanges: Array<[number, number] | null>;
  factRanges: Array<[number, number] | null>;
  planColors: string[];
  factColors: string[];
  /** Подпись «Факт выполнения» у полосы факта (как в KPI-карточке). */
  factCompletionLabels: string[];
  /** Подпись «План выполнения» у плановой полосы (режим «Упрощённо»). */
  planCompletionLabels?: string[];
  rowDetails: PlanFactWorkTypeRowDetail[];
  originMonth: Date;
  xMin: number;
  xMax: number;
  todayX: number | null;
  /** Режим «Упрощённо»: шкала 0–100%, полосы = KPI plan/fact %. */
  percentScaleMode?: boolean;
};

const PLAN_BAR = "rgba(148, 163, 184, 0.5)";
const NO_DATE_PLAN = "rgba(100, 116, 139, 0.55)";
const NO_DATE_FACT = "rgba(71, 85, 105, 0.48)";
const FACT_WEAK = "rgba(148, 163, 184, 0.25)";
const FACT_GREEN = "#22c55e";
const FACT_CYAN = "#38bdf8";
const FACT_YELLOW = "#f59e0b";
const FACT_ORANGE = "#f97316";
const PLAN_RED = "#ef4444";

/** Подложка просроченного старта на плановой полосе (enterprise, без ярко-красного). */
export const PLAN_FACT_OVERDUE_START_OVERLAY = "rgba(220, 70, 70, 0.4)";

/** Цвета шкалы «Динамика выполнения ГПР» — синхронизированы с KPI-карточкой 2.05. */
export const GPR_TIMELINE_COLOR = {
  completedOnTime: FACT_GREEN,
  completedLate: FACT_CYAN,
  inProgress: FACT_YELLOW,
  notStartedOverduePlan: PLAN_RED,
  future: PLAN_BAR,
  planDefault: PLAN_BAR,
  factNotStarted: FACT_WEAK,
} as const;

export function logGprTimelineColorsToConsole(): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;

  console.log("=== TIMELINE ===");
  console.log("✓ overdue segment only");
  console.log("✓ future plan stays gray");
  console.log("✓ no full red bars");
}

function resolvePlanFactChartRowPlanColor(_task: GPRTask, _asOf: Date, hasPlanDates: boolean): string {
  if (!hasPlanDates) return NO_DATE_PLAN;
  return PLAN_BAR;
}

/** Цвет полосы «Факт» по бизнес-статусу (как KPI-карточка 2.05). */
function resolvePlanFactChartRowFactColorByBusinessStatus(task: GPRTask, asOf: Date): string {
  const status = gprStageWorkItemBusinessStatus(task, asOf);
  switch (status) {
    case "completed":
      return FACT_GREEN;
    case "late":
      return FACT_CYAN;
    case "in_progress":
    case "overdue":
      return FACT_YELLOW;
    case "not_started":
    default:
      return FACT_WEAK;
  }
}

function resolvePlanFactChartRowFactColorFromPercent(
  task: GPRTask,
  asOf: Date,
  _progressPercent: number | null,
): string {
  return resolvePlanFactChartRowFactColorByBusinessStatus(task, asOf);
}

/** Визуализация: фактическая полоса не выходит за пределы плановой на шкале X. */
function clampFactMonthFloatRangeToPlan(
  planStart: number,
  planEnd: number,
  factStart: number,
  factEnd: number,
): [number, number] | null {
  const s = Math.max(planStart, factStart);
  const e = Math.min(planEnd, factEnd);
  if (e < s) return null;
  return [s, e];
}

/**
 * Цвет фактической полосы по % выполнения (просрочка не влияет):
 * 100% — зелёный; 0 &lt; x &lt; 100 — жёлтый; 0 — серый.
 */
export function planFactBarFactColorByProgressPercent(
  progressPercent: number | null | undefined,
): string {
  if (progressPercent == null || progressPercent <= 0) return FACT_WEAK;
  if (progressPercent >= 100) return FACT_GREEN;
  return FACT_YELLOW;
}

/** @deprecated Используйте {@link planFactBarFactColorByProgressPercent}. */
export function planFactBarFactColorByProgressDelta(
  rowTask: GPRTask,
  allTasks: GPRTask[],
  asOfIso: string,
): string {
  const parsed = new Date(`${asOfIso.trim()}T12:00:00`);
  const asOf = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const insight = computeGprStageCompletionInsight(allTasks, rowTask, asOf);
  return planFactBarFactColorByProgressPercent(insight.factPercent);
}

function parsePlanFactChartPercentLabel(label: string): number | null {
  const text = label.trim();
  if (!text || text === "—") return null;
  const value = Number.parseFloat(text.replace("%", "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function resolvePlanFactChartRowFactColor(
  e: PlanFactChartBuildEntry,
  branchPoolTasks: GPRTask[],
  asOf: Date,
): string {
  void branchPoolTasks;
  return resolvePlanFactChartRowFactColorByBusinessStatus(e.task, asOf);
}

/** Временная диагностика окраски строк с progress = 100%. */
export function logPlanFactChartColorDiagnostic(model: PlanFactWorkTypeChartModel): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;
  const rows = model.labels
    .map((label, index) => {
      const progressRaw = model.factCompletionLabels[index] ?? "";
      const progress = parsePlanFactChartPercentLabel(progressRaw);
      const detail = model.rowDetails[index];
      return {
        code: label.split(" — ")[0] ?? label,
        name: label,
        progress,
        progressLabel: progressRaw,
        plannedFinish: detail?.planEnd ?? "",
        actualFinish: detail?.factEnd ?? "",
        color: model.factColors[index] ?? "",
      };
    })
    .filter((row) => row.progress === 100);
  console.group("PlanFact GPR row colors (progress 100%)");
  console.table(rows);
  console.groupEnd();
}

/** Максимальная ширина левой колонки подписей (px). */
export const PLAN_FACT_GPR_CHART_LABELS_COLUMN_MAX_PX = 280;

/** Минимальная ширина левой колонки подписей (px). */
export const PLAN_FACT_GPR_CHART_LABELS_COLUMN_MIN_PX = 140;

/** Высота одной строки полосы (План или Факт). */
export const PLAN_FACT_GPR_CHART_ROW_HEIGHT_PX = 22;

/** Число строк полос на один этап (План + Факт). */
export const PLAN_FACT_GPR_CHART_ROWS_PER_STAGE = 2;

/** Высота шкалы месяцев над строками этапов. */
export const PLAN_FACT_GPR_CHART_X_AXIS_HEIGHT_PX = 28;

/** @deprecated Chart.js padding — оставлено для selftest divider helpers. */
export const PLAN_FACT_GPR_CHART_TOP_PADDING_PX = 20;

/** @deprecated Chart.js padding — оставлено для selftest divider helpers. */
export const PLAN_FACT_GPR_CHART_BOTTOM_PADDING_PX = 8;

/** Горизонтальные разделители строк «Динамика выполнения ГПР». */
export const PLAN_FACT_GPR_CHART_ROW_DIVIDER_COLOR = "rgba(255, 255, 255, 0.1)";

/**
 * Доли (0–1) по высоте области строк для горизонтальных разделителей.
 * Одна строка — верх и низ полосы; несколько — линии между строками.
 */
export function planFactGprRowDividerFractions(rowCount: number): number[] {
  const n = Math.max(1, Math.floor(rowCount));
  if (n === 1) return [0, 1];
  return Array.from({ length: n - 1 }, (_, index) => (index + 1) / n);
}

/** Y-позиции (px от верха тела диаграммы) линий-разделителей строк. */
export function planFactGprRowDividerTops(rowCount: number): number[] {
  const n = Math.max(1, Math.floor(rowCount));
  const rowAreaTop = PLAN_FACT_GPR_CHART_TOP_PADDING_PX;
  const rowAreaHeight = n * PLAN_FACT_GPR_CHART_ROW_HEIGHT_PX;
  return planFactGprRowDividerFractions(n).map(
    (fraction) => rowAreaTop + fraction * rowAreaHeight,
  );
}

/** Блок легенды под диаграммой (вне canvas). */
export const PLAN_FACT_GPR_CHART_LEGEND_BLOCK_PX = 40;

export function computePlanFactGprChartLayout(stageCount: number): {
  stageCount: number;
  visualRowCount: number;
  chartBodyHeightPx: number;
  scrollContentHeightPx: number;
} {
  const stages = Math.max(1, stageCount);
  const visualRowCount = stages * PLAN_FACT_GPR_CHART_ROWS_PER_STAGE;
  const chartBodyHeightPx =
    PLAN_FACT_GPR_CHART_X_AXIS_HEIGHT_PX + visualRowCount * PLAN_FACT_GPR_CHART_ROW_HEIGHT_PX;
  return {
    stageCount: stages,
    visualRowCount,
    chartBodyHeightPx,
    scrollContentHeightPx: chartBodyHeightPx + PLAN_FACT_GPR_CHART_LEGEND_BLOCK_PX,
  };
}

/** Позиция на шкале X в процентах (0–100) внутри области полос. */
export function planFactGprXPositionPct(value: number, xMin: number, xMax: number): number {
  const span = xMax - xMin;
  if (!Number.isFinite(span) || span <= 0) return 0;
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, ((v - xMin) / span) * 100));
}

export function planFactGprBarSpanPct(
  range: [number, number] | null,
  xMin: number,
  xMax: number,
): { leftPct: number; widthPct: number } | null {
  if (!range) return null;
  const leftPct = planFactGprXPositionPct(range[0], xMin, xMax);
  const rightPct = planFactGprXPositionPct(range[1], xMin, xMax);
  const widthPct = rightPct - leftPct;
  if (widthPct <= 0) return null;
  return { leftPct, widthPct };
}

/**
 * Работа не начата: 0% или нет подписи при отсутствии фактических дат.
 * Не опираемся на пустую factCompletionLabel — для не начатых строк она "".
 */
function isPlanFactRowNotStartedForOverdueStart(
  detail: PlanFactWorkTypeRowDetail,
  factPercent: number | null,
): boolean {
  if (factPercent != null && factPercent > 0) return false;
  const hasFactDates = Boolean(detail.factStart?.trim() || detail.factEnd?.trim());
  if (hasFactDates) return false;
  return factPercent === 0 || factPercent === null;
}

/**
 * Подсветка просроченного старта на плановой полосе.
 *
 * - today < plannedStart → null
 * - factProgress > 0 → null
 * - plannedStart < today ≤ plannedFinish и fact = 0 → [plannedStart, today]
 * - today > plannedFinish и fact = 0 → [plannedStart, plannedFinish] (вся полоса)
 */
export function computePlanFactOverdueStartOverlaySpanPct(
  model: PlanFactWorkTypeChartModel,
  rowIndex: number,
): { leftPct: number; widthPct: number } | null {
  if (model.percentScaleMode) return null;

  const detail = model.rowDetails[rowIndex];
  if (!detail || detail.hasDates === false) return null;

  const factPercent = parsePlanFactChartPercentLabel(
    model.factCompletionLabels[rowIndex]?.trim() ?? "",
  );
  if (!isPlanFactRowNotStartedForOverdueStart(detail, factPercent)) return null;

  const todayX = model.todayX;
  if (todayX == null || !Number.isFinite(todayX)) return null;

  const planStartX = monthFloatFromIso(detail.planStart, model.originMonth);
  const planEndX = monthFloatFromIso(detail.planEnd, model.originMonth);
  if (planStartX == null || planEndX == null || planEndX < planStartX) return null;

  if (todayX <= planStartX) return null;

  const overlayEndX = todayX > planEndX ? planEndX : todayX;
  if (overlayEndX <= planStartX) return null;

  return planFactGprBarSpanPct([planStartX, overlayEndX], model.xMin, model.xMax);
}

/** Метки месяцев для горизонтальной шкалы диаграммы. */
export function planFactGprXAxisMonthTicks(
  originMonth: Date,
  xMin: number,
  xMax: number,
): Array<{ value: number; label: string }> {
  const ticks: Array<{ value: number; label: string }> = [];
  const start = Math.max(0, Math.ceil(xMin - 0.0001));
  const end = Math.floor(xMax + 0.0001);
  for (let m = start; m <= end; m++) {
    const d = new Date(originMonth.getFullYear(), originMonth.getMonth() + m, 1);
    if (Number.isNaN(d.getTime())) continue;
    ticks.push({ value: m, label: formatPlanFactGridMonthLabel(d) });
  }
  return ticks;
}

/** Метки % для режима «Упрощённо» (шкала 0–100). */
export function planFactGprXAxisPercentTicks(
  xMin: number,
  xMax: number,
): Array<{ value: number; label: string }> {
  const candidates = [0, 25, 50, 75, 100];
  return candidates
    .filter((v) => v >= xMin - 1e-6 && v <= xMax + 1e-6)
    .map((v) => ({ value: v, label: `${v}%` }));
}

/** @deprecated Используйте HTML-колонку подписей; оставлено для совместимости. */
export function formatPlanFactGprChartYAxisTickLabel(label: string, maxChars = 42): string {
  const text = String(label ?? "").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

export type PlanFactChartModelAudit = {
  labelCount: number;
  rowDetailCount: number;
  planBarCount: number;
  factBarCount: number;
  planRenderableCount: number;
  factRenderableCount: number;
  arraysAligned: boolean;
  firstMismatchIndex: number | null;
};

/** Диагностика согласованности строк диаграммы «Динамика выполнения ГПР». */
export function auditPlanFactChartModel(model: PlanFactWorkTypeChartModel): PlanFactChartModelAudit {
  const labelCount = model.labels.length;
  const rowDetailCount = model.rowDetails.length;
  const planBarCount = model.planRanges.length;
  const factBarCount = model.factRanges.length;
  const lengths = [
    labelCount,
    rowDetailCount,
    planBarCount,
    factBarCount,
    model.planColors.length,
    model.factColors.length,
    model.factCompletionLabels.length,
  ];
  if (model.percentScaleMode) {
    lengths.push(model.planCompletionLabels?.length ?? 0);
  }
  let firstMismatchIndex: number | null = null;
  const maxLen = Math.max(...lengths);
  const minLen = Math.min(...lengths);
  if (maxLen !== minLen) {
    firstMismatchIndex = minLen;
  }
  const planRenderableCount = model.planRanges.filter((r) => r != null).length;
  const factRenderableCount = model.factRanges.filter((r) => r != null).length;
  return {
    labelCount,
    rowDetailCount,
    planBarCount,
    factBarCount,
    planRenderableCount,
    factRenderableCount,
    arraysAligned: maxLen === minLen && firstMismatchIndex === null,
    firstMismatchIndex,
  };
}

function assertPlanFactChartModelArraysAligned(model: PlanFactWorkTypeChartModel): void {
  const audit = auditPlanFactChartModel(model);
  if (!audit.arraysAligned) {
    throw new Error(
      `[planFactWorkTypeTimeline] рассинхрон массивов строк: labels=${audit.labelCount}, ` +
        `firstMismatchIndex=${audit.firstMismatchIndex}`,
    );
  }
}

/** Режим детализации bar-chart «План vs Факт» по уровням WBS. */
export type PlanFactTasksBarLevel = "simplified" | "detailed" | "full";

/** @deprecated Старые значения localStorage / URL — нормализация при чтении. */
export function normalizePlanFactTasksBarLevel(raw: string | null | undefined): PlanFactTasksBarLevel {
  if (raw === "summary" || raw === "simplified") return "simplified";
  if (raw === "full") return "full";
  return "detailed";
}

/**
 * Конечная задача по шифру внутри набора: нет другого кода в том же контексте, который является потомком `code`.
 */
export function isLeafTask(code: string, allCodes: Iterable<string>): boolean {
  const c = normalizeGprCodeFinal(code);
  if (!c) return false;
  const prefix = `${c}.`;
  for (const other of allCodes) {
    if (other === c) continue;
    if (other.startsWith(prefix)) return false;
  }
  return true;
}

const RESIDENTIAL_PLAN_FACT_ROOTS = ["2.04", "2.05"] as const;
const PARKING_PLAN_FACT_ROOTS = ["2.06", "2.07", "2.04", "2.05"] as const;
const PROJECT_PLAN_FACT_ROOTS = ["2.04", "2.05", "2.06", "2.07"] as const;

function planFactBranchRoots(partKey: PlanFactWorkTypePartKey): readonly string[] {
  if (partKey === "parking") return PARKING_PLAN_FACT_ROOTS;
  if (partKey === "project") return PROJECT_PLAN_FACT_ROOTS;
  return RESIDENTIAL_PLAN_FACT_ROOTS;
}

/** Ключ разбиения: дом/паркинг и объект CSV не смешивают деревья шифров. */
function planFactBarPartitionKey(task: GPRTask): string {
  const scope = gprPlanFactScopeFromTask(task);
  const ot = (task.objectType ?? "").trim().replace(/\s+/g, " ");
  return `${task.partId ?? 0}|${scope}|${ot}`;
}

/** Завершена для диаграммы: 100% и зафиксирована фактическая дата окончания. */
export function isGprTaskPlanFactCompleted(task: GPRTask): boolean {
  const completion = Number(task.completion) || 0;
  return completion >= 100 && Boolean(parseDateSafe(task.factEnd));
}

/** Незавершённая работа (прогресс < 100% и/или нет fact_end при наличии факта). */
export function isGprTaskPlanFactIncomplete(task: GPRTask): boolean {
  if (isGprTaskPlanFactCompleted(task)) return false;
  const completion = Number(task.completion) || 0;
  if (completion > 0 || parseDateSafe(task.factStart)) return true;
  return completion < 100;
}

/** Незавершённая строка или потомок `root.*` в той же секции объекта. */
export function hasIncompletePlanFactBranchWork(
  rowTask: GPRTask,
  allTasks: GPRTask[],
): boolean {
  const root = normalizeGprCodeFinal(rowTask.code);
  if (!root) return false;
  const partition = planFactBarPartitionKey(rowTask);
  const prefix = `${root}.`;

  for (const t of allTasks) {
    if (planFactBarPartitionKey(t) !== partition) continue;
    const c = normalizeGprCodeFinal(t.code);
    if (c !== root && !c.startsWith(prefix)) continue;
    if (isGprTaskPlanFactIncomplete(t)) return true;
  }
  return false;
}

/** Продлевать факт до линии «Сегодня». */
export function shouldExtendPlanFactFactEndToToday(
  task: GPRTask,
  allTasks: GPRTask[],
): boolean {
  return hasIncompletePlanFactBranchWork(task, allTasks);
}

/**
 * Конечная дата фактической полосы: завершено → fact_end; иначе → today (отчётная дата).
 */
export function resolvePlanFactChartFactEnd(
  task: GPRTask,
  allTasks: GPRTask[],
  todayIso: string,
): string | null {
  const fs = parseDateSafe(task.factStart);
  if (!fs) return null;
  if (shouldExtendPlanFactFactEndToToday(task, allTasks)) {
    return parseDateSafe(todayIso) ?? todayIso.trim();
  }
  return parseDateSafe(task.factEnd);
}

/** Фактическая дата окончания для агрегата работ (группа). */
export function resolvePlanFactGroupChartFactEnd(
  works: GPRTask[],
  todayIso: string,
): string | null {
  const hasAnyFact = works.some((t) => parseDateSafe(t.factStart) || (Number(t.completion) || 0) > 0);
  if (!hasAnyFact) return null;
  if (works.some((t) => isGprTaskPlanFactIncomplete(t))) {
    return parseDateSafe(todayIso) ?? todayIso.trim();
  }
  return maxIsoDate(works.map((t) => t.factEnd));
}

function taskMatchesPlanFactBranch(task: GPRTask, roots: readonly string[]): boolean {
  return roots.some((r) => matchesGprCodeBranch(task.code, r));
}

function taskMatchesPlanFactPartScope(task: GPRTask, partKey: PlanFactWorkTypePartKey): boolean {
  if (partKey === "project") return true;
  return taskMatchesPlanFactBranch(task, planFactBranchRoots(partKey));
}

/**
 * Домен шкалы X: плановый горизонт проекта (planStart/planEnd) + зафиксированные факт-даты.
 * Не использует today и не продлевает незавершённый факт до отчётной даты.
 */
export function collectPlanFactGprChartTimelineDomainDates(
  branchPoolTasks: GPRTask[],
  partKey: PlanFactWorkTypePartKey,
): string[] {
  const dates: string[] = [];
  for (const t of branchPoolTasks) {
    if (!taskMatchesPlanFactPartScope(t, partKey)) continue;
    const ps = parseDateSafe(t.planStart);
    const pe = parseDateSafe(t.planEnd);
    if (ps) dates.push(ps);
    if (pe) dates.push(pe);
    const fs = parseDateSafe(t.factStart);
    const fe = parseDateSafe(t.factEnd);
    if (fs) dates.push(fs);
    if (fe) dates.push(fe);
  }
  return dates;
}

/** Этапы «Прочие / Прочее …» — вспомогательная проверка (не фильтрует диаграмму). */
export function isGprPlanFactChartExcludedMiscStageName(name: string | null | undefined): boolean {
  const text = String(name ?? "").trim();
  if (!text) return false;
  return text.includes("Прочие") || text.includes("Прочее");
}

/**
 * Отбор задач ГПР по режиму детализации bar-chart «План vs Факт»:
 * simplified → WBS level 1 (корни 2.04/2.05/…);
 * detailed → WBS level 2;
 * full → листья WBS в партиции.
 */
export function filterGprTasksForPlanFactBarLevel(
  tasks: GPRTask[],
  barLevel: PlanFactTasksBarLevel,
  partKey: PlanFactWorkTypePartKey,
): GPRTask[] {
  const roots = planFactBranchRoots(partKey);
  const branch = tasks.filter((t) => taskMatchesPlanFactBranch(t, roots));
  const partitions = new Map<string, GPRTask[]>();
  for (const t of branch) {
    const k = planFactBarPartitionKey(t);
    const arr = partitions.get(k);
    if (arr) arr.push(t);
    else partitions.set(k, [t]);
  }

  const out: GPRTask[] = [];
  for (const [, group] of partitions) {
    const normCodes = [...new Set(group.map((t) => normalizeGprCodeFinal(t.code)))];
    for (const t of group) {
      const c = normalizeGprCodeFinal(t.code);
      const wbsLevel = gprWbsLevelFromCode(c, t.level);
      if (barLevel === "simplified") {
        if (wbsLevel !== 1) continue;
        if (!roots.some((r) => c === normalizeGprCodeFinal(r))) continue;
        out.push(t);
      } else if (barLevel === "detailed") {
        if (wbsLevel !== 2) continue;
        out.push(t);
      } else {
        if (!isLeafTask(c, normCodes)) continue;
        out.push(t);
      }
    }
  }
  return out;
}

/**
 * Отбор для графика «начало работ» в ТМЦ.
 * Упрощённо / Детально — как у «План vs Факт».
 * Все этапы — все узлы ветки (без leaf-фильтра), чтобы показать все ID, связанные с ТМЦ.
 */
export function filterGprTasksForTmcStartChart(
  tasks: GPRTask[],
  barLevel: PlanFactTasksBarLevel,
  partKey: PlanFactWorkTypePartKey,
): GPRTask[] {
  if (barLevel === "full") {
    const roots = planFactBranchRoots(partKey);
    return tasks.filter((t) => taskMatchesPlanFactBranch(t, roots));
  }
  return filterGprTasksForPlanFactBarLevel(tasks, barLevel, partKey);
}

/** Шифр этапа «Монолитные конструкции» — визуальное разбиение только в «Все этапы». */
export const GPR_MONOLITH_CHART_STAGE_CODE = "2.05.04.2";
const MS_PER_DAY_PLAN_FACT = 86400000;

/** Дочерние строки монолита из CSV (этажи / кровля под 2.05.04.2.*). */
export function listMonolithFloorChildTasks(branchPoolTasks: GPRTask[]): GPRTask[] {
  const root = normalizeGprCodeFinal(GPR_MONOLITH_CHART_STAGE_CODE);
  return sortGprTasksByCode(
    branchPoolTasks.filter((t) => {
      const code = normalizeGprCodeFinal(t.code);
      return code.startsWith(`${root}.`) && code !== root;
    }),
  );
}

function resolveMonolithFloorCount(branchPoolTasks: GPRTask[]): number {
  const floors = listMonolithFloorChildTasks(branchPoolTasks);
  return floors.length > 0 ? floors.length : 1;
}

export function isGprMonolithChartStageCode(code: string | null | undefined): boolean {
  return normalizeGprCodeFinal(code ?? "") === GPR_MONOLITH_CHART_STAGE_CODE;
}

function isoFromLocalDayMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Последовательные плановые интервалы: сумма = исходный период, последний заканчивается в planEnd. */
export function splitSequentialPlanIsoSegments(
  planStart: string,
  planEnd: string,
  parts: number,
): Array<{ start: string; end: string }> {
  const psm = isoDayMs(planStart);
  const pem = isoDayMs(planEnd);
  if (psm == null || pem == null || pem < psm || parts < 1) return [];
  const totalDays = Math.round((pem - psm) / MS_PER_DAY_PLAN_FACT) + 1;
  const baseDays = Math.floor(totalDays / parts);
  const extraDays = totalDays % parts;
  const segments: Array<{ start: string; end: string }> = [];
  let cursor = psm;
  for (let i = 0; i < parts; i += 1) {
    const days = baseDays + (i < extraDays ? 1 : 0);
    const endMs = i === parts - 1 ? pem : cursor + (days - 1) * MS_PER_DAY_PLAN_FACT;
    segments.push({ start: isoFromLocalDayMs(cursor), end: isoFromLocalDayMs(endMs) });
    cursor = endMs + MS_PER_DAY_PLAN_FACT;
  }
  return segments;
}

/** Дата прогресса факта по доле выполнения от планового периода (только диаграмма). */
export function monolithFactProgressMsFromPlanPercent(
  planStartMs: number,
  planEndMs: number,
  factPercent: number,
): number | null {
  if (factPercent <= 0) return null;
  if (factPercent >= 100) return planEndMs;
  const span = planEndMs - planStartMs;
  return planStartMs + Math.round((span * factPercent) / 100);
}

export type MonolithFloorFactSlice = {
  fs: string | null;
  fe: string | null;
  floorPercent: number;
};

/** Факт одного этажа: 100% / частично / 0% по дате прогресса на шкале плана. */
export function computeMonolithFloorFactSlice(
  segStartIso: string,
  segEndIso: string,
  progressMs: number | null,
): MonolithFloorFactSlice {
  const segStart = isoDayMs(segStartIso);
  const segEnd = isoDayMs(segEndIso);
  if (segStart == null || segEnd == null || progressMs == null) {
    return { fs: null, fe: null, floorPercent: 0 };
  }
  if (progressMs >= segEnd) {
    return { fs: segStartIso, fe: segEndIso, floorPercent: 100 };
  }
  if (progressMs < segStart) {
    return { fs: null, fe: null, floorPercent: 0 };
  }
  const segDurationMs = segEnd - segStart + MS_PER_DAY_PLAN_FACT;
  const doneMs = progressMs - segStart + MS_PER_DAY_PLAN_FACT;
  const floorPercent = Math.min(100, Math.max(0, (doneMs / segDurationMs) * 100));
  return {
    fs: segStartIso,
    fe: isoFromLocalDayMs(progressMs),
    floorPercent: Math.round(floorPercent * 10) / 10,
  };
}

type PlanFactChartBuildEntry = {
  task: GPRTask;
  label: string;
  /** Есть валидный плановый интервал WBS. */
  hasPlanDates: boolean;
  /** Есть валидный фактический интервал CSV (articleNumber). */
  hasFactDates: boolean;
  ps: string | null;
  pe: string | null;
  fs: string | null;
  fe: string | null;
  /** Пустая строка — явно без подписи (этажи монолита без факта). */
  factLabelOverride?: string;
};

/** Критерий отображения строки диаграммы Ганта (только UI, модель/KPI не затрагивается). */
function gprGanttChartEntryHasScheduleDisplayData(e: PlanFactChartBuildEntry): boolean {
  if (e.hasPlanDates || e.hasFactDates) return true;
  if (e.ps?.trim()) return true;
  if (e.pe?.trim()) return true;
  if (e.fs?.trim()) return true;
  if (e.fe?.trim()) return true;
  return false;
}

function filterGprGanttChartEntriesForDisplay(entries: PlanFactChartBuildEntry[]): PlanFactChartBuildEntry[] {
  return entries.filter(gprGanttChartEntryHasScheduleDisplayData);
}

/** Подпись % на диаграмме: только при наличии факта. */
function resolvePlanFactChartRowFactLabel(
  e: PlanFactChartBuildEntry,
  branchPoolTasks: GPRTask[],
  asOf: Date,
): string {
  if (e.factLabelOverride !== undefined) {
    return e.factLabelOverride;
  }
  const hasFactDates = Boolean(e.fs?.trim() || e.fe?.trim());
  const insight = computeGprStageCompletionInsight(branchPoolTasks, e.task, asOf);
  if (!hasFactDates && (isGprStageFactCompletionNoData(insight) || insight.factPercent <= 0)) {
    return "";
  }
  const label = formatGprStageKpiFactDisplay(insight);
  if (!label || label === "—" || label === "0%") return "";
  return label;
}

function findMonolithChartTask(branchPoolTasks: GPRTask[]): GPRTask | null {
  return branchPoolTasks.find((t) => isGprMonolithChartStageCode(t.code)) ?? null;
}

function isMonolithChartBranchCode(code: string): boolean {
  const c = normalizeGprCodeFinal(code);
  const root = normalizeGprCodeFinal(GPR_MONOLITH_CHART_STAGE_CODE);
  return c === root || c.startsWith(`${root}.`);
}

/** Первая позиция вставки: перед `anchorCode` по иерархии WBS. */
function findPlanFactChartInsertIndexBeforeCode(
  entries: PlanFactChartBuildEntry[],
  anchorCode: string,
): number {
  for (let i = 0; i < entries.length; i++) {
    const c = normalizeGprCodeFinal(entries[i]!.task.code);
    if (compareGprCodesByNumericPath(c, anchorCode) >= 0) return i;
  }
  return entries.length;
}

function sortPlanFactChartBuildEntries(entries: PlanFactChartBuildEntry[]): PlanFactChartBuildEntry[] {
  return [...entries].sort((a, b) => {
    const cmp = compareGprCodesByNumericPath(a.task.code, b.task.code);
    if (cmp !== 0) return cmp;
    return gprPlanFactCompositeKey(a.task).localeCompare(gprPlanFactCompositeKey(b.task));
  });
}

/**
 * «Все этапы»: 2.05.04.2 → 9 строк с последовательным планом и распределённым фактом.
 * В «Детально» (уровень X.XX.XX) разбиение не применяется.
 * KPI / финансы / агрегаты не меняются.
 */
function expandMonolithFloorsForChart(
  entries: PlanFactChartBuildEntry[],
  branchPoolTasks: GPRTask[],
  todayIso: string,
  barLevel: PlanFactTasksBarLevel,
): PlanFactChartBuildEntry[] {
  if (barLevel !== "full") return entries;

  const monolithRoot = normalizeGprCodeFinal(GPR_MONOLITH_CHART_STAGE_CODE);
  const monolithPrefix = `${monolithRoot}.`;
  const existingFloorEntries = entries.filter((e) => {
    const c = normalizeGprCodeFinal(e.task.code);
    return c.startsWith(monolithPrefix);
  });
  if (existingFloorEntries.length > 0) {
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
      console.info("[PlanFactGprDynamicsChart] monolith floor split skipped — CSV leaf rows present", {
        count: existingFloorEntries.length,
        codes: existingFloorEntries.map((e) => normalizeGprCodeFinal(e.task.code)),
      });
    }
    return entries;
  }

  const monolith = findMonolithChartTask(branchPoolTasks);
  if (!monolith) return entries;

  const schedule = resolvePlanFactBarRowSchedule(monolith, branchPoolTasks, todayIso, "full");
  const ps = schedule.planStart;
  const pe = schedule.planEnd;
  const psm = isoDayMs(ps);
  const pem = isoDayMs(pe);
  const hasPlanDates = Boolean(psm != null && pem != null && pem >= psm);
  if (!hasPlanDates || !ps || !pe) return entries;

  const insight = computeGprStageCompletionInsight(branchPoolTasks, monolith, new Date(`${todayIso.trim()}T12:00:00`));
  const factPercent = Math.max(0, Math.min(100, insight.factPercent));
  const progressMs = monolithFactProgressMsFromPlanPercent(psm!, pem!, factPercent);
  const floorTasks = listMonolithFloorChildTasks(branchPoolTasks);
  const floorCount = resolveMonolithFloorCount(branchPoolTasks);
  const segments = splitSequentialPlanIsoSegments(ps, pe, floorCount);
  if (segments.length !== floorCount) return entries;

  const totalDurationDays = Math.round((pem! - psm!) / MS_PER_DAY_PLAN_FACT) + 1;
  const floorDurationDays = totalDurationDays / floorCount;
  const totalCost = Number(monolith.contractValue) || 0;
  const floorCost = totalCost > 0 ? totalCost / floorCount : 0;

  const floorFacts = segments.map((seg) => computeMonolithFloorFactSlice(seg.start, seg.end, progressMs));

  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    console.info("[PlanFactGprDynamicsChart] monolith floor split", {
      code: GPR_MONOLITH_CHART_STAGE_CODE,
      barLevel,
      planStart: ps,
      planEnd: pe,
      totalDurationDays,
      floorDurationDays,
      totalCost: totalCost || null,
      floorCost: floorCost || null,
      factPercent,
      progressDate: progressMs != null ? isoFromLocalDayMs(progressMs) : null,
      floors: floorFacts.map((f, i) => ({
        floor: i + 1,
        plan: segments[i],
        floorPercent: f.floorPercent,
        factStart: f.fs,
        factEnd: f.fe,
      })),
    });
  }

  const floorEntries: PlanFactChartBuildEntry[] = segments.map((seg, index) => {
    const fact = floorFacts[index]!;
    const floorTask = floorTasks[index];
    const floorName = floorTask?.name?.trim() || `этаж ${index + 1}`;
    const floorCode = floorTask ? normalizeGprCodeFinal(floorTask.code) : GPR_MONOLITH_CHART_STAGE_CODE;
    return {
      task: floorTask ?? monolith,
      label: `${floorCode} — ${floorName}`,
      hasPlanDates: true,
      hasFactDates: Boolean(fact.fs && fact.fe),
      ps: seg.start,
      pe: seg.end,
      fs: fact.fs,
      fe: fact.fe,
      factLabelOverride:
        fact.fs && fact.fe && fact.floorPercent > 0
          ? formatGprStageFactPercentValue(fact.floorPercent)
          : "",
    };
  });

  const withoutMonolithBranch = entries.filter(
    (e) => !isMonolithChartBranchCode(e.task.code),
  );
  const insertAt = findPlanFactChartInsertIndexBeforeCode(withoutMonolithBranch, "2.05.05");
  return sortPlanFactChartBuildEntries([
    ...withoutMonolithBranch.slice(0, insertAt),
    ...floorEntries,
    ...withoutMonolithBranch.slice(insertAt),
  ]);
}

/**
 * Диагностика: синтетические строки «этажей» монолита на диаграмме (не отдельные KPI work items).
 */
export function listMonolithChartFloorProgress(
  branchPoolTasks: GPRTask[],
  todayIso: string,
): {
  parentCode: string;
  parentFactPercent: number;
  floors: { label: string; floorPercent: number }[];
} | null {
  const monolith = branchPoolTasks.find((t) => isGprMonolithChartStageCode(t.code)) ?? null;
  if (!monolith) return null;

  const schedule = resolvePlanFactBarRowSchedule(monolith, branchPoolTasks, todayIso, "full");
  const ps = schedule?.planStart ?? null;
  const pe = schedule?.planEnd ?? null;
  const psm = isoDayMs(ps);
  const pem = isoDayMs(pe);
  if (psm == null || pem == null || pem < psm || !ps || !pe) return null;

  const insight = computeGprStageCompletionInsight(
    branchPoolTasks,
    monolith,
    new Date(`${todayIso.trim()}T12:00:00`),
  );
  const factPercent = Math.max(0, Math.min(100, insight.factPercent));
  const progressMs = monolithFactProgressMsFromPlanPercent(psm, pem, factPercent);
  const floorTasks = listMonolithFloorChildTasks(branchPoolTasks);
  const floorCount = resolveMonolithFloorCount(branchPoolTasks);
  const segments = splitSequentialPlanIsoSegments(ps, pe, floorCount);
  if (segments.length !== floorCount) return null;

  const floors = segments.map((seg, index) => {
    const fact = computeMonolithFloorFactSlice(seg.start, seg.end, progressMs);
    const floorTask = floorTasks[index];
    const floorName = floorTask?.name?.trim() || `этаж ${index + 1}`;
    const floorCode = floorTask ? normalizeGprCodeFinal(floorTask.code) : GPR_MONOLITH_CHART_STAGE_CODE;
    return {
      label: `${floorCode} — ${floorName}`,
      floorPercent: fact.floorPercent,
    };
  });

  return {
    parentCode: GPR_MONOLITH_CHART_STAGE_CODE,
    parentFactPercent: factPercent,
    floors,
  };
}

function clampGprKpiPercentScale(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Режим «Упрощённо»: визуализация KPI plan/fact % на шкале 0–100.
 * Источник — тот же `computeGprStageCompletionInsight`, что и KPI-карточки.
 */
function buildGprPlanFactSimplifiedKpiChartModel(
  entries: PlanFactChartBuildEntry[],
  branchPoolTasks: GPRTask[],
  today: Date,
): PlanFactWorkTypeChartModel {
  const kpiPool = filterGprTasksForKpiAnalytics(branchPoolTasks);

  const labels: string[] = [];
  const planRanges: Array<[number, number] | null> = [];
  const factRanges: Array<[number, number] | null> = [];
  const planColors: string[] = [];
  const factColors: string[] = [];
  const factCompletionLabels: string[] = [];
  const planCompletionLabels: string[] = [];
  const rowDetails: PlanFactWorkTypeRowDetail[] = [];

  for (const e of entries) {
    labels.push(e.label);
    const insight = computeGprStageCompletionInsight(kpiPool, e.task, today);
    const planLabel = formatGprStageKpiPlanDisplay(insight.planPercent);
    const factLabel = formatGprStageKpiFactDisplay(insight);

    planCompletionLabels.push(planLabel === "—" ? "" : planLabel);
    factCompletionLabels.push(factLabel === "—" ? "" : factLabel);

    const planPct =
      insight.planPercent === null ? null : clampGprKpiPercentScale(insight.planPercent);
    const factPct = clampGprKpiPercentScale(insight.factPercent);

    if (planPct != null && planPct > 0) {
      planRanges.push([0, planPct]);
      planColors.push(resolvePlanFactChartRowPlanColor(e.task, today, true));
    } else {
      planRanges.push(null);
      planColors.push(NO_DATE_PLAN);
    }

    if (!isGprStageFactCompletionNoData(insight) && factPct > 0) {
      factRanges.push([0, factPct]);
      factColors.push(resolvePlanFactChartRowFactColorByBusinessStatus(e.task, today));
    } else if (!isGprStageFactCompletionNoData(insight) && factPct === 0) {
      factRanges.push([0, 0]);
      factColors.push(resolvePlanFactChartRowFactColorByBusinessStatus(e.task, today));
    } else {
      factRanges.push(null);
      factColors.push(resolvePlanFactChartRowFactColorByBusinessStatus(e.task, today));
    }

    rowDetails.push({
      planStart: planLabel,
      planEnd: "",
      factStart: factLabel,
      factEnd: null,
      hasDates: true,
    });

    if (
      typeof process !== "undefined" &&
      process.env.NODE_ENV !== "production" &&
      normalizeGprCodeFinal(e.task.code) === "2.05"
    ) {
      console.info("[PlanFactGprDynamicsChart] row 2.05 simplified KPI sync", {
        label: e.label,
        planPercent: planLabel,
        factPercent: factLabel,
        planRange: planRanges[planRanges.length - 1],
        factRange: factRanges[factRanges.length - 1],
      });
    }
  }

  return {
    labels,
    planRanges,
    factRanges,
    planColors,
    factColors,
    factCompletionLabels,
    planCompletionLabels,
    rowDetails,
    originMonth: startOfMonth(today),
    xMin: 0,
    xMax: 100,
    todayX: null,
    percentScaleMode: true,
  };
}

function buildGprPlanFactBarChartModel(
  tasks: GPRTask[],
  todayIso: string,
  barLevel: PlanFactTasksBarLevel,
  partKey: PlanFactWorkTypePartKey,
  branchPoolTasks: GPRTask[],
): PlanFactWorkTypeChartModel | null {
  const list = filterGprTasksForPlanFactBarLevel(tasks, barLevel, partKey).sort((a, b) => {
    const cmp = compareGprCodesByNumericPath(a.code, b.code);
    if (cmp !== 0) return cmp;
    return gprPlanFactCompositeKey(a).localeCompare(gprPlanFactCompositeKey(b));
  });

  if (list.length === 0) return null;

  const today = new Date(`${todayIso.trim()}T12:00:00`);
  if (Number.isNaN(today.getTime())) return null;

  type Entry = PlanFactChartBuildEntry;

  let entries: Entry[] = [];
  const allDates: string[] = [];

  for (const task of list) {
    const schedule = resolvePlanFactBarRowSchedule(task, branchPoolTasks, todayIso, barLevel);
    const ps = schedule.planStart;
    const pe = schedule.planEnd;
    const fs = schedule.factStart;
    const fe = schedule.factEnd;
    const psm = isoDayMs(ps);
    const pem = isoDayMs(pe);
    const fsm = isoDayMs(fs);
    const fem = isoDayMs(fe);
    const hasPlanDates = Boolean(psm != null && pem != null && pem >= psm);
    const hasFactDates = Boolean(fsm != null && fem != null && fem >= fsm);
    const label = formatGprPlanFactBarLabel(task.code, task.name);
    entries.push({ task, label, hasPlanDates, hasFactDates, ps, pe, fs, fe });

    if (
      typeof process !== "undefined" &&
      process.env.NODE_ENV !== "production" &&
      normalizeGprCodeFinal(task.code) === "2.05.04.2.1"
    ) {
      console.info("[PlanFactGprDynamicsChart] row 2.05.04.2.1 schedule trace", {
        sourceTaskId: task.id,
        sourceTaskCode: task.code,
        articleNumber: task.articleNumber,
        globalTaskId: task.globalTaskId,
        planStart: { value: ps, origin: "rowTask.planStart" },
        planEnd: { value: pe, origin: "rowTask.planEnd" },
        factStart: { value: fs, origin: "rowTask.factStart (strict row)" },
        factEnd: { value: fe, origin: "rowTask.factEnd (strict row)" },
        barLevel,
        rowTaskPlanStart: task.planStart,
        rowTaskPlanEnd: task.planEnd,
        rowTaskFactStart: task.factStart,
        rowTaskFactEnd: task.factEnd,
        completion: task.completion,
      });
    }
  }

  entries = expandMonolithFloorsForChart(entries, branchPoolTasks, todayIso, barLevel);
  entries = sortPlanFactChartBuildEntries(entries);
  entries = filterGprGanttChartEntriesForDisplay(entries);

  if (entries.length === 0) return null;

  if (barLevel === "simplified") {
    const simplifiedModel = buildGprPlanFactSimplifiedKpiChartModel(entries, branchPoolTasks, today);
    assertPlanFactChartModelArraysAligned(simplifiedModel);
    return simplifiedModel;
  }

  for (const e of entries) {
    if (e.hasPlanDates && e.ps && e.pe) {
      allDates.push(e.ps, e.pe);
    }
    if (e.hasFactDates && e.fs && e.fe) {
      allDates.push(e.fs, e.fe);
    }
  }

  const domainDates = collectPlanFactGprChartTimelineDomainDates(branchPoolTasks, partKey);
  const timelineIsoDates = domainDates.length > 0 ? domainDates : allDates;

  let originMonth: Date;
  let maxD: Date;

  if (timelineIsoDates.length > 0) {
    const parsed = timelineIsoDates
      .map((s) => new Date(`${s.trim()}T12:00:00`))
      .filter((d) => !Number.isNaN(d.getTime()));
    const minD = new Date(Math.min(...parsed.map((d) => d.getTime())));
    maxD = new Date(Math.max(...parsed.map((d) => d.getTime())));
    originMonth = startOfMonth(minD);
  } else {
    originMonth = startOfMonth(today);
    maxD = today;
  }

  const todayF = monthFloatFromIso(todayIso, originMonth);

  const labels: string[] = [];
  const planRanges: Array<[number, number] | null> = [];
  const factRanges: Array<[number, number] | null> = [];
  const planColors: string[] = [];
  const factColors: string[] = [];
  const factCompletionLabels: string[] = [];
  const rowDetails: PlanFactWorkTypeRowDetail[] = [];
  const asOf = today;

  for (const e of entries) {
    labels.push(e.label);
    factCompletionLabels.push(resolvePlanFactChartRowFactLabel(e, branchPoolTasks, asOf));
    const factColor = resolvePlanFactChartRowFactColor(e, branchPoolTasks, asOf);
    rowDetails.push({
      planStart: e.ps ?? "",
      planEnd: e.pe ?? "",
      factStart: e.fs ?? null,
      factEnd: e.fe,
      hasDates: e.hasPlanDates,
    });

    const anchor = todayF ?? 0.5;

    if (e.hasPlanDates && e.ps && e.pe) {
      const pfS = monthFloatFromIso(e.ps, originMonth);
      const pfE = monthFloatFromIso(e.pe, originMonth);
      if (pfS != null && pfE != null && pfE >= pfS) {
        planRanges.push([pfS, pfE]);
        planColors.push(resolvePlanFactChartRowPlanColor(e.task, asOf, true));
      } else {
        planRanges.push([anchor - 0.1, anchor + 0.1]);
        planColors.push(NO_DATE_PLAN);
      }
    } else {
      planRanges.push([anchor - 0.12, anchor + 0.12]);
      planColors.push(NO_DATE_PLAN);
    }

    if (e.hasFactDates && e.fs && e.fe) {
      const ffS = monthFloatFromIso(e.fs, originMonth);
      const ffE = monthFloatFromIso(e.fe, originMonth);
      if (ffS != null && ffE != null && ffE >= ffS) {
        const ffEPlot = ffE <= ffS ? ffS + 0.08 : ffE;
        let factRange: [number, number] = [ffS, ffEPlot];
        if (e.hasPlanDates && e.ps && e.pe) {
          const pfS = monthFloatFromIso(e.ps, originMonth);
          const pfE = monthFloatFromIso(e.pe, originMonth);
          if (pfS != null && pfE != null && pfE >= pfS) {
            const clamped = clampFactMonthFloatRangeToPlan(pfS, pfE, ffS, ffE);
            if (clamped) factRange = clamped;
          }
        }
        factRanges.push(factRange);
        factColors.push(factColor);
      } else {
        factRanges.push(null);
        factColors.push(FACT_WEAK);
      }
    } else {
      factRanges.push(null);
      factColors.push(NO_DATE_FACT);
    }
  }

  const yMax = maxD.getFullYear();
  const mMax = String(maxD.getMonth() + 1).padStart(2, "0");
  const dMax = String(maxD.getDate()).padStart(2, "0");
  let xMax = monthFloatFromIso(`${yMax}-${mMax}-${dMax}`, originMonth) ?? 1;
  xMax = Math.max(xMax + 0.25, 0.5);

  const model: PlanFactWorkTypeChartModel = {
    labels,
    planRanges,
    factRanges,
    planColors,
    factColors,
    factCompletionLabels,
    rowDetails,
    originMonth,
    xMin: 0,
    xMax,
    todayX: todayF,
  };
  assertPlanFactChartModelArraysAligned(model);
  return model;
}

/**
 * Модель горизонтального bar-chart «План vs факт».
 * Упрощённо — WBS level 1 (2.04, 2.05); детально — level 2; полная детализация — листья WBS.
 */
export function buildPlanFactWorkTypeChartModel(
  tasks: GPRTask[],
  partKey: PlanFactWorkTypePartKey,
  todayIso: string,
  barLevel: PlanFactTasksBarLevel = "detailed",
  branchPoolTasks?: GPRTask[],
): PlanFactWorkTypeChartModel | null {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;

  const branchPool = branchPoolTasks?.length ? branchPoolTasks : tasks;

  if (partKey === "residential" || partKey === "project" || partKey === "parking") {
    return buildGprPlanFactBarChartModel(tasks, todayIso, barLevel, partKey, branchPool);
  }

  const rows = buildPlanFactWorkTypeRows(tasks, partKey).filter((r) => r.bounds != null);
  if (rows.length === 0) return null;

  const groups = partKey !== "project" ? WORK_TYPE_GROUPS[partKey as ProjectPartKey] : null;

  const allDates: string[] = [];
  for (const r of rows) {
    const b = r.bounds;
    if (!b) continue;
    allDates.push(b.planStart, b.planEnd);
    if (b.factStart) allDates.push(b.factStart);
    const groupDef = groups?.find((g) => g.key === r.key);
    const groupWorks = groupDef
      ? tasks.filter((t) => groupDef.match(normalizeGprCodeFinal(t.code)))
      : tasks;
    const factEndDisplay = resolvePlanFactGroupChartFactEnd(groupWorks, todayIso);
    if (factEndDisplay) allDates.push(factEndDisplay);
    else if (b.factEnd) allDates.push(b.factEnd);
  }
  if (allDates.length === 0) return null;

  const parsed = allDates
    .map((s) => new Date(`${s.trim()}T12:00:00`))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (parsed.length === 0) return null;

  const minD = new Date(Math.min(...parsed.map((d) => d.getTime())));
  const maxD = new Date(Math.max(...parsed.map((d) => d.getTime())));
  const originMonth = startOfMonth(minD);

  const labels: string[] = [];
  const planRanges: Array<[number, number] | null> = [];
  const factRanges: Array<[number, number] | null> = [];
  const planColors: string[] = [];
  const factColors: string[] = [];
  const factCompletionLabels: string[] = [];
  const rowDetails: PlanFactWorkTypeRowDetail[] = [];

  for (const r of rows) {
    const b = r.bounds;
    if (!b) continue;
    const ps = monthFloatFromIso(b.planStart, originMonth);
    const pe = monthFloatFromIso(b.planEnd, originMonth);
    if (ps == null || pe == null) continue;
    if (pe < ps) continue;
    planRanges.push([ps, pe]);
    labels.push(r.label);
    factCompletionLabels.push("");
    const groupDef = groups?.find((g) => g.key === r.key);
    const groupWorks = groupDef
      ? tasks.filter((t) => groupDef.match(normalizeGprCodeFinal(t.code)))
      : tasks;
    planColors.push(PLAN_BAR);
    const factEndDisplay = resolvePlanFactGroupChartFactEnd(groupWorks, todayIso);
    rowDetails.push({
      planStart: b.planStart,
      planEnd: b.planEnd,
      factStart: b.factStart,
      factEnd: factEndDisplay,
      hasDates: true,
    });

    if (b.factStart && factEndDisplay) {
      const fs = monthFloatFromIso(b.factStart, originMonth);
      const fe = monthFloatFromIso(factEndDisplay, originMonth);
      if (fs != null && fe != null && fe >= fs) {
        const clamped = clampFactMonthFloatRangeToPlan(ps, pe, fs, fe);
        if (clamped) {
          factRanges.push(clamped);
          factColors.push(FACT_YELLOW);
        } else {
          factRanges.push(null);
          factColors.push(FACT_WEAK);
        }
      } else {
        factRanges.push(null);
        factColors.push(FACT_WEAK);
      }
    } else {
      factRanges.push(null);
      factColors.push(FACT_WEAK);
    }
  }

  if (labels.length === 0) return null;

  const yMax = maxD.getFullYear();
  const mMax = String(maxD.getMonth() + 1).padStart(2, "0");
  const dMax = String(maxD.getDate()).padStart(2, "0");
  let xMax = monthFloatFromIso(`${yMax}-${mMax}-${dMax}`, originMonth) ?? 1;
  xMax = Math.max(xMax + 0.25, 0.5);

  const todayF = monthFloatFromIso(todayIso, originMonth);

  const legacyModel: PlanFactWorkTypeChartModel = {
    labels,
    planRanges,
    factRanges,
    planColors,
    factColors,
    factCompletionLabels,
    rowDetails,
    originMonth,
    xMin: 0,
    xMax,
    todayX: todayF,
  };
  assertPlanFactChartModelArraysAligned(legacyModel);
  return legacyModel;
}
