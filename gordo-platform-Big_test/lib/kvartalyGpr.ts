import quarterlyJson from "@/lib/data/kvartaly_gpr_quarterly.json";
import {
  partIdToProjectPartKey,
  PROJECT_PART_KEY_TO_ID,
  type GPRTask,
} from "@/lib/gprUtils";

/**
 * Поквартальная шкала и агрегаты по датам: модуль `gprQuarterlyTimeline.ts`,
 * `lib/data/kvartaly_gpr_quarterly_aggregates.json`.
 *
 * Источник: `data/kvartaly_gpr_full.txt` → `lib/data/kvartaly_gpr_quarterly.json`.
 *
 * Нормализованная модель:
 * - **Work** — сущность работы: work_id, name, category (в JSON одной строкой).
 * - **Period** — календарный квартал: поле `quarter` в формате `YYYY-Qn` (привязка строки файла к кварталу).
 * - **Schedule** — plan_*, fact_* на работе в контексте этой строки (одна работа может иметь несколько строк с разными quarter).
 * - Связь: строка JSON = (Work × Period) с интервалами Schedule для отображения/фильтра.
 */

export type KvartalyQuarterKey = `${number}-Q${1 | 2 | 3 | 4}`;

export type KvartalyQuarterlyRow = {
  work_id: string | null;
  name: string;
  category: string;
  quarter: KvartalyQuarterKey;
  plan_start: string | null;
  plan_end: string | null;
  fact_start: string | null;
  fact_end: string | null;
};

export type KvartalyScheduleStatus = "в срок" | "отставание" | "без факта";

const ROWS: KvartalyQuarterlyRow[] = quarterlyJson as KvartalyQuarterlyRow[];

export function getKvartalyQuarterlyRows(): readonly KvartalyQuarterlyRow[] {
  return ROWS;
}

function parseQuarterKey(key: string): { year: number; q: 1 | 2 | 3 | 4 } | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(key.trim());
  if (!m) return null;
  return { year: Number(m[1]), q: Number(m[2]) as 1 | 2 | 3 | 4 };
}

