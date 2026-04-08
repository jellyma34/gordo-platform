import { getProjectStatus } from "@/utils/status";

export type GPRTask = {
  id: string;
  globalTaskId: string;
  code: string;
  name: string;
  partId: number;
  /** Часть проекта в терминах API / визуализации (`residential` — жилой дом, `parking` — автостоянка). */
  projectPartKey?: ProjectPartKey;
  relatedTmcIds?: string[];
  planStart: string;
  planEnd: string;
  factStart?: string | null;
  factEnd?: string | null;
  completion: number;
  comment?: string;
  level?: number;
  /** Квартал из `kvartaly_gpr_quarterly.json` (для подписи оси при совпадении шифров). */
  kvartalyQuarter?: string;
};

export type ProjectPart = {
  id: number;
  name: string;
};

/** Ключ части проекта (синхрон с API `project_part` для ТМЦ). */
export type ProjectPartKey = "residential" | "parking";

export const PROJECT_PART_ID_TO_KEY: Record<number, ProjectPartKey> = {
  1: "residential",
  2: "parking",
};

export const PROJECT_PART_KEY_TO_ID: Record<ProjectPartKey, number> = {
  residential: 1,
  parking: 2,
};

export function partIdToProjectPartKey(partId: number): ProjectPartKey {
  return PROJECT_PART_ID_TO_KEY[partId] ?? "residential";
}

export const PROJECT_PARTS: ProjectPart[] = [
  { id: 1, name: "Жилой дом" },
  { id: 2, name: "Встроенно-пристроенная автостоянка" },
];

