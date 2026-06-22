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

/** Метаданные части проекта при импорте с активной вкладки (Жилой дом / Автостоянка). */
function partImportMetadata(forcedPartId: 1 | 2): {
  partId: 1 | 2;
  objectType: string;
  projectPartKey: ProjectPartKey;
  planFactScope: GprPlanFactScopeKey;
  idSuffix: string;
} {
  if (forcedPartId === 2) {
    return {
      partId: 2,
      objectType: objectTypeLabelFromPartId(2),
      projectPartKey: "parking",
      planFactScope: "parking",
      idSuffix: "parking--csv",
    };
  }
  return {
    partId: 1,
    objectType: objectTypeLabelFromPartId(1),
    projectPartKey: "residential",
    planFactScope: "house",
    idSuffix: "residential--csv",
  };
}

function gprCsvRowToTask(
  row: GprReportCsvRow,
  opts?: { forcedPartId?: number; stableSuffix?: string },
): GPRTask {
  const code = normalizeGprCodeFinal(row.code);
  const forcedPartId = opts?.forcedPartId === 1 || opts?.forcedPartId === 2 ? opts.forcedPartId : null;

  let partId: 1 | 2;
  let objectType: string;
  let projectPartKey: ProjectPartKey;
  let planFactScope: GprPlanFactScopeKey;
  let idSuffix: string;

  if (forcedPartId != null) {
    const meta = partImportMetadata(forcedPartId);
    partId = meta.partId;
    objectType = meta.objectType;
    projectPartKey = meta.projectPartKey;
    planFactScope = meta.planFactScope;
    idSuffix = opts?.stableSuffix?.trim() || meta.idSuffix;
  } else {
    const rowObject = (row.objectType ?? "").trim();
    objectType = rowObject;
    const partFromObject = inferGprPartIdFromObjectLabel(objectType);
    partId = (partFromObject ?? inferGprPartIdFromCode(code)) as 1 | 2;
    projectPartKey =
      projectPartKeyFromObjectLabel(objectType) ?? (partId === 2 ? "parking" : "residential");
    planFactScope = inferPlanFactScope(objectType, partId);
    if (!objectType) objectType = objectTypeLabelFromPartId(partId);
    idSuffix = opts?.stableSuffix?.trim() || `${slugForObjectType(objectType)}--csv`;
  }

  const scopeKey = `${code}::${objectType}`;
  const id = `${gprStableIdFromCode(code)}--${idSuffix}`;

  return {
    id,
    globalTaskId: `${scopeKey}::__csv${row.sourceRowIndex}`,
    code,
    objectType,
    planFactScope,
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

/**
 * Строка CSV относится к вкладке импорта (Жилой дом / Автостоянка).
 * Полный отчёт содержит обе секции с одинаковыми шифрами 2.05.* — без фильтра
 * последняя секция затирает фактические даты предыдущей при forcedPartId.
 */
function csvRowMatchesForcedPart(row: GprReportCsvRow, forcedPartId: 1 | 2): boolean {
  const code = normalizeGprCodeFinal(row.code);
  if (forcedPartId === 2 && (code.startsWith("2.06") || code.startsWith("2.07"))) {
    return true;
  }
  const fromObject = inferGprPartIdFromObjectLabel(row.objectType ?? "");
  if (fromObject != null) return fromObject === forcedPartId;
  return inferGprPartIdFromCode(row.code) === forcedPartId;
}

/** При дубликате шифра в одной секции — строка с более полными датами/прогрессом. */
function gprTaskDataRichness(task: GPRTask): number {
  let score = 0;
  if (task.factStart?.trim()) score += 4;
  if (task.factEnd?.trim()) score += 8;
  if ((task.completion ?? 0) > 0) score += 2;
  if (task.planStart?.trim()) score += 1;
  if (task.planEnd?.trim()) score += 1;
  return score;
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
  const forcedPartId = options?.forcedPartId === 1 || options?.forcedPartId === 2 ? options.forcedPartId : null;
  const rowsForImport =
    forcedPartId != null
      ? parsedRows.filter((row) => csvRowMatchesForcedPart(row, forcedPartId))
      : parsedRows;
  const parsedRowCount = rowsForImport.length;

  const csvTasksRaw = rowsForImport.map((row) =>
    gprCsvRowToTask(row, {
      forcedPartId: forcedPartId ?? undefined,
    }),
  );

  // В одном файле — по одному ключу «часть + шифр + объект»; при равном ключе — более полная строка.
  const csvByKey = new Map<string, GPRTask>();
  for (const t of csvTasksRaw) {
    const key = taskIdentityKey(t);
    const prev = csvByKey.get(key);
    if (!prev || gprTaskDataRichness(t) >= gprTaskDataRichness(prev)) {
      csvByKey.set(key, t);
    }
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
