import {
  normalizeGprCodeFinal,
  sortGprTasksByCode,
  type GPRTask,
} from "@/lib/gprUtils";
import { parseGprReportCsv } from "@/lib/gprReportCsv";

/** Часть проекта по префиксу шифра (2.06 / 2.07 → автостоянка). */
export function inferPartIdFromGprCode(code: string): number {
  const n = normalizeGprCodeFinal(code);
  if (n.startsWith("2.06") || n.startsWith("2.07")) return 2;
  return 1;
}

function levelFromGprCode(code: string): number {
  const n = normalizeGprCodeFinal(code).split(".").filter((p) => p.length > 0).length;
  return Math.max(1, n - 1);
}

/** Детерминированный id как в mock: «2.05.01» → «2-05-01». */
export function gprStableIdFromCode(code: string): string {
  return normalizeGprCodeFinal(code).replace(/\./g, "-");
}

export type GprCsvMergeStats = {
  /** Строк в файле после дедупликации по шифру */
  csvRows: number;
  /** Обновлено существующих задач по совпадению шифра */
  updated: number;
  /** Добавлено новых шифров из файла */
  added: number;
  /** Помечено missingFromImport (есть в системе, не было в файле) */
  markedAbsentFromReport: number;
};

/**
 * Сливает задачи ГПР с отчётом CSV: обновление по шифру, добавление новых,
 * пометка отсутствующих в файле без удаления.
 */
export function mergeGprTasksFromReportCsv(
  baseTasks: GPRTask[],
  csvText: string,
): { tasks: GPRTask[]; stats: GprCsvMergeStats } {
  const parsed = parseGprReportCsv(csvText);
  const byCode = new Map<string, (typeof parsed)[0]>();
  for (const row of parsed) byCode.set(row.code, row);

  const csvCodes = new Set(byCode.keys());

  const sortedBase = sortGprTasksByCode(baseTasks.filter(Boolean));
  const seenCodes = new Set<string>();
  const deduped: GPRTask[] = [];
  for (const t of sortedBase) {
    const k = normalizeGprCodeFinal(t.code);
    if (seenCodes.has(k)) continue;
    seenCodes.add(k);
    deduped.push({ ...t });
  }

  let updated = 0;
  let markedAbsentFromReport = 0;

  const merged: GPRTask[] = deduped.map((task) => {
    const k = normalizeGprCodeFinal(task.code);
    const row = byCode.get(k);
    if (row) {
      updated++;
      return {
        ...task,
        name: row.name || task.name,
        planStart: row.planStart,
        planEnd: row.planEnd,
        factStart: row.factStart,
        factEnd: row.factEnd,
        completion: row.completion,
        level: task.level ?? levelFromGprCode(k),
        missingFromImport: false,
      };
    }
    markedAbsentFromReport++;
    return { ...task, missingFromImport: true };
  });

  const existingCodes = new Set(deduped.map((t) => normalizeGprCodeFinal(t.code)));
  let added = 0;

  for (const code of csvCodes) {
    if (existingCodes.has(code)) continue;
    added++;
    const row = byCode.get(code)!;
    merged.push({
      id: gprStableIdFromCode(code),
      globalTaskId: code,
      code,
      name: row.name || code,
      partId: inferPartIdFromGprCode(code),
      planStart: row.planStart,
      planEnd: row.planEnd,
      factStart: row.factStart,
      factEnd: row.factEnd,
      completion: row.completion,
      level: levelFromGprCode(code),
      missingFromImport: false,
      relatedTmcIds: [],
    });
  }

  const tasks = sortGprTasksByCode(merged);

  return {
    tasks,
    stats: {
      csvRows: parsed.length,
      updated,
      added,
      markedAbsentFromReport,
    },
  };
}
