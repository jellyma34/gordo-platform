import { getProjectStatus } from "@/utils/status";

export type GPRTask = {
  id: string;
  globalTaskId: string;
  code: string;
  name: string;
  partId: number;
  relatedTmcIds?: string[];
  planStart: string;
  planEnd: string;
  factStart?: string | null;
  factEnd?: string | null;
  completion: number;
  comment?: string;
  level?: number;
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

export function toDate(date: string) {
  return new Date(`${date}T00:00:00`);
}

export function parseDate(date?: string | null): Date | null {
  if (!date || date === "конец") return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysBetween(start: string, end: string) {
  const diff = toDate(end).getTime() - toDate(start).getTime();
  return Math.round(diff / MS_PER_DAY);
}

export function durationDays(start: string, end: string) {
  return daysBetween(start, end) + 1;
}

export function calculateDeviation(task: GPRTask): number | null {
  const planEnd = parseDate(task.planEnd);
  if (!planEnd) return null;
  const factEnd = parseDate(task.factEnd);
  const actual = factEnd ?? new Date();
  const diffMs = actual.getTime() - planEnd.getTime();
  return Math.round(diffMs / MS_PER_DAY);
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
    .map(calculateDeviation)
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

/** Фильтр периода для диаграмм по месяцу начала плана (`planStart`). */
export type PlanFactPeriodFilterType = "all" | "month" | "quarter";

const QUARTER_MONTHS: Record<number, readonly number[]> = {
  1: [1, 2, 3],
  2: [4, 5, 6],
  3: [7, 8, 9],
  4: [10, 11, 12],
};

/** Календарный месяц (1–12) по дате начала плана или `null`, если дата невалидна. */
export function planStartCalendarMonth(planStart: string | null | undefined): number | null {
  if (!planStart) return null;
  const d = toDate(planStart);
  if (Number.isNaN(d.getTime())) return null;
  return d.getMonth() + 1;
}

/**
 * Универсальная фильтрация по периоду: весь набор, один месяц или квартал (по `planStart`).
 * `value` — месяц 1–12 или квартал 1–4 (при `filterType` month / quarter).
 */
export function filterByPeriod<T extends { planStart: string }>(
  data: T[],
  filterType: PlanFactPeriodFilterType,
  value?: number,
): T[] {
  if (filterType === "all") return data;

  if (filterType === "month") {
    if (value == null || value < 1 || value > 12) return data;
    return data.filter((item) => planStartCalendarMonth(item.planStart) === value);
  }

  if (filterType === "quarter") {
    if (value == null || value < 1 || value > 4) return data;
    const months = QUARTER_MONTHS[value];
    return data.filter((item) => {
      const m = planStartCalendarMonth(item.planStart);
      return m != null && months.includes(m);
    });
  }

  return data;
}
