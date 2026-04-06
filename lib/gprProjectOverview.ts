import type { GPRTask, ProjectPartKey } from "@/lib/gprUtils";
import { factColorForFactEndVsToday, statusLabelForFactEndVsToday } from "@/lib/gprScheduleDelayToday";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function parseIsoDay(iso: string): number {
  const ms = new Date(`${iso.trim()}T00:00:00`).getTime();
  return Number.isNaN(ms) ? NaN : ms;
}

function minIso(isos: string[]): string | null {
  const ok = isos.filter((s) => s?.trim() && !Number.isNaN(parseIsoDay(s)));
  if (ok.length === 0) return null;
  return ok.reduce((a, b) => (parseIsoDay(a) <= parseIsoDay(b) ? a : b));
}

function maxIso(isos: string[]): string | null {
  const ok = isos.filter((s) => s?.trim() && !Number.isNaN(parseIsoDay(s)));
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

/** Отклонение по сроку окончания: fact_end − plan_end (календарные дни). */
export function projectOverviewEndDelayDays(
  planEndIso: string,
  factEndIso: string | null | undefined,
): number | null {
  if (!factEndIso?.trim()) return null;
  const pe = parseIsoDay(planEndIso);
  const fe = parseIsoDay(factEndIso);
  if (Number.isNaN(pe) || Number.isNaN(fe)) return null;
  return Math.round((fe - pe) / MS_PER_DAY);
}

/** Цвет полосы «Факт проекта» по дате окончания факта относительно сегодня. */
export function overviewFactBarColor(
  _planStartIso: string,
  _planEndIso: string,
  factStartIso: string | null | undefined,
  factEndIso: string | null | undefined,
): string {
  return factColorForFactEndVsToday(factStartIso, factEndIso);
}

/** Подпись статуса по календарю (окончание факта vs сегодня). */
export function overviewEndDeviationStatus(
  _planStartIso: string,
  _planEndIso: string,
  factStartIso: string | null | undefined,
  factEndIso: string | null | undefined,
): "нет данных" | "в срок" | "риск" | "отставание" {
  return statusLabelForFactEndVsToday(factStartIso, factEndIso);
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
