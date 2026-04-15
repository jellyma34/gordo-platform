import { isTaskInPeriod, toDate, type GPRTask } from "@/lib/gprUtils";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Канонический ключ квартала: `YYYY-Q1` … `YYYY-Q4`. */
export type TimelineQuarterKey = `${number}-Q${1 | 2 | 3 | 4}`;

export type QuarterlyAggregateBucket = {
  quarter_key: TimelineQuarterKey;
  /** Подпись для UI: «Q3 2025». */
  quarter_label: string;
  plan_days: number;
  fact_days: number;
  /** fact_days − plan_days по кварталу. */
  deviation: number;
};

/** Экспорт для фронта / API (пример структуры из ТЗ + канонический ключ). */
export type QuarterlyAggregateJsonRow = {
  quarter_key: string;
  quarter: string;
  plan_days: number;
  fact_days: number;
  deviation: number;
};

export function parseTimelineQuarterKey(key: string): { year: number; q: 1 | 2 | 3 | 4 } | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(key.trim());
  if (!m) return null;
  return { year: Number(m[1]), q: Number(m[2]) as 1 | 2 | 3 | 4 };
}

export function formatQuarterDisplayLabel(key: string): string {
  const p = parseTimelineQuarterKey(key);
  if (!p) return key;
  return `Q${p.q} ${p.year}`;
}

