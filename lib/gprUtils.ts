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
  planStart?: string | null;
  planEnd?: string | null;
  factStart?: string | null;
  factEnd?: string | null;
  completion: number;
  comment?: string;
  level?: number;
  /** Квартал из `kvartaly_gpr_quarterly.json` (для подписи оси при совпадении шифров). */
  kvartalyQuarter?: string;
  /**
   * Задача не попала в последний импорт CSV — не показывается в презентации (не удаляется).
   */
  missingFromImport?: boolean;
  /**
   * Плановый объём работ (усл. ед., напр. тыс. м³ или нормо-часы) — приоритетный вес для «Общий прогресс».
   * Если задано положительное значение, используется вместо contractValue и длительности плана.
   */
  plannedWorkVolume?: number | null;
  /**
   * Стоимость по договору (₽ и т.д.) — вес этапа, если объём не задан.
   * Иначе вес: длительность плана (дн.).
   */
  contractValue?: number | null;
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

/** Область в презентации: две части проекта или агрегат «весь проект». */
export type ConstructionObjectScope = 1 | 2 | "project";

export function isProjectWideScope(s: ConstructionObjectScope | number): s is "project" {
  return s === "project";
}

export function partScopeToUrlParam(s: ConstructionObjectScope): string {
  return s === "project" ? "project" : String(s);
}

/**
 * Разбор `partId` из query. Любые неожиданные значения → 1 (безопасный fallback для SSR/URL).
 */
export function urlParamToPartScope(p: string | null | undefined): ConstructionObjectScope {
  if (p == null) return 1;
  const t = String(p).trim().toLowerCase();
  if (t === "project") return "project";
  if (t === "2") return 2;
  if (t === "1") return 1;
  return 1;
}

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

