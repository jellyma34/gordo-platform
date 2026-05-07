import {
  normalizeGprCodeFinal,
  type GPRTask,
  type GprPlanFactScopeKey,
  type ProjectPartKey,
} from "@/lib/gprUtils";
import { parseGprReportCsvWithStats, type GprReportCsvRow } from "@/lib/gprReportCsv";

/** Часть проекта по префиксу шифра (2.06 / 2.07 → автостоянка). */
export function inferPartIdFromGprCode(code: string): number {
  const n = normalizeGprCodeFinal(code);
  if (n.startsWith("2.06") || n.startsWith("2.07")) return 2;
  return 1;
}

/** Подбор части проекта по подписи объекта из CSV (жилой дом / автостоянка). */
function inferPartIdFromObjectLabel(label: string): number | null {
  const l = label.toLowerCase();
  if (l.includes("автостоянк") || l.includes("паркинг")) return 2;
  if (l.includes("жилой")) return 1;
  return null;
}

function projectPartKeyFromObjectLabel(label: string): ProjectPartKey | undefined {
  const pid = inferPartIdFromObjectLabel(label);
  if (pid === 1) return "residential";
  if (pid === 2) return "parking";
  return undefined;
}

function slugForObjectType(label: string): string {
  const s = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-zа-яё0-9_-]/gi, "");
  return s.length > 0 ? s : "obj";
}
function levelFromGprCode(code: string): number {
  const n = normalizeGprCodeFinal(code).split(".").filter((p) => p.length > 0).length;
  return Math.max(1, n - 1);
}

/** Детерминированный id как в mock: «2.05.01» → «2-05-01». */
export function gprStableIdFromCode(code: string): string {
  return normalizeGprCodeFinal(code).replace(/\./g, "-");
}

function inferPlanFactScope(objectType: string, partId: number): GprPlanFactScopeKey {
  const l = objectType.toLowerCase();
  if (l.includes("автостоянк") || l.includes("паркинг")) return "parking";
  if (l.includes("жилой")) return "house";
  return partId === 2 ? "parking" : "house";
}

function gprCsvRowToTask(row: GprReportCsvRow): GPRTask {
  const code = normalizeGprCodeFinal(row.code);
  const objectType = row.objectType ?? "";
  const scopeKey = `${code}${objectType}`;
  const otSlug = slugForObjectType(objectType);
  const id = `${gprStableIdFromCode(code)}--${otSlug}--csv${row.sourceRowIndex}`;
  const partFromObject = inferPartIdFromObjectLabel(objectType);
  const partId = partFromObject ?? inferPartIdFromGprCode(code);
  const projectPartKey = projectPartKeyFromObjectLabel(objectType);

  return {
    id,
    globalTaskId: `${scopeKey}::__csv${row.sourceRowIndex}`,
    code,
    objectType,
    planFactScope: inferPlanFactScope(objectType, partId),
    name: row.name || code,
    partId,
    projectPartKey,
    planStart: row.planStart,
    planEnd: row.planEnd,
    factStart: row.factStart,
    factEnd: row.factEnd,
    completion: row.completion,
    level: levelFromGprCode(code),
    missingFromImport: false,
    relatedTmcIds: [],
  };
}
export type GprCsvMergeStats = {
  /** Строк в файле после `split(/\\r?\\n/)` (включая пустые) */
  csvPapaRowCount: number;
  /** Задач из разбора CSV (по одной на каждую непустую строку) */
  parsedRowCount: number;
  /** То же, что `parsedRowCount` при прямом импорте без слияния */
  mergedTaskCount: number;
  csvRowsApplied: number;
  csvRows: number;
  updated: number;
  added: number;
  markedAbsentFromReport: number;
};

/**
 * ВРЕМЕННО: без слияния с существующими задачами — каждая строка CSV → одна задача,
 * порядок как в файле. Параметр `baseTasks` не используется (оставлен для совместимости вызова).
 */
export function mergeGprTasksFromReportCsv(
  _baseTasks: GPRTask[],
  csvText: string,
): { tasks: GPRTask[]; stats: GprCsvMergeStats } {
  const { rows: parsedTasks, csvPapaRowCount } = parseGprReportCsvWithStats(csvText);

  console.log("RAW TASKS:", parsedTasks.length);

  const tasks = parsedTasks.map(gprCsvRowToTask);

  console.log("FINAL TASKS:", tasks.length);

  const parsedRowCount = parsedTasks.length;

  return {
    tasks,
    stats: {
      csvPapaRowCount,
      parsedRowCount,
      mergedTaskCount: tasks.length,
      csvRowsApplied: parsedRowCount,
      csvRows: parsedRowCount,
      updated: 0,
      added: parsedRowCount,
      markedAbsentFromReport: 0,
    },
  };
}