export type GPRStatus = "green" | "yellow" | "red" | "gray" | "blocked";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function toDate(value: string | null | undefined): Date | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "—") return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T00:00:00`)
    : new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseDate(date?: string | null): Date | null {
  if (!date || date === "конец") return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysBetween(start: string, end: string) {
  const a = toDate(start);
  const b = toDate(end);
  if (!a || !b) return NaN;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export function durationDays(start: string, end: string) {
  const n = daysBetween(start, end);
  if (!Number.isFinite(n)) return NaN;
  return n + 1;
}

/**
 * Отклонение по сроку окончания (календарные дни, локальная полуночь):
 * — есть fact_end → fact_end − plan_end;
 * — нет fact_end → today − plan_end (незавершённые работы).
 */
export function planFactEndDeviationDays(
  planEnd: string | null | undefined,
  factEnd: string | null | undefined,
  asOf: Date = new Date(),
): number | null {
  const pe = parseDate(planEnd ?? undefined);
  if (!pe) return null;
  const fe = parseDate(factEnd ?? undefined);
  const planDay = startOfLocalDay(pe);
  const endDay = fe ? startOfLocalDay(fe) : startOfLocalDay(asOf);
  return Math.round((endDay - planDay) / MS_PER_DAY);
}

export function calculateDeviation(task: GPRTask, asOf: Date = new Date()): number | null {
  const hasAnyFact = Boolean(task.factStart?.trim() || task.factEnd?.trim());
  if (!hasAnyFact) {
    const ps = parseDate(task.planStart);
    if (!ps) return null;
    const todayDay = startOfLocalDay(asOf);
    const planStartDay = startOfLocalDay(ps);
    if (todayDay < planStartDay) return null;
    return Math.round((todayDay - planStartDay) / MS_PER_DAY);
  }
  return planFactEndDeviationDays(task.planEnd, task.factEnd, asOf);
}

export function getStatus(task: GPRTask): GPRStatus {
  const deviation = calculateDeviation(task);
  if (deviation === null || deviation === undefined) return "gray";
  return getStatusByDeviation(deviation);
}

/** Соответствует {@link getProjectStatus}: green / yellow / red для UI. */
export function getStatusByDeviation(deviation: number): "green" | "yellow" | "red" {
  const s = getProjectStatus(deviation);
  if (s === "success") return "green";
  if (s === "warning") return "yellow";
  return "red";
}

export { getProjectStatus } from "@/utils/status";

export function getStatusLabel(status: GPRStatus) {
  if (status === "blocked") return "Заблокировано";
  if (status === "green") return "В срок";
  if (status === "yellow") return "Риск";
  if (status === "red") return "Отставание";
  return "Нет данных";
}

export function flattenTasks(tasks: GPRTask[]): GPRTask[] {
  return tasks;
}

export function getProjectStats(tasks: GPRTask[]) {
  const all = flattenTasks(tasks);
  const deviations = all
    .map((task) => calculateDeviation(task))
    .filter((value): value is number => value !== null && value !== undefined);
  const total = all.length;
  const completed = all.filter((task) => task.completion >= 100).length;
  const overdue = deviations.filter((value) => value > 14).length;
  const avgDeviation =
    deviations.length > 0
      ? Number(
          (deviations.reduce((sum, value) => sum + value, 0) / deviations.length).toFixed(
            1,
          ),
        )
      : 0;

  const statusCounts = all.reduce(
    (acc, task) => {
      const status = getStatus(task);
      acc[status] += 1;
      return acc;
    },
    { green: 0, yellow: 0, red: 0, gray: 0, blocked: 0 } satisfies Record<GPRStatus, number>,
  );

  return { total, completed, overdue, avgDeviation, statusCounts };
}

/** Фильтр периода для диаграмм: пересечение планового интервала [planStart, planEnd] с календарным периодом. */
export type PlanFactPeriodFilterType = "all" | "month" | "quarter";

/** Календарный месяц (1–12) по дате начала плана или `null`, если дата невалидна. */
export function planStartCalendarMonth(planStart: string | null | undefined): number | null {
  if (!planStart) return null;
  const d = toDate(planStart);
  if (!d) return null;
  return d.getMonth() + 1;
}

/**
 * Пересечение планового интервала задачи с календарным отрезком [periodStart, periodEnd] (границы включительно по дням).
 */
export function isTaskInPeriod(
  task: { planStart: string; planEnd: string },
  periodStart: Date,
  periodEnd: Date,
): boolean {
  const start = parseDate(task.planStart);
  const end = parseDate(task.planEnd);
  if (!start || !end) return false;
  return start.getTime() <= periodEnd.getTime() && end.getTime() >= periodStart.getTime();
}

/** Верхний уровень шифра для группировки: «2.05.01.2» → «2.05». */
export function planRootStageCode(code: string): string {
  const parts = code.trim().split(".").filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return parts[0] ?? code.trim();
}

function quarterPeriodBounds(
  year: number,
  quarter: number,
): { periodStart: Date; periodEnd: Date } {
  switch (quarter) {
    case 1:
      return { periodStart: new Date(year, 0, 1), periodEnd: new Date(year, 3, 0) };
    case 2:
      return { periodStart: new Date(year, 3, 1), periodEnd: new Date(year, 6, 0) };
    case 3:
      return { periodStart: new Date(year, 6, 1), periodEnd: new Date(year, 9, 0) };
    case 4:
      return { periodStart: new Date(year, 9, 1), periodEnd: new Date(year, 12, 0) };
    default:
      return { periodStart: new Date(year, 0, 1), periodEnd: new Date(year, 0, 1) };
  }
}

/** Задача пересекает календарный месяц (1–12) хотя бы в одном году, охваченном планом. */
export function taskOverlapsCalendarMonth(
  task: { planStart: string; planEnd: string },
  month: number,
): boolean {
  if (month < 1 || month > 12) return false;
  const ts = parseDate(task.planStart);
  const te = parseDate(task.planEnd);
  if (!ts || !te) return false;
  const y0 = ts.getFullYear();
  const y1 = te.getFullYear();
  for (let y = y0; y <= y1; y++) {
    const periodStart = new Date(y, month - 1, 1);
    const periodEnd = new Date(y, month, 0);
    if (isTaskInPeriod(task, periodStart, periodEnd)) return true;
  }
  return false;
}

/** Задача пересекает календарный квартал хотя бы в одном году плана (Q1: 01.01–31.03 и т.д.). */
export function taskOverlapsCalendarQuarter(
  task: { planStart: string; planEnd: string },
  quarter: number,
): boolean {
  if (quarter < 1 || quarter > 4) return false;
  const ts = parseDate(task.planStart);
  const te = parseDate(task.planEnd);
  if (!ts || !te) return false;
  const y0 = ts.getFullYear();
  const y1 = te.getFullYear();
  for (let y = y0; y <= y1; y++) {
    const { periodStart, periodEnd } = quarterPeriodBounds(y, quarter);
    if (isTaskInPeriod(task, periodStart, periodEnd)) return true;
  }
  return false;
}

/**
 * Фильтрация по пересечению планового интервала с месяцем или кварталом.
 * `value` — месяц 1–12 или квартал 1–4.
 */
export function filterByPeriod<T extends { planStart: string; planEnd: string }>(
  data: T[],
  filterType: PlanFactPeriodFilterType,
  value?: number,
): T[] {
  if (filterType === "all") return data;

  if (filterType === "month") {
    if (value == null || value < 1 || value > 12) return data;
    return data.filter((item) => taskOverlapsCalendarMonth(item, value));
  }

  if (filterType === "quarter") {
    if (value == null || value < 1 || value > 4) return data;
    return data.filter((item) => taskOverlapsCalendarQuarter(item, value));
  }

  return data;
}

/** Ответ `GET /gpr/tasks` / `PUT|POST /gpr/tasks` (поля в snake_case, как в API). */
export type GprTaskApiItem = {
  id: number;
  code: string;
  global_task_id: string | null;
  name: string;
  level: number;
  plan_start: string;
  plan_end: string;
  fact_start: string | null;
  fact_end: string | null;
  completion: number;
  comment: string | null;
  related_tmc_ids: string[];
  part_id: number;
  status?: string;
  blocked_reasons?: string[];
};

export function gprTaskFromApiItem(row: GprTaskApiItem): GPRTask {
  return {
    id: String(row.id),
    globalTaskId: row.global_task_id ?? row.code,
    code: row.code,
    name: row.name,
    partId: row.part_id,
    relatedTmcIds: row.related_tmc_ids ?? [],
    planStart: row.plan_start,
    planEnd: row.plan_end,
    factStart: row.fact_start,
    factEnd: row.fact_end,
    completion: row.completion,
    comment: row.comment ?? undefined,
    level: row.level,
  };
}

/** Тело `GprTaskCreate` / `GprTaskUpdate` для сохранения в backend. */
export type GprTaskWritePayload = {
  code: string;
  global_task_id: string | null;
  name: string;
  level: number;
  plan_start: string;
  plan_end: string;
  fact_start: string | null;
  fact_end: string | null;
  completion: number;
  comment: string | null;
  related_tmc_ids: string[];
  part_id: number;
};

export function gprTaskToApiWritePayload(task: GPRTask): GprTaskWritePayload {
  return {
    code: task.code,
    global_task_id: task.globalTaskId || task.code,
    name: task.name,
    level: task.level ?? 1,
    plan_start: task.planStart,
    plan_end: task.planEnd,
    fact_start: task.factStart ?? null,
    fact_end: task.factEnd ?? null,
    completion: task.completion,
    comment: task.comment ?? null,
    related_tmc_ids: task.relatedTmcIds ?? [],
    part_id: task.partId,
  };
}
