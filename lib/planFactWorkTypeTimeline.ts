import type { GPRTask, ProjectPartKey } from "@/lib/gprUtils";
import { aggregateWorksToProjectPlanFactBounds, overviewFactBarColor } from "@/lib/gprProjectOverview";

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
    { key: "prep", label: "Подготовка", match: (c) => c === "2.04" || c.startsWith("2.04.") },
    { key: "build", label: "Строительство", match: (c) => c === "2.05" || c.startsWith("2.05.") },
  ],
  parking: [
    { key: "net", label: "Инженерные сети", match: (c) => c === "2.06" || c.startsWith("2.06.") },
    { key: "improve", label: "Благоустройство", match: (c) => c === "2.07" || c.startsWith("2.07.") },
  ],
};

/** Виды работ по всему проекту (корневые 2.04–2.07) для агрегатного слайда. */
const WORK_TYPE_GROUPS_PROJECT: { key: string; label: string; match: (code: string) => boolean }[] = [
  ...WORK_TYPE_GROUPS.residential,
  ...WORK_TYPE_GROUPS.parking,
];

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
  const groups = partKey === "project" ? WORK_TYPE_GROUPS_PROJECT : WORK_TYPE_GROUPS[partKey];
  return groups.map((g) => ({
    key: g.key,
    label: g.label,
    bounds: aggregateWorksToProjectPlanFactBounds(tasks.filter((t) => g.match(t.code.trim()))),
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

export type PlanFactWorkTypeRowDetail = {
  planStart: string;
  planEnd: string;
  factStart: string | null;
  factEnd: string | null;
};

export type PlanFactWorkTypeChartModel = {
  /** Подписи по Y. */
  labels: string[];
  /** [x0, x1] плана в единицах `monthFloat` (от `originMonth`). */
  planRanges: Array<[number, number] | null>;
  factRanges: Array<[number, number] | null>;
  planColors: string[];
  factColors: string[];
  /** Исходные даты для подсказки. */
  rowDetails: PlanFactWorkTypeRowDetail[];
  originMonth: Date;
  xMin: number;
  xMax: number;
  todayX: number | null;
};

/**
 * Модель для горизонтального bar-chart: план/факт по видам работ, ось X — дробные месяцы, подписи «Янв 26».
 */
export function buildPlanFactWorkTypeChartModel(
  tasks: GPRTask[],
  partKey: PlanFactWorkTypePartKey,
  todayIso: string,
): PlanFactWorkTypeChartModel | null {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;

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
  const PLAN = "rgba(148, 163, 184, 0.5)";

  for (const r of rows) {
    const b = r.bounds;
    if (!b) continue;
    const ps = monthFloatFromIso(b.planStart, originMonth);
    const pe = monthFloatFromIso(b.planEnd, originMonth);
    if (ps == null || pe == null) continue;
    if (pe < ps) continue;
    planRanges.push([ps, pe]);
    labels.push(r.label);
    planColors.push(PLAN);
    rowDetails.push({
      planStart: b.planStart,
      planEnd: b.planEnd,
      factStart: b.factStart,
      factEnd: b.factEnd,
    });

    if (b.factStart && b.factEnd) {
      const fs = monthFloatFromIso(b.factStart, originMonth);
      const fe = monthFloatFromIso(b.factEnd, originMonth);
      if (fs != null && fe != null && fe >= fs) {
        factRanges.push([fs, fe]);
        factColors.push(
          overviewFactBarColor(b.planStart, b.planEnd, b.factStart, b.factEnd),
        );
      } else {
        factRanges.push(null);
        factColors.push("rgba(148, 163, 184, 0.25)");
      }
    } else {
      factRanges.push(null);
      factColors.push("rgba(148, 163, 184, 0.25)");
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
