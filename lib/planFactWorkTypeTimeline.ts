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
import { computeGprStageCompletionInsight } from "@/lib/gprStageCompletion";

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
  return { planStart, planEnd, factStart, factEnd };
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

/**
 * Цвет фактической полосы в блоке «Динамика выполнения ГПР» — единый источник статуса с KPI-карточкой:
 * отклонение готовности (факт − план %) на отчётную дату через {@link getStatusByGprProgressDelta}.
 *
 * Зелёный — факт ≥ плана (≥ 0 п.п.); жёлтый — умеренное отставание (от −10 до 0 п.п.);
 * красный — существенное отставание (&lt; −10 п.п.). Серый — нет планового %.
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

function buildGprPlanFactBarChartModel(
  tasks: GPRTask[],
  todayIso: string,
  barLevel: PlanFactTasksBarLevel,
  partKey: PlanFactWorkTypePartKey,
): PlanFactWorkTypeChartModel | null {
  const list = filterGprTasksForPlanFactBarLevel(tasks, barLevel, partKey).sort((a, b) => {
    const cmp = compareGprCodesByNumericPath(a.code, b.code);
    if (cmp !== 0) return cmp;
    return gprPlanFactCompositeKey(a).localeCompare(gprPlanFactCompositeKey(b));
  });

  if (list.length === 0) return null;

  const today = new Date(`${todayIso.trim()}T12:00:00`);
  if (Number.isNaN(today.getTime())) return null;

  type Entry = {
    task: GPRTask;
    label: string;
    hasDates: boolean;
    ps: string | null;
    pe: string | null;
    fs: string | null;
    fe: string | null;
  };

  const entries: Entry[] = [];
  const allDates: string[] = [];

  for (const task of list) {
    const schedule = resolvePlanFactBarRowSchedule(task, tasks, todayIso, barLevel);
    const ps = schedule?.planStart ?? null;
    const pe = schedule?.planEnd ?? null;
    const fs = schedule?.factStart ?? null;
    const fe = schedule?.factEnd ?? null;
    const psm = isoDayMs(ps);
    const pem = isoDayMs(pe);
    const hasDates = Boolean(psm != null && pem != null && pem >= psm);
    const label = formatGprPlanFactBarLabel(task.code, task.name);
    entries.push({ task, label, hasDates, ps, pe, fs, fe });
    if (hasDates && ps && pe) {
      allDates.push(ps, pe);
      if (fs) allDates.push(fs);
      if (fe) allDates.push(fe);
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
  const rowDetails: PlanFactWorkTypeRowDetail[] = [];

  for (const e of entries) {
    labels.push(e.label);
    rowDetails.push({
      planStart: e.ps ?? "",
      planEnd: e.pe ?? "",
      factStart: e.fs,
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
        if (e.fs) {
          const ffS = monthFloatFromIso(e.fs, originMonth);
          const ffE = e.fe ? monthFloatFromIso(e.fe, originMonth) : null;
          if (ffS != null && ffE != null && ffE >= ffS) {
            factRanges.push([ffS, ffE]);
            factColors.push(planFactBarFactColorByProgressDelta(e.task, tasks, todayIso));
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

  return {
    labels,
    planRanges,
    factRanges,
    planColors,
    factColors,
    rowDetails,
    originMonth,
    xMin: 0,
    xMax,
    todayX: todayF,
  };
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
): PlanFactWorkTypeChartModel | null {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;

  if (partKey === "residential" || partKey === "project" || partKey === "parking") {
    return buildGprPlanFactBarChartModel(tasks, todayIso, barLevel, partKey);
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
        factRanges.push([fs, fe]);
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
  }

  if (labels.length === 0) return null;

  const yMax = maxD.getFullYear();
  const mMax = String(maxD.getMonth() + 1).padStart(2, "0");
  const dMax = String(maxD.getDate()).padStart(2, "0");
  let xMax = monthFloatFromIso(`${yMax}-${mMax}-${dMax}`, originMonth) ?? 1;
  const todayF = monthFloatFromIso(todayIso, originMonth);
  if (todayF != null && todayF > xMax) xMax = todayF;
  xMax = Math.max(xMax + 0.25, 0.5);

  return {
    labels,
    planRanges,
    factRanges,
    planColors,
    factColors,
    rowDetails,
    originMonth,
    xMin: 0,
    xMax,
    todayX: todayF,
  };
}