export function timelineQuarterBounds(
  year: number,
  quarter: 1 | 2 | 3 | 4,
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

function dateToQuarterKey(d: Date): TimelineQuarterKey {
  const y = d.getFullYear();
  const q = (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  return `${y}-Q${q}` as TimelineQuarterKey;
}

function quarterKeyToIndex(key: string): number {
  const p = parseTimelineQuarterKey(key);
  if (!p) return 0;
  return p.year * 4 + p.q - 1;
}

function indexToQuarterKey(idx: number): TimelineQuarterKey {
  const q = ((idx % 4) + 1) as 1 | 2 | 3 | 4;
  const y = Math.floor(idx / 4);
  return `${y}-Q${q}` as TimelineQuarterKey;
}

/** Все календарные кварталы от квартала, содержащего `min`, до квартала, содержащего `max` (включительно). */
export function listTimelineQuarterKeysBetween(min: Date, max: Date): TimelineQuarterKey[] {
  if (Number.isNaN(min.getTime()) || Number.isNaN(max.getTime()) || min > max) return [];
  const i0 = quarterKeyToIndex(dateToQuarterKey(min));
  const i1 = quarterKeyToIndex(dateToQuarterKey(max));
  const out: TimelineQuarterKey[] = [];
  for (let i = i0; i <= i1; i++) out.push(indexToQuarterKey(i));
  return out;
}

/** Число календарных дней в пересечении двух закрытых интервалов [a1,a2] и [b1,b2] (границы включительно). */
export function overlapInclusiveDays(a1: Date, a2: Date, b1: Date, b2: Date): number {
  const lo = Math.max(a1.getTime(), b1.getTime());
  const hi = Math.min(a2.getTime(), b2.getTime());
  if (lo > hi) return 0;
  return Math.round((hi - lo) / MS_PER_DAY) + 1;
}

function safeTaskPlanBounds(task: GPRTask): { start: Date; end: Date } | null {
  const start = toDate(task.planStart);
  const end = toDate(task.planEnd);
  if (!start || !end || start > end) return null;
  return { start, end };
}

function safeTaskFactBounds(task: GPRTask): { start: Date; end: Date } | null {
  if (!task.factStart || !task.factEnd) return null;
  const start = toDate(task.factStart);
  const end = toDate(task.factEnd);
  if (!start || !end || start > end) return null;
  return { start, end };
}

function minMaxProjectDates(tasks: GPRTask[]): { min: Date; max: Date } | null {
  let minT = Infinity;
  let maxT = -Infinity;
  for (const t of tasks) {
    const p = safeTaskPlanBounds(t);
    if (p) {
      minT = Math.min(minT, p.start.getTime());
      maxT = Math.max(maxT, p.end.getTime());
    }
    const f = safeTaskFactBounds(t);
    if (f) {
      minT = Math.min(minT, f.start.getTime());
      maxT = Math.max(maxT, f.end.getTime());
    }
  }
  if (!Number.isFinite(minT) || !Number.isFinite(maxT)) return null;
  return { min: new Date(minT), max: new Date(maxT) };
}

/**
 * Сумма по кварталам: для каждой работы дни плана/факта, попадающие в квартал (пересечение интервалов).
 * Одна и та же календарная длительность распределяется по кварталам без «растягивания» долей — сумма по кварталам
 * равна длительности работы в днях (при полном покрытии годами проекта).
 */
export function computeQuarterlyAggregatesFromTasks(tasks: GPRTask[]): QuarterlyAggregateBucket[] {
  const mm = minMaxProjectDates(tasks);
  if (!mm) return [];
  const keys = listTimelineQuarterKeysBetween(mm.min, mm.max);
  const planSum = new Map<string, number>();
  const factSum = new Map<string, number>();
  for (const k of keys) {
    planSum.set(k, 0);
    factSum.set(k, 0);
  }

  for (const task of tasks) {
    const plan = safeTaskPlanBounds(task);
    if (!plan) continue;
    const fact = safeTaskFactBounds(task);

    for (const key of keys) {
      const pq = parseTimelineQuarterKey(key);
      if (!pq) continue;
      const { periodStart, periodEnd } = timelineQuarterBounds(pq.year, pq.q);
      const pd = overlapInclusiveDays(plan.start, plan.end, periodStart, periodEnd);
      planSum.set(key, (planSum.get(key) ?? 0) + pd);
      if (fact) {
        const fd = overlapInclusiveDays(fact.start, fact.end, periodStart, periodEnd);
        factSum.set(key, (factSum.get(key) ?? 0) + fd);
      }
    }
  }

  return keys
    .map((quarter_key) => {
      const plan_days = planSum.get(quarter_key) ?? 0;
      const fact_days = factSum.get(quarter_key) ?? 0;
      return {
        quarter_key,
        quarter_label: formatQuarterDisplayLabel(quarter_key),
        plan_days,
        fact_days,
        deviation: fact_days - plan_days,
      };
    })
    .filter((b) => b.plan_days > 0 || b.fact_days > 0);
}

export function bucketsToJsonRows(buckets: QuarterlyAggregateBucket[]): QuarterlyAggregateJsonRow[] {
  return buckets.map((b) => ({
    quarter_key: b.quarter_key,
    quarter: b.quarter_label,
    plan_days: b.plan_days,
    fact_days: b.fact_days,
    deviation: b.deviation,
  }));
}

export function filterBucketsByYear(
  buckets: QuarterlyAggregateBucket[],
  year: number,
): QuarterlyAggregateBucket[] {
  return buckets.filter((b) => b.quarter_key.startsWith(`${year}-`));
}

export function filterBucketsByQuarterKey(
  buckets: QuarterlyAggregateBucket[],
  key: string,
): QuarterlyAggregateBucket[] {
  return buckets.filter((b) => b.quarter_key === key);
}

/** Годы, для которых есть ненулевые данные в агрегатах. */
export function distinctYearsFromBuckets(buckets: QuarterlyAggregateBucket[]): number[] {
  const ys = new Set<number>();
  for (const b of buckets) {
    const p = parseTimelineQuarterKey(b.quarter_key);
    if (p) ys.add(p.year);
  }
  return [...ys].sort((a, b) => a - b);
}

export function getTimelineQuarterPeriodBounds(
  key: string,
): { periodStart: Date; periodEnd: Date } | null {
  const pq = parseTimelineQuarterKey(key);
  if (!pq) return null;
  return timelineQuarterBounds(pq.year, pq.q);
}

/** Фильтр UI графика (только режим kvartaly / Gantt). */
export type KvartalyGanttFilter =
  | { filterType: "all" }
  | { filterType: "year"; value: number }
  | { filterType: "timelineQuarter"; key: string };

export function toKvartalyGanttFilter(
  f:
    | { filterType: "all" }
    | { filterType: "year"; value: number }
    | { filterType: "timelineQuarter"; key: string }
    | { filterType: "month"; value: number }
    | { filterType: "quarter"; value: number },
): KvartalyGanttFilter {
  if (f.filterType === "all" || f.filterType === "year" || f.filterType === "timelineQuarter") return f;
  return { filterType: "all" };
}

/** Работы, пересекающие выбранный год или квартал (по плану). */
export function filterKvartalyTasksForGantt(tasks: GPRTask[], f: KvartalyGanttFilter): GPRTask[] {
  if (f.filterType === "all") return tasks;
  if (f.filterType === "year") {
    const y = f.value;
    const ps = new Date(y, 0, 1);
    const pe = new Date(y, 11, 31);
    return tasks.filter((t) => isTaskInPeriod(t, ps, pe));
  }
  if (f.filterType === "timelineQuarter") {
    const b = getTimelineQuarterPeriodBounds(f.key);
    if (!b) return tasks;
    return tasks.filter((t) => isTaskInPeriod(t, b.periodStart, b.periodEnd));
  }
  return tasks;
}

/** Число работ с ненулевым пересечением плана с кварталом. */
export function computeQuarterlyActiveWorkCounts(tasks: GPRTask[]): Map<string, number> {
  const mm = minMaxProjectDates(tasks);
  if (!mm) return new Map();
  const keys = listTimelineQuarterKeysBetween(mm.min, mm.max);
  const counts = new Map<string, number>();
  for (const key of keys) {
    const pq = parseTimelineQuarterKey(key);
    if (!pq) continue;
    const { periodStart, periodEnd } = timelineQuarterBounds(pq.year, pq.q);
    let c = 0;
    for (const t of tasks) {
      const p = safeTaskPlanBounds(t);
      if (!p) continue;
      if (overlapInclusiveDays(p.start, p.end, periodStart, periodEnd) > 0) c++;
    }
    counts.set(key, c);
  }
  return counts;
}

/** Длина квартала в календарных днях (включительно). */
export function calendarDaysInTimelineQuarter(key: string): number {
  const b = getTimelineQuarterPeriodBounds(key);
  if (!b) return 92;
  return (
    Math.round((b.periodEnd.getTime() - b.periodStart.getTime()) / MS_PER_DAY) + 1
  );
}

/**
 * Загрузка квартала: Σ дней пересечения планов работ с кварталом / число дней в квартале.
 * (то же числитель, что в `computeQuarterlyAggregatesFromTasks`, без ручного пересчёта логики пересечений.)
 */
export function computeQuarterlyLoadRatioPercent(tasks: GPRTask[]): Map<string, number> {
  const buckets = computeQuarterlyAggregatesFromTasks(tasks);
  const m = new Map<string, number>();
  for (const b of buckets) {
    const denom = calendarDaysInTimelineQuarter(b.quarter_key);
    if (denom <= 0) continue;
    m.set(b.quarter_key, Math.min(250, Math.round((b.plan_days / denom) * 1000) / 10));
  }
  return m;
}

export function serialDayFromOrigin(
  isoDate: string | null | undefined,
  origin: Date | null | undefined,
): number | null {
  const date = toDate(isoDate);
  if (!date || !origin || Number.isNaN(origin.getTime())) return null;
  return (date.getTime() - origin.getTime()) / MS_PER_DAY;
}

/** Окно оси X: начало (полночь) и длина в днях. */
export function getGanttXWindow(
  tasks: GPRTask[],
  f: KvartalyGanttFilter,
): { origin: Date; maxSerial: number } | null {
  if (tasks.length === 0) return null;
  if (f.filterType === "year") {
    const y = f.value;
    const origin = new Date(y, 0, 1);
    const end = new Date(y, 11, 31);
    return {
      origin,
      maxSerial: Math.round((end.getTime() - origin.getTime()) / MS_PER_DAY) + 1,
    };
  }
  if (f.filterType === "timelineQuarter") {
    const b = getTimelineQuarterPeriodBounds(f.key);
    if (!b) return null;
    const origin = new Date(
      b.periodStart.getFullYear(),
      b.periodStart.getMonth(),
      b.periodStart.getDate(),
    );
    return {
      origin,
      maxSerial:
        Math.round((b.periodEnd.getTime() - b.periodStart.getTime()) / MS_PER_DAY) + 1,
    };
  }
  const mm = minMaxProjectDates(tasks);
  if (!mm) return null;
  const origin = new Date(mm.min.getFullYear(), mm.min.getMonth(), mm.min.getDate());
  const pad = 10;
  const maxSerial = Math.round((mm.max.getTime() - origin.getTime()) / MS_PER_DAY) + pad;
  return { origin, maxSerial: Math.max(maxSerial, 14) };
}

export function clampSerialRange(
  isoStart: string | null | undefined,
  isoEnd: string | null | undefined,
  origin: Date,
  maxSerial: number,
): [number, number] | null {
  if (!isoStart?.trim() || !isoEnd?.trim()) return null;
  let a = serialDayFromOrigin(isoStart, origin);
  let b = serialDayFromOrigin(isoEnd, origin);
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (b < a) return null;
  a = Math.max(0, a);
  b = Math.min(maxSerial, b);
  if (b < a) return null;
  return [a, b];
}

/** Порог «много работ в квартале» по распределению счётчиков. */
export function quarterOverloadThreshold(counts: Iterable<number>): number {
  const arr = [...counts].filter((n) => n > 0).sort((x, y) => x - y);
  if (arr.length === 0) return 8;
  const mean = arr.reduce((s, n) => s + n, 0) / arr.length;
  const p75 = arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.75))] ?? mean;
  return Math.max(5, Math.ceil(Math.max(p75, mean * 1.35)));
}