export function daysBetween(start: string | null | undefined, end: string | null | undefined) {
  const a = toDate(start);
  const b = toDate(end);
  if (!a || !b) return NaN;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export function durationDays(start: string | null | undefined, end: string | null | undefined) {
  const n = daysBetween(start, end);
  if (!Number.isFinite(n)) return NaN;
  return n + 1;
}

/**
 * Отклонение по сроку окончания (календарные дни, локальная полуночь):
 * — есть fact_end → fact_end − plan_end;
 * — нет fact_end → today − plan_end (незавершённые работы).
 * Для оперативного контроля в таблице ГПР предпочтительнее {@link calculateDeviation} (по % на дату).
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

function roundProgress(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Плановый % выполнения на отчётную дату: линейно по [planStart, planEnd] (0% до начала, 100% после окончания).
 */
export function getPlannedProgressPercent(task: GPRTask, asOf: Date = new Date()): number | null {
  const ps = toDate(task.planStart ?? undefined);
  const pe = toDate(task.planEnd ?? undefined);
  if (!ps || !pe) return null;
  const d0 = startOfLocalDay(ps);
  const d1 = startOfLocalDay(pe);
  const dA = startOfLocalDay(asOf);
  if (dA < d0) return 0;
  if (dA > d1) return 100;
  const totalMs = d1 - d0;
  if (totalMs <= 0) return dA >= d0 && dA <= d1 ? 100 : 0;
  return roundProgress((100 * (dA - d0)) / totalMs);
}

/** Фактический % выполнения (карточка задачи). */
export function getActualProgressPercent(task: GPRTask): number {
  return roundProgress(Math.min(100, Math.max(0, Number(task.completion) || 0)));
}

/**
 * Оперативное отклонение: факт − план на текущую дату (проц. пт., не календарные дни).
 * Положительное — опережение графика, отрицательное — отставание.
 */
export function calculateDeviation(task: GPRTask, asOf: Date = new Date()): number | null {
  const planned = getPlannedProgressPercent(task, asOf);
  if (planned === null) return null;
  const fact = getActualProgressPercent(task);
  return roundProgress(fact - planned);
}

/** Светофор ГПР по отклонению в п.п. к плану на дату: зелёный ≥0, жёлтый (−10;0), красный &lt;−10. */
export function getStatusByGprProgressDelta(deltaPp: number): "green" | "yellow" | "red" {
  if (deltaPp >= 0) return "green";
  if (deltaPp >= -10) return "yellow";
  return "red";
}

export function getStatus(task: GPRTask, asOf: Date = new Date()): GPRStatus {
  const d = calculateDeviation(task, asOf);
  if (d === null) return "gray";
  return getStatusByGprProgressDelta(d);
}

/** Соответствует {@link getProjectStatus} по **дням** (ТМЦ, тендеры, пр.). Для ГПР по % — {@link getStatusByGprProgressDelta}. */
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

export function getProjectStats(tasks: GPRTask[], asOf: Date = new Date()) {
  const all = flattenTasks(tasks);
  const deltas: number[] = [];
  let sumPlanned = 0;
  let sumFact = 0;
  let nWithPlan = 0;
  for (const task of all) {
    const pl = getPlannedProgressPercent(task, asOf);
    if (pl === null) continue;
    const fc = getActualProgressPercent(task);
    const d = calculateDeviation(task, asOf);
    if (d === null) continue;
    deltas.push(d);
    sumPlanned += pl;
    sumFact += fc;
    nWithPlan += 1;
  }
  const total = all.length;
  const completed = all.filter((task) => task.completion >= 100).length;
  const overdue = all.filter((task) => {
    const d = calculateDeviation(task, asOf);
    return d !== null && d < -10;
  }).length;
  const avgDeviation =
    deltas.length > 0
      ? Number((deltas.reduce((sum, value) => sum + value, 0) / deltas.length).toFixed(1))
      : 0;
  const avgPlannedPercent =
    nWithPlan > 0 ? Number(((sumPlanned / nWithPlan) as number).toFixed(1)) : 0;
  const avgFactPercent = nWithPlan > 0 ? Number(((sumFact / nWithPlan) as number).toFixed(1)) : 0;

  const statusCounts = all.reduce(
    (acc, task) => {
      const status = getStatus(task, asOf);
      acc[status] += 1;
      return acc;
    },
    { green: 0, yellow: 0, red: 0, gray: 0, blocked: 0 } satisfies Record<GPRStatus, number>,
  );

  return {
    total,
    completed,
    overdue,
    avgDeviation,
    avgPlannedPercent,
    avgFactPercent,
    statusCounts,
  };
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
  task: { planStart?: string | null; planEnd?: string | null },
  periodStart: Date,
  periodEnd: Date,
): boolean {
  const start = parseDate(task.planStart ?? undefined);
  const end = parseDate(task.planEnd ?? undefined);
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
  task: { planStart?: string | null; planEnd?: string | null },
  month: number,
): boolean {
  if (month < 1 || month > 12) return false;
  const ts = parseDate(task.planStart ?? undefined);
  const te = parseDate(task.planEnd ?? undefined);
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
  task: { planStart?: string | null; planEnd?: string | null },
  quarter: number,
): boolean {
  if (quarter < 1 || quarter > 4) return false;
  const ts = parseDate(task.planStart ?? undefined);
  const te = parseDate(task.planEnd ?? undefined);
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
export function filterByPeriod<T extends { planStart?: string | null; planEnd?: string | null }>(
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
  plan_start: string | null;
  plan_end: string | null;
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
    planStart: row.plan_start ?? null,
    planEnd: row.plan_end ?? null,
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
  plan_start: string | null;
  plan_end: string | null;
  fact_start: string | null;
  fact_end: string | null;
  completion: number;
  comment: string | null;
  related_tmc_ids: string[];
  part_id: number;
};

export function gprTaskToApiWritePayload(task: GPRTask): GprTaskWritePayload {
  const ps = task.planStart?.trim() || null;
  const pe = task.planEnd?.trim() || null;
  return {
    code: task.code,
    global_task_id: task.globalTaskId || task.code,
    name: task.name,
    level: task.level ?? 1,
    plan_start: ps,
    plan_end: pe,
    fact_start: task.factStart?.trim() ? task.factStart : null,
    fact_end: task.factEnd?.trim() ? task.factEnd : null,
    completion: task.completion,
    comment: task.comment ?? null,
    related_tmc_ids: task.relatedTmcIds ?? [],
    part_id: task.partId,
  };
}

/** Допустимый нормализованный шифр ГПР: сегменты из цифр через точку (например 2.05.03.1). */
export const GPR_CODE_FORMAT_RE = /^\d+(\.\d+)*$/;

/** Во время ввода: только цифры и точки. */
export function sanitizeGprCodeTyping(raw: string): string {
  return raw.replace(/[^\d.]/g, "");
}

/** После blur / перед сохранением: убрать лишние точки и пустые сегменты. */
export function normalizeGprCodeFinal(raw: string): string {
  return raw
    .replace(/[^\d.]/g, "")
    .split(".")
    .filter((p) => p.length > 0)
    .join(".");
}

/**
 * Шифр ГПР как массив целых сегментов: «2.05.01.2» → [2, 5, 1, 2].
 * Нечисловые сегменты дают 0 (устойчивость к мусору).
 */
export function gprCodeToNumericSegments(code: string): number[] {
  const parts = code.trim().split(".").filter((p) => p.length > 0);
  return parts.map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/**
 * Сравнение шифров для иерархии: по сегментам как числа; при общем префиксе короче (родитель) раньше.
 * Корректно разводит ветки 2.04* и 2.05*.
 */
export function compareGprCodesByNumericPath(a: string, b: string): number {
  const sa = gprCodeToNumericSegments(a);
  const sb = gprCodeToNumericSegments(b);
  const n = Math.min(sa.length, sb.length);
  for (let i = 0; i < n; i++) {
    if (sa[i] !== sb[i]) return sa[i]! - sb[i]!;
  }
  return sa.length - sb.length;
}

/** Уровень отступа в таблице: 2.04 → 0, 2.04.01 → 1, … */
export function gprCodeTreeIndentLevel(code: string): number {
  const parts = code.trim().split(".").filter((p) => p.length > 0);
  return Math.max(0, parts.length - 2);
}

export function sortGprTasksByCode(tasks: GPRTask[]): GPRTask[] {
  return [...tasks].sort((a, b) => {
    const c = compareGprCodesByNumericPath(a.code, b.code);
    if (c !== 0) return c;
    return a.id.localeCompare(b.id);
  });
}

export function isIsoDateString(s: string | null | undefined): s is string {
  return Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));
}

export function isoDayMs(s: string): number {
  return new Date(`${s}T00:00:00`).getTime();
}

/** Родительский шифр: «2.05.01.2» → «2.05.01». */
export function gprParentCode(code: string): string | null {
  const parts = code.trim().split(".").filter((p) => p.length > 0);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
}

/**
 * Следующий дочерний шифр при прямых потомках вида `parent.N` (N — целое).
 * `parent === null` → корневой уровень (`1`, `2`, …).
 */
export function suggestNextCodeUnderParent(existingCodes: string[], parent: string | null): string {
  const directChildNumbers = existingCodes
    .map((c) => c.trim())
    .filter((code) => {
      if (parent === null) return !code.includes(".");
      if (!code.startsWith(`${parent}.`)) return false;
      const rest = code.slice(parent.length + 1);
      return /^\d+$/.test(rest);
    })
    .map((code) => Number(code.split(".").pop() ?? "0"))
    .filter((n) => Number.isFinite(n) && n > 0);

  const next = (directChildNumbers.length > 0 ? Math.max(...directChildNumbers) : 0) + 1;
  return parent ? `${parent}.${next}` : `${next}`;
}

export type FourPlanFactDates = {
  planStart?: string | null;
  planEnd?: string | null;
  factStart?: string | null;
  factEnd?: string | null;
};

export function analyzeFourPlanFactDates(d: FourPlanFactDates): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ps = d.planStart;
  const pe = d.planEnd;
  const fs = d.factStart;
  const fe = d.factEnd;

  if (isIsoDateString(ps) && isIsoDateString(pe) && isoDayMs(ps) > isoDayMs(pe)) {
    errors.push("План: начало позже окончания");
  }
  if (isIsoDateString(fs) && isIsoDateString(fe) && isoDayMs(fs) > isoDayMs(fe)) {
    errors.push("Факт: начало позже окончания");
  }
  if (isIsoDateString(fs) && isIsoDateString(ps) && isoDayMs(fs) < isoDayMs(ps)) {
    warnings.push("Фактическое начало раньше планового");
  }
  if (isIsoDateString(fe) && isIsoDateString(pe) && isoDayMs(fe) < isoDayMs(pe)) {
    warnings.push("Фактическое окончание раньше планового");
  }
  return { errors, warnings };
}

