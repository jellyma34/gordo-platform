import {
  compareGprCodesByNumericPath,
  gprPlanFactCompositeKey,
  gprPlanFactScopeFromTask,
  matchesGprCodeBranch,
  normalizeGprCodeFinal,
  parseDateSafe,
  type GPRTask,
  type ProjectPartKey,
} from "@/lib/gprUtils";
import { buildPlanFactProjectWideRows } from "@/lib/gprProjectPlanFactStages";
import { aggregateWorksToProjectPlanFactBounds, overviewFactBarColor } from "@/lib/gprProjectOverview";

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

/** Режим bar-chart 2.05* для таблицы задач: только листья или только уровень «2.05.XX» (3 сегмента). */
export type PlanFactTasksBarLevel = "detailed" | "summary";

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

function gprCodeSegmentCount(normalizedCode: string): number {
  return normalizedCode.split(".").filter((p) => p.length > 0).length;
}

/** Ключ разбиения: дом/паркинг и объект CSV не смешивают деревья шифров. */
function residentialBarPartitionKey(task: GPRTask): string {
  const scope = gprPlanFactScopeFromTask(task);
  const ot = (task.objectType ?? "").trim().replace(/\s+/g, " ");
  return `${task.partId ?? 0}|${scope}|${ot}`;
}

function filter205TasksForResidentialBar(
  tasks: GPRTask[],
  level: PlanFactTasksBarLevel,
): GPRTask[] {
  const branch = tasks.filter((t) => normalizeGprCodeFinal(t.code).startsWith("2.05"));
  const partitions = new Map<string, GPRTask[]>();
  for (const t of branch) {
    const k = residentialBarPartitionKey(t);
    const arr = partitions.get(k);
    if (arr) arr.push(t);
    else partitions.set(k, [t]);
  }

  const out: GPRTask[] = [];
  for (const [, group] of partitions) {
    const normCodes = [...new Set(group.map((t) => normalizeGprCodeFinal(t.code)))];
    if (level === "detailed") {
      for (const t of group) {
        const c = normalizeGprCodeFinal(t.code);
        if (isLeafTask(c, normCodes)) out.push(t);
      }
    } else {
      for (const t of group) {
        const c = normalizeGprCodeFinal(t.code);
        if (gprCodeSegmentCount(c) === 3) out.push(t);
      }
    }
  }
  return out;
}

function buildResidential205PlanFactChartModel(
  tasks: GPRTask[],
  todayIso: string,
  barLevel: PlanFactTasksBarLevel,
): PlanFactWorkTypeChartModel | null {
  const list = filter205TasksForResidentialBar(tasks, barLevel).sort((a, b) => {
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
    const ps = parseDateSafe(task.planStart);
    const pe = parseDateSafe(task.planEnd);
    const fs = parseDateSafe(task.factStart);
    const fe = parseDateSafe(task.factEnd);
    const psm = isoDayMs(ps);
    const pem = isoDayMs(pe);
    const hasDates = Boolean(psm != null && pem != null && pem >= psm);
    const scope = gprPlanFactScopeFromTask(task);
    const nm = task.name.length > 52 ? `${task.name.slice(0, 49)}…` : task.name;
    const codeDisp = normalizeGprCodeFinal(task.code);
    const ot = (task.objectType ?? "").trim();
    const otHint = ot ? ` · ${ot.replace(/\s+/g, " ").slice(0, 36)}` : "";
    const label = `${scope}_${codeDisp}${otHint} · ${nm}`;
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
        if (e.fs && e.fe) {
          const ffS = monthFloatFromIso(e.fs, originMonth);
          const ffE = monthFloatFromIso(e.fe, originMonth);
          if (ffS != null && ffE != null && ffE >= ffS) {
            factRanges.push([ffS, ffE]);
            factColors.push(overviewFactBarColor(e.ps, e.pe, e.fs, e.fe));
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
 * Для «Жилой дом» и «Проект» — ветка `2.05*`: «Детально» — только листья дерева шифров; «Сводно» — только коды из трёх сегментов (`2.05.XX`). Разбиение по `partId`, области house/parking и `objectType`.
 */
export function buildPlanFactWorkTypeChartModel(
  tasks: GPRTask[],
  partKey: PlanFactWorkTypePartKey,
  todayIso: string,
  residentialBarLevel: PlanFactTasksBarLevel = "detailed",
): PlanFactWorkTypeChartModel | null {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;

  if (partKey === "residential" || partKey === "project") {
    return buildResidential205PlanFactChartModel(tasks, todayIso, residentialBarLevel);
  }

  const rows = buildPlanFactWorkTypeRows(tasks, partKey).filter((r) => r.bounds != null);
  if (rows.length === 0) return null;

  const allDates: string[] = [];
  for (const r of rows) {
    const b = r.bounds;
    if (!b) continue;
    allDates.push(b.planStart, b.planEnd);
    if (b.factStart) allDates.push(b.factStart);
    if (b.factEnd) allDates.push(b.factEnd);
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
    rowDetails.push({
      planStart: b.planStart,
      planEnd: b.planEnd,
      factStart: b.factStart,
      factEnd: b.factEnd,
      hasDates: true,
    });

    if (b.factStart && b.factEnd) {
      const fs = monthFloatFromIso(b.factStart, originMonth);
      const fe = monthFloatFromIso(b.factEnd, originMonth);
      if (fs != null && fe != null && fe >= fs) {
        factRanges.push([fs, fe]);
        factColors.push(overviewFactBarColor(b.planStart, b.planEnd, b.factStart, b.factEnd));
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