/** Границы календарного квартала [start, end] 00:00 локально. */
export function quarterPeriodBounds(
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

/** Пересечение двух закрытых интервалов дат (включительно по дням). */
export function intervalsIntersect(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() <= bEnd.getTime() && aEnd.getTime() >= bStart.getTime();
}

/** Попадание планового интервала строки в квартал `YYYY-Qn`. */
export function rowPlanIntersectsQuarter(row: KvartalyQuarterlyRow, quarterKey: string): boolean {
  const pq = parseQuarterKey(quarterKey);
  if (!pq) return false;
  const { periodStart, periodEnd } = quarterPeriodBounds(pq.year, pq.q);
  if (!row.plan_start || !row.plan_end) {
    if (row.plan_end) {
      const end = new Date(`${row.plan_end}T00:00:00`);
      if (Number.isNaN(end.getTime())) return false;
      return intervalsIntersect(end, end, periodStart, periodEnd);
    }
    return false;
  }
  const ps = new Date(`${row.plan_start}T00:00:00`);
  const pe = new Date(`${row.plan_end}T00:00:00`);
  if (Number.isNaN(ps.getTime()) || Number.isNaN(pe.getTime())) return false;
  return intervalsIntersect(ps, pe, periodStart, periodEnd);
}

export function filterKvartalyRowsByQuarter(
  rows: readonly KvartalyQuarterlyRow[],
  quarterKey: string,
): KvartalyQuarterlyRow[] {
  return rows.filter((r) => rowPlanIntersectsQuarter(r, quarterKey));
}

/**
 * Статус по факту относительно плана (календарное окончание; без догадок по незавершённому факту).
 */
export function getKvartalyRowStatus(row: KvartalyQuarterlyRow): KvartalyScheduleStatus {
  if (!row.fact_start || !row.fact_end || !row.plan_end) return "без факта";
  const planEnd = new Date(`${row.plan_end}T00:00:00`);
  const factEnd = new Date(`${row.fact_end}T00:00:00`);
  if (Number.isNaN(planEnd.getTime()) || Number.isNaN(factEnd.getTime())) return "без факта";
  if (factEnd.getTime() <= planEnd.getTime()) return "в срок";
  return "отставание";
}

/** Строка kvartaly относится к автостоянке: корень `2.05`, сети `2.06*`, благо `2.07*`. */
function isKvartalyParkingWorkId(workId: string | null | undefined): boolean {
  if (!workId) return false;
  const w = workId.trim();
  if (w === "2.05") return true;
  if (w === "2.06" || w.startsWith("2.06.")) return true;
  if (w === "2.07" || w.startsWith("2.07.")) return true;
  return false;
}

/** Жилой дом: всё, кроме веток автостоянки. Паркинг: `2.05`, `2.06*`, `2.07*`. */
export function kvartalyRowVisibleForPart(row: KvartalyQuarterlyRow, partId: number): boolean {
  const parking = isKvartalyParkingWorkId(row.work_id);
  if (partId === PROJECT_PART_KEY_TO_ID.parking) return parking;
  return !parking;
}

/**
 * Часть проекта по строке JSON: автостоянка — `2.05` / `2.06*` / `2.07*`, остальное — жилой дом.
 */
export function kvartalyRowPartId(row: KvartalyQuarterlyRow): number {
  return isKvartalyParkingWorkId(row.work_id)
    ? PROJECT_PART_KEY_TO_ID.parking
    : PROJECT_PART_KEY_TO_ID.residential;
}

function rowToGprTask(row: KvartalyQuarterlyRow, partId: number): GPRTask | null {
  const planStart = row.plan_start ?? row.plan_end;
  const planEnd = row.plan_end ?? row.plan_start;
  if (!planStart || !planEnd) return null;
  const workId = row.work_id ?? `meta.${slugName(row.name)}`;
  const id = `${workId}@${row.quarter}`;
  return {
    id,
    globalTaskId: id,
    code: row.work_id ?? "meta.completion",
    name: row.name,
    partId,
    projectPartKey: partIdToProjectPartKey(partId),
    planStart,
    planEnd,
    factStart: row.fact_start,
    factEnd: row.fact_end,
    completion: 0,
    kvartalyQuarter: row.quarter,
  };
}

/** Все работы из kvartaly_gpr_quarterly.json с корректным `partId` и `projectPartKey` по шифру. */
export function kvartalyRowsToGprTasksForAllParts(): GPRTask[] {
  const out: GPRTask[] = [];
  for (const row of ROWS) {
    const partId = kvartalyRowPartId(row);
    const task = rowToGprTask(row, partId);
    if (task) out.push(task);
  }
  return out;
}

/** Задачи для графика «План vs Факт» из поквартального файла — только выбранная часть проекта. */
export function kvartalyRowsToGprTasks(partId: number): GPRTask[] {
  return kvartalyRowsToGprTasksForAllParts().filter((t) => t.partId === partId);
}

function slugName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-zа-яё0-9._-]/gi, "");
}

/**
 * Логические пробелы относительно типовой модели ЖД (в файле нет отдельных позиций).
 * ID — предложение ветки 2.05.x / 2.06.x, без заполнения сроков (не данные графика).
 */
export const KVARTALY_TYPICAL_GAPS: readonly { suggested_id: string; name: string; note: string }[] = [
  { suggested_id: "2.05.12.1", name: "Лифты (монтаж)", note: "Нет отдельной работы; обычно выделяют от инженерии." },
  { suggested_id: "2.05.13.1", name: "Электроснабжение (внутренние сети)", note: "Есть обобщённо 2.05.11; нет силовой разбивки." },
  { suggested_id: "2.05.13.2", name: "Слаботочные системы (СКС, СОУЭ, АПС, СКУД)", note: "Не выделены." },
  { suggested_id: "2.05.14.1", name: "Вентиляция и кондиционирование (внутренние)", note: "Не отделены от «инженерных систем»." },
  { suggested_id: "2.05.15.1", name: "Водоснабжение и канализация (внутренние)", note: "Нет отдельно от ОВ/тепла." },
  { suggested_id: "2.05.16.1", name: "Пусконаладка инженерных систем", note: "Нет явной работы ПНР." },
  { suggested_id: "2.05.17.1", name: "Сдача в эксплуатацию / ввод объекта", note: "Кроме строки «Завершение проекта» без шифра." },
  { suggested_id: "2.06.02", name: "Наружные сети водоотведения/холодного водоснабжения", note: "Указаны только тепловые 2.06.01." },
];
