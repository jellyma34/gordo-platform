import {
  compareGprCodesByNumericPath,
  getStatusByGprProgressDelta,
  gprPlanFactCompositeKey,
  gprPlanFactScopeFromTask,
  gprWbsLevelFromCode,
  matchesGprCodeBranch,
  normalizeGprCodeFinal,
  parseDateSafe,
  type GPRTask,
  type ProjectPartKey,
} from "@/lib/gprUtils";
import { buildPlanFactProjectWideRows } from "@/lib/gprProjectPlanFactStages";
import { aggregateWorksToProjectPlanFactBounds, overviewFactBarColor } from "@/lib/gprProjectOverview";
import {
  computeGprStageCompletionInsight,
  formatGprStageFactPercentValue,
  formatGprStageKpiFactDisplay,
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

/**
 * Сроки агрегированной строки «План vs Факт» по дочерним работам ветки.
 * План: MIN(plan_start), MAX(plan_end); факт: MIN(fact_start), MAX(fact_end) с продлением до today.
 */
export function aggregatePlanFactBranchSchedule(
  branchTasks: GPRTask[],
  todayIso: string,
): PlanFactBarSchedule | null {
  if (branchTasks.length === 0) return null;
  const planStart = minIsoDate(branchTasks.map((t) => t.planStart));
  const planEnd = maxIsoDate(branchTasks.map((t) => t.planEnd));
  if (!planStart || !planEnd) return null;
  const psm = isoDayMs(planStart);
  const pem = isoDayMs(planEnd);
  if (psm == null || pem == null || pem < psm) return null;
  const factStart = minIsoDate(branchTasks.map((t) => t.factStart));
  const factEnd = resolvePlanFactGroupChartFactEnd(branchTasks, todayIso);
  const resolvedFactStart =
    factStart ?? (factEnd && planStart ? planStart : null);
  return { planStart, planEnd, factStart: resolvedFactStart, factEnd };
}

function resolvePlanFactBarRowSchedule(
  rowTask: GPRTask,
  allTasks: GPRTask[],
  todayIso: string,
  barLevel: PlanFactTasksBarLevel,
): PlanFactBarSchedule | null {
  if (barLevel === "full") {
    const planStart = parseDateSafe(rowTask.planStart);
    const planEnd = parseDateSafe(rowTask.planEnd);
    if (!planStart || !planEnd) return null;
    return {
      planStart,
      planEnd,
      factStart: parseDateSafe(rowTask.factStart),
      factEnd: resolvePlanFactChartFactEnd(rowTask, allTasks, todayIso),
    };
  }
  return aggregatePlanFactBranchSchedule(collectPlanFactBranchTasks(rowTask, allTasks), todayIso);
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
  rowDetails: PlanFactWorkTypeRowDetail[];
  originMonth: Date;
  xMin: number;
  xMax: number;
  todayX: number | null;
};

const PLAN_BAR = "rgba(148, 163, 184, 0.5)";
const NO_DATE_PLAN = "rgba(100, 116, 139, 0.55)";
const NO_DATE_FACT = "rgba(71, 85, 105, 0.48)";
const FACT_WEAK = "rgba(148, 163, 184, 0.25)";
const FACT_NO_PLAN_PERCENT = "rgba(148, 163, 184, 0.5)";
const FACT_GREEN = "#22c55e";
const FACT_YELLOW = "#f59e0b";
const FACT_RED = "#ef4444";

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
 * Цвет фактической полосы в блоке «Динамика выполнения ГПР» — единый источник статуса с KPI-карточкой:
 * отклонение готовности (факт − план %) на отчётную дату через {@link getStatusByGprProgressDelta}.
 *
 * Зелёный — факт ≥ плана (≥ 0 п.п.); жёлтый — умеренное отставание (от −15 до 0 п.п.);
 * красный — критическое отставание (&lt; −15 п.п.). Серый — нет планового %.
 */
export function planFactBarFactColorByProgressDelta(
  rowTask: GPRTask,
  allTasks: GPRTask[],
  asOfIso: string,
): string {
  const parsed = new Date(`${asOfIso.trim()}T12:00:00`);
  const asOf = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const insight = computeGprStageCompletionInsight(allTasks, rowTask, asOf);
  if (insight.planPercent === null) return FACT_NO_PLAN_PERCENT;
  const deltaPp = Math.round((insight.factPercent - insight.planPercent) * 10) / 10;
  const traffic = getStatusByGprProgressDelta(deltaPp);
  if (traffic === "red") return FACT_RED;
  if (traffic === "yellow") return FACT_YELLOW;
  return FACT_GREEN;
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

/**
 * Этапы «Прочие / Прочее …» — только фильтр отображения диаграммы «Динамика выполнения ГПР».
 * KPI, агрегаты и исходные задачи не затрагиваются.
 */
export function isGprPlanFactChartExcludedMiscStageName(name: string | null | undefined): boolean {
  const text = String(name ?? "").trim();
  if (!text) return false;
  return text.includes("Прочие") || text.includes("Прочее");
}

/** Режимы «Детально» и «Все этапы»: убрать строки с «Прочие» / «Прочее» в названии. */
function filterGprPlanFactChartMiscDisplayTasks(
  tasks: GPRTask[],
  barLevel: PlanFactTasksBarLevel,
): GPRTask[] {
  if (barLevel === "simplified") return tasks;
  return tasks.filter((t) => !isGprPlanFactChartExcludedMiscStageName(t.name));
}

function filterGprTasksForPlanFactBarLevel(
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

/** Шифр этапа «Монолитные конструкции» — визуальное разбиение только в «Все этапы». */
export const GPR_MONOLITH_CHART_STAGE_CODE = "2.05.04.2";
const GPR_MONOLITH_FLOOR_COUNT = 9;
const MS_PER_DAY_PLAN_FACT = 86400000;

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
  hasDates: boolean;
  ps: string | null;
  pe: string | null;
  fs: string | null;
  fe: string | null;
  /** Пустая строка — явно без подписи (этажи монолита без факта). */
  factLabelOverride?: string;
};

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

  const monolith = findMonolithChartTask(branchPoolTasks);
  if (!monolith) return entries;

  const schedule = resolvePlanFactBarRowSchedule(monolith, branchPoolTasks, todayIso, "full");
  const ps = schedule?.planStart ?? null;
  const pe = schedule?.planEnd ?? null;
  const psm = isoDayMs(ps);
  const pem = isoDayMs(pe);
  const hasDates = Boolean(psm != null && pem != null && pem >= psm);
  if (!hasDates || !ps || !pe) return entries;

  const insight = computeGprStageCompletionInsight(branchPoolTasks, monolith, new Date(`${todayIso.trim()}T12:00:00`));
  const factPercent = Math.max(0, Math.min(100, insight.factPercent));
  const progressMs = monolithFactProgressMsFromPlanPercent(psm!, pem!, factPercent);
  const segments = splitSequentialPlanIsoSegments(ps, pe, GPR_MONOLITH_FLOOR_COUNT);
  if (segments.length !== GPR_MONOLITH_FLOOR_COUNT) return entries;

  const totalDurationDays = Math.round((pem! - psm!) / MS_PER_DAY_PLAN_FACT) + 1;
  const floorDurationDays = totalDurationDays / GPR_MONOLITH_FLOOR_COUNT;
  const totalCost = Number(monolith.contractValue) || 0;
  const floorCost = totalCost > 0 ? totalCost / GPR_MONOLITH_FLOOR_COUNT : 0;

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
    return {
      task: monolith,
      label: `${GPR_MONOLITH_CHART_STAGE_CODE} — Монолитные конструкции — ${index + 1} этаж`,
      hasDates: true,
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

  const monolithIdx = entries.findIndex((e) => isGprMonolithChartStageCode(e.task.code));
  if (monolithIdx >= 0) {
    return [
      ...entries.slice(0, monolithIdx),
      ...floorEntries,
      ...entries.slice(monolithIdx + 1),
    ];
  }

  const anchorIdx = entries.findIndex((e) => normalizeGprCodeFinal(e.task.code) === "2.05.04");
  const insertAt = anchorIdx >= 0 ? anchorIdx + 1 : entries.length;
  return [...entries.slice(0, insertAt), ...floorEntries, ...entries.slice(insertAt)];
}

function buildGprPlanFactBarChartModel(
  tasks: GPRTask[],
  todayIso: string,
  barLevel: PlanFactTasksBarLevel,
  partKey: PlanFactWorkTypePartKey,
  branchPoolTasks: GPRTask[],
): PlanFactWorkTypeChartModel | null {
  const rawList = filterGprTasksForPlanFactBarLevel(tasks, barLevel, partKey).sort((a, b) => {
    const cmp = compareGprCodesByNumericPath(a.code, b.code);
    if (cmp !== 0) return cmp;
    return gprPlanFactCompositeKey(a).localeCompare(gprPlanFactCompositeKey(b));
  });
  const list = filterGprPlanFactChartMiscDisplayTasks(rawList, barLevel);

  if (
    typeof process !== "undefined" &&
    process.env.NODE_ENV !== "production" &&
    barLevel !== "simplified" &&
    rawList.length !== list.length
  ) {
    const excluded = rawList
      .filter((t) => isGprPlanFactChartExcludedMiscStageName(t.name))
      .map((t) => formatGprPlanFactBarLabel(t.code, t.name));
    console.info("[PlanFactGprDynamicsChart] misc stage filter", {
      barLevel,
      before: rawList.length,
      after: list.length,
      excluded,
    });
  }

  if (list.length === 0) return null;

  const today = new Date(`${todayIso.trim()}T12:00:00`);
  if (Number.isNaN(today.getTime())) return null;

  type Entry = PlanFactChartBuildEntry;

  let entries: Entry[] = [];
  const allDates: string[] = [];

  for (const task of list) {
    const schedule = resolvePlanFactBarRowSchedule(task, branchPoolTasks, todayIso, barLevel);
    const ps = schedule?.planStart ?? null;
    const pe = schedule?.planEnd ?? null;
    const fs = schedule?.factStart ?? null;
    const fe = schedule?.factEnd ?? null;
    const psm = isoDayMs(ps);
    const pem = isoDayMs(pe);
    const hasDates = Boolean(psm != null && pem != null && pem >= psm);
    const label = formatGprPlanFactBarLabel(task.code, task.name);
    entries.push({ task, label, hasDates, ps, pe, fs, fe });

    if (
      typeof process !== "undefined" &&
      process.env.NODE_ENV !== "production" &&
      barLevel === "simplified" &&
      normalizeGprCodeFinal(task.code) === "2.05"
    ) {
      const insight = computeGprStageCompletionInsight(branchPoolTasks, task, today);
      console.info("[PlanFactGprDynamicsChart] row 2.05 simplified data audit", {
        label,
        planStart: ps,
        planEnd: pe,
        factStart: fs,
        factEnd: fe,
        factPercent: formatGprStageKpiFactDisplay(insight),
      });
    }
  }

  entries = expandMonolithFloorsForChart(entries, branchPoolTasks, todayIso, barLevel);

  for (const e of entries) {
    if (e.hasDates && e.ps && e.pe) {
      allDates.push(e.ps, e.pe);
      if (e.fs) allDates.push(e.fs);
      if (e.fe) allDates.push(e.fe);
    }
  }

  let originMonth: Date;
  let maxD: Date;

  if (allDates.length > 0) {
    const parsed = allDates
      .map((s) => new Date(`${s.trim()}T12:00:00`))
      .filter((d) => !Number.isNaN(d.getTime()));
    const minD = new Date(Math.min(...parsed.map((d) => d.getTime())));
    maxD = new Date(Math.max(...parsed.map((d) => d.getTime())));
    if (maxD.getTime() < today.getTime()) maxD = today;
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
    rowDetails.push({
      planStart: e.ps ?? "",
      planEnd: e.pe ?? "",
      factStart: e.fs ?? (e.fe ? e.ps : null),
      factEnd: e.fe,
      hasDates: e.hasDates,
    });

    const anchor = todayF ?? 0.5;

    if (e.hasDates && e.ps && e.pe) {
      const pfS = monthFloatFromIso(e.ps, originMonth);
      const pfE = monthFloatFromIso(e.pe, originMonth);
      if (pfS != null && pfE != null && pfE >= pfS) {
        planRanges.push([pfS, pfE]);
        planColors.push(PLAN_BAR);
        const factStartIso = e.fs ?? (e.fe ? e.ps : null);
        if (factStartIso) {
          const ffS = monthFloatFromIso(factStartIso, originMonth);
          const ffE = e.fe ? monthFloatFromIso(e.fe, originMonth) : null;
          if (ffS != null && ffE != null && ffE >= ffS) {
            const clamped = clampFactMonthFloatRangeToPlan(pfS, pfE, ffS, ffE);
            if (clamped) {
              factRanges.push(clamped);
              factColors.push(planFactBarFactColorByProgressDelta(e.task, branchPoolTasks, todayIso));
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
      } else {
        planRanges.push([anchor - 0.1, anchor + 0.1]);
        planColors.push(NO_DATE_PLAN);
        factRanges.push(null);
        factColors.push(NO_DATE_FACT);
      }
    } else {
      planRanges.push([anchor - 0.12, anchor + 0.12]);
      planColors.push(NO_DATE_PLAN);
      factRanges.push(null);
      factColors.push(NO_DATE_FACT);
    }
  }

  const yMax = maxD.getFullYear();
  const mMax = String(maxD.getMonth() + 1).padStart(2, "0");
  const dMax = String(maxD.getDate()).padStart(2, "0");
  let xMax = monthFloatFromIso(`${yMax}-${mMax}-${dMax}`, originMonth) ?? 1;
  if (todayF != null && todayF > xMax) xMax = todayF;
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
    planColors.push(PLAN_BAR);
    const groupDef = groups?.find((g) => g.key === r.key);
    const groupWorks = groupDef
      ? tasks.filter((t) => groupDef.match(normalizeGprCodeFinal(t.code)))
      : tasks;
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
          factColors.push(
            overviewFactBarColor(b.planStart, b.planEnd, b.factStart, factEndDisplay),
          );
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
  const todayF = monthFloatFromIso(todayIso, originMonth);
  if (todayF != null && todayF > xMax) xMax = todayF;
  xMax = Math.max(xMax + 0.25, 0.5);

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