export type GprCodeRowIssue = { errors: string[]; warnings: string[] };

/** Ошибки/предупреждения по шифру и иерархии в списке (дубли, формат, родитель). */
export function analyzeGprCodeInList<T extends { id: string; code: string }>(
  row: T,
  allRows: T[],
): GprCodeRowIssue {
  const errors: string[] = [];
  const warnings: string[] = [];
  const codeTrim = row.code.trim();

  if (!codeTrim) {
    errors.push("Пустой шифр");
  } else if (!GPR_CODE_FORMAT_RE.test(codeTrim)) {
    errors.push("Шифр: только цифры и точки (например 2.05.03.1)");
  }

  const dup = allRows.filter((r) => r.id !== row.id && r.code.trim() === codeTrim);
  if (codeTrim && dup.length > 0) {
    errors.push("Дублирующийся шифр в списке");
  }

  const p = gprParentCode(codeTrim);
  if (p && !allRows.some((x) => x.code.trim() === p)) {
    warnings.push(`Нет строки с родительским шифром «${p}»`);
  }

  return { errors, warnings };
}

export function mergeGprRowIssues(...parts: GprCodeRowIssue[]): GprCodeRowIssue {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const p of parts) {
    errors.push(...p.errors);
    warnings.push(...p.warnings);
  }
  return { errors, warnings };
}
