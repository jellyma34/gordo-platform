import {
  gprPlanFactScopeFromTask,
  inferGprPartIdFromCode,
  inferGprPartIdFromObjectLabel,
  normalizeGprCodeFinal,
  type GPRTask,
  type GprPlanFactScopeKey,
  type ProjectPartKey,
} from "@/lib/gprUtils";
import { parseGprReportCsvWithStats, type GprReportCsvRow } from "@/lib/gprReportCsv";

function projectPartKeyFromObjectLabel(label: string): ProjectPartKey | undefined {
  const pid = inferGprPartIdFromObjectLabel(label);
  if (pid === 1) return "residential";
  if (pid === 2) return "parking";
  return undefined;
}

function objectTypeLabelFromPartId(partId: number): string {
  return partId === 2 ? "Автостоянка" : "Жилой дом";
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

function gprCsvRowToTask(
  row: GprReportCsvRow,
  opts?: { forcedPartId?: number; stableSuffix?: string },
): GPRTask {
  const code = normalizeGprCodeFinal(row.code);
  const forcedPartId = opts?.forcedPartId === 1 || opts?.forcedPartId === 2 ? opts.forcedPartId : null;
  const objectType = (row.objectType ?? "").trim() || (forcedPartId ? objectTypeLabelFromPartId(forcedPartId) : "");
  const scopeKey = `${code}::${objectType}`;
  const otSlug = slugForObjectType(objectType);
  const idSuffix = opts?.stableSuffix?.trim() || `${otSlug}--csv`;
  const id = `${gprStableIdFromCode(code)}--${idSuffix}`;
  const partFromObject = inferGprPartIdFromObjectLabel(objectType);
  const partId = forcedPartId ?? partFromObject ?? inferGprPartIdFromCode(code);
  const projectPartKey =
    projectPartKeyFromObjectLabel(objectType) ?? (partId === 2 ? "parking" : "residential");

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

/** Ключ слияния: часть проекта + шифр + объект CSV (жилой дом / автостоянка не затирают друг друга). */
function taskIdentityKey(task: GPRTask): string {
  const scope = gprPlanFactScopeFromTask(task);
  const ot = slugForObjectType(task.objectType ?? "");
  return `${task.partId}::${normalizeGprCodeFinal(task.code)}::${scope}::${ot}`;
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
  baseTasks: GPRTask[],
  csvText: string,
  options?: { forcedPartId?: number },
): { tasks: GPRTask[]; stats: GprCsvMergeStats } {
  const { rows: parsedRows, csvPapaRowCount } = parseGprReportCsvWithStats(csvText);
  const parsedRowCount = parsedRows.length;
  const forcedPartId = options?.forcedPartId === 1 || options?.forcedPartId === 2 ? options.forcedPartId : null;

  const csvTasksRaw = parsedRows.map((row) =>
    gprCsvRowToTask(row, {
      forcedPartId: forcedPartId ?? undefined,
    }),
  );

  // В одном файле — по одному ключу «часть + шифр + объект», последняя строка побеждает.
  const csvByKey = new Map<string, GPRTask>();
  for (const t of csvTasksRaw) {
    csvByKey.set(taskIdentityKey(t), t);
  }
  const csvTasks = [...csvByKey.values()];

  const incomingPartIds = new Set(csvTasks.map((t) => t.partId));
  const untouchedBase = baseTasks.filter((t) => !incomingPartIds.has(t.partId));
  const targetBase = baseTasks.filter((t) => incomingPartIds.has(t.partId));

  const baseByKey = new Map<string, GPRTask>();
  for (const t of targetBase) {
    baseByKey.set(taskIdentityKey(t), t);
  }

  let updated = 0;
  let added = 0;
  const mergedForTargetParts = csvTasks.map((incoming) => {
    const key = taskIdentityKey(incoming);
    const existed = baseByKey.get(key);
    if (existed) {
      updated += 1;
      return {
        ...existed,
        ...incoming,
        id: existed.id,
        globalTaskId: existed.globalTaskId || incoming.globalTaskId,
        missingFromImport: false,
      };
    }
    added += 1;
    return incoming;
  });

  const tasks = [...untouchedBase, ...mergedForTargetParts];
  const markedAbsentFromReport = Math.max(0, targetBase.length - updated);

  return {
    tasks,
    stats: {
      csvPapaRowCount,
      parsedRowCount,
      mergedTaskCount: tasks.length,
      csvRowsApplied: parsedRowCount,
      csvRows: parsedRowCount,
      updated,
      added,
      markedAbsentFromReport,
    },
  };
}
