import { parseDateSafe, planFactEndDeviationDays, type GPRTask, type ProjectPartKey } from "@/lib/gprUtils";
import { factColorForPlanFactEnd, statusLabelForPlanFactEnd } from "@/lib/gprScheduleDelayToday";

function parseIsoDay(iso: string | null | undefined): number {
  const s = parseDateSafe(iso);
  if (!s) return NaN;
  const ms = new Date(`${s}T00:00:00`).getTime();
  return Number.isNaN(ms) ? NaN : ms;
}

function minIso(isos: (string | null | undefined)[]): string | null {
  const ok = isos.filter((s): s is string => Boolean(s?.trim()) && !Number.isNaN(parseIsoDay(s)));
  if (ok.length === 0) return null;
  return ok.reduce((a, b) => (parseIsoDay(a) <= parseIsoDay(b) ? a : b));
}

function maxIso(isos: (string | null | undefined)[]): string | null {
  const ok = isos.filter((s): s is string => Boolean(s?.trim()) && !Number.isNaN(parseIsoDay(s)));
  if (ok.length === 0) return null;
  return ok.reduce((a, b) => (parseIsoDay(a) >= parseIsoDay(b) ? a : b));
}

export const OVERVIEW_GANTT_PLAN_ID_PREFIX = "overview:plan:";
export const OVERVIEW_GANTT_FACT_ID_PREFIX = "overview:fact:";

export function isOverviewPlanGanttTask(task: GPRTask): boolean {
  return task.id.startsWith(OVERVIEW_GANTT_PLAN_ID_PREFIX);
}

export function isOverviewFactGanttTask(task: GPRTask): boolean {
  return task.id.startsWith(OVERVIEW_GANTT_FACT_ID_PREFIX);
}

export function isOverviewGanttTask(task: GPRTask): boolean {
  return isOverviewPlanGanttTask(task) || isOverviewFactGanttTask(task);
}

/** Сводные границы проекта по набору работ (как в источнике, без ручных констант). */
export type ProjectPlanFactOverviewBounds = {
  planStart: string;
  planEnd: string;
  factStart: string | null;
  factEnd: string | null;
};

/**
 * Агрегация «План проекта» / «Факт проекта»:
 * plan — MIN(plan_start), MAX(plan_end); факт — MIN(fact_start), MAX(fact_end) по заполненным полям.
 */
export function aggregateWorksToProjectPlanFactBounds(
  works: GPRTask[],
): ProjectPlanFactOverviewBounds | null {
  if (works.length === 0) return null;
  const planStart = minIso(works.map((w) => w.planStart));
  const planEnd = maxIso(works.map((w) => w.planEnd));
  if (!planStart || !planEnd) return null;
  if (parseIsoDay(planStart) > parseIsoDay(planEnd)) return null;

  const factStarts = works.map((w) => w.factStart).filter((x): x is string => !!x?.trim());
  const factEnds = works.map((w) => w.factEnd).filter((x): x is string => !!x?.trim());
  const factStart = factStarts.length ? minIso(factStarts) : null;
  const factEnd = factEnds.length ? maxIso(factEnds) : null;

  return { planStart, planEnd, factStart, factEnd };
}

/** См. {@link planFactEndDeviationDays}: с фактом — факт − план, без факта — сегодня − план. */
export function projectOverviewEndDelayDays(
  planEndIso: string | null | undefined,
  factEndIso: string | null | undefined,
  asOf: Date = new Date(),
): number | null {
  return planFactEndDeviationDays(planEndIso, factEndIso, asOf);
}

/** Цвет полосы «Факт проекта» по отклонению окончания (факт − план). */
export function overviewFactBarColor(
  _planStartIso: string | null | undefined,
  planEndIso: string | null | undefined,
  _factStartIso: string | null | undefined,
  factEndIso: string | null | undefined,
): string {
  return factColorForPlanFactEnd(planEndIso, factEndIso);
}

/** Подпись статуса по отклонению окончания (факт − план). */
export function overviewEndDeviationStatus(
  _planStartIso: string | null | undefined,
  planEndIso: string | null | undefined,
  _factStartIso: string | null | undefined,
  factEndIso: string | null | undefined,
): "нет данных" | "в срок" | "риск" | "отставание" {
  return statusLabelForPlanFactEnd(planEndIso, factEndIso);
}

export function buildOverviewGanttRows(
  bounds: ProjectPlanFactOverviewBounds,
  partId: number,
  projectPartKey: ProjectPartKey,
): GPRTask[] {
  const planId = `${OVERVIEW_GANTT_PLAN_ID_PREFIX}${partId}`;
  const factId = `${OVERVIEW_GANTT_FACT_ID_PREFIX}${partId}`;
  const base = {
    partId,
    projectPartKey,
    completion: 0,
  };
  const planRow: GPRTask = {
    ...base,
    id: planId,
    globalTaskId: planId,
    code: "План",
    name: "План",
    planStart: bounds.planStart,
    planEnd: bounds.planEnd,
  };
  const factRow: GPRTask = {
    ...base,
    id: factId,
    globalTaskId: factId,
    code: "Факт",
    name: "Факт",
    planStart: bounds.planStart,
    planEnd: bounds.planEnd,
    factStart: bounds.factStart ?? undefined,
    factEnd: bounds.factEnd ?? undefined,
  };
  return [planRow, factRow];
}
