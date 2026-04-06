import { GPR_DATA } from "@/lib/gprData";
import {
  durationDays,
  partIdToProjectPartKey,
  type GPRTask,
} from "@/lib/gprUtils";

/** Фиксированный перечень процессов укрупнённого режима по структуре ГПР (без корня 2.05 — только 2.04 и подпроцессы 2.05.xx). */
export const AGGREGATED_GPR_BUCKET_IDS = [
  "2.04",
  "2.05.01",
  "2.05.02",
  "2.05.03",
  "2.05.04",
  "2.05.05",
  "2.05.06",
  "2.05.07",
  "2.05.08",
  "2.05.09",
  "2.05.10",
  "2.05.11",
  "2.05.12",
  "2.05.99",
] as const;

export type AggregatedGprBucketId = (typeof AGGREGATED_GPR_BUCKET_IDS)[number];

const BUCKET_ORDER_INDEX = new Map<string, number>(
  AGGREGATED_GPR_BUCKET_IDS.map((id, i) => [id, i]),
);

const GPR_ITEM_NAME = new Map(GPR_DATA.map((g) => [g.code, g.name]));

/** Порядок корневых процессов (для справки / подписей). */
export const MAIN_PROCESS_ORDER = ["2.04", "2.05", "2.06", "2.07"] as const;

export const MAIN_PROCESS_TITLE: Record<string, string> = {
  "2.04": "Подготовка территории строительства",
  "2.05": "Строительство зданий и сооружений",
  "2.06": "Сети",
  "2.07": "Благоустройство",
};

/**
 * Строка относится к ведру `bucketId`, если код совпадает или является потомком по шифру:
 * `2.05.01.1` → ведро `2.05.01`; `2.05.011` к `2.05.01` не относится.
 */
export function gprTaskCodeMatchesBucket(taskCode: string, bucketId: string): boolean {
  const c = taskCode.trim();
  const b = bucketId.trim();
  if (!c || !b) return false;
  if (c === b) return true;
  return c.startsWith(`${b}.`);
}

/**
 * Для укрупнения «жилой дом»: только 2.04* и 2.05.* ниже корня (без агрегата паркинга `2.05`),
 * без веток 2.06 / 2.07.
 */
export function filterWorksForResidentialGprAggregation(works: GPRTask[]): GPRTask[] {
  return works.filter((t) => {
    const c = t.code.trim();
    if (c === "2.04" || c.startsWith("2.04.")) return true;
    if (c.startsWith("2.05.")) return true;
    return false;
  });
}

function isParkingRootOnlyDataset(works: GPRTask[]): boolean {
  return works.length > 0 && works.every((t) => t.code.trim() === "2.05");
}

function parseIsoDay(iso: string): number {
  const ms = new Date(`${iso.trim()}T00:00:00`).getTime();
  return Number.isNaN(ms) ? NaN : ms;
}

function minIso(isos: string[]): string | null {
  const ok = isos.filter((s) => s?.trim() && !Number.isNaN(parseIsoDay(s)));
  if (ok.length === 0) return null;
  return ok.reduce((a, b) => (parseIsoDay(a) <= parseIsoDay(b) ? a : b));
}

function maxIso(isos: string[]): string | null {
  const ok = isos.filter((s) => s?.trim() && !Number.isNaN(parseIsoDay(s)));
  if (ok.length === 0) return null;
  return ok.reduce((a, b) => (parseIsoDay(a) >= parseIsoDay(b) ? a : b));
}

/** Префикс id синтетических задач укрупнённого режима (для подсказок и цвета факта). */
const MAIN_PROCESS_ID_PREFIX = "main-process:";

export function isAggregatedMainProcessTask(task: GPRTask): boolean {
  return task.id.startsWith(MAIN_PROCESS_ID_PREFIX);
}

function bucketDisplayName(bucketId: string, children: GPRTask[]): string {
  const fromTree = GPR_ITEM_NAME.get(bucketId);
  if (fromTree) return fromTree;
  const sorted = [...children].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }),
  );
  const exact = sorted.find((c) => c.code.trim() === bucketId);
  if (exact?.name?.trim()) return exact.name.trim();
  const named = sorted.find((c) => c.name?.trim());
  return named?.name?.trim() ?? `Процесс ${bucketId}`;
}

function pushAggregatedRow(
  out: GPRTask[],
  bucketId: string,
  children: GPRTask[],
): void {
  if (children.length === 0) return;
  const planStart = minIso(children.map((c) => c.planStart));
  const planEnd = maxIso(children.map((c) => c.planEnd));
  if (!planStart || !planEnd) return;
  if (parseIsoDay(planStart) > parseIsoDay(planEnd)) return;

  const factStarts = children.map((c) => c.factStart).filter((x): x is string => !!x?.trim());
  const factEnds = children.map((c) => c.factEnd).filter((x): x is string => !!x?.trim());
  const factStart = factStarts.length ? minIso(factStarts) : null;
  const factEnd = factEnds.length ? maxIso(factEnds) : null;

  const partId = children[0]!.partId;
  const id = `${MAIN_PROCESS_ID_PREFIX}${bucketId}:${partId}`;

  out.push({
    id,
    globalTaskId: id,
    code: bucketId,
    name: bucketDisplayName(bucketId, children),
    partId,
    projectPartKey: children[0]!.projectPartKey ?? partIdToProjectPartKey(partId),
    planStart,
    planEnd,
    factStart: factStart ?? undefined,
    factEnd: factEnd ?? undefined,
    completion: 0,
  });
}

/**
 * Укрупнение по фиксированной структуре ГПР: ведра {@link AGGREGATED_GPR_BUCKET_IDS}.
 * Для набора «жилой дом» сначала отбираются только 2.04* и 2.05.* (без 2.06 / 2.07).
 * Для паркинга (все строки с кодом `2.05`) — одна агрегированная строка по корню.
 * Исходный массив `works` не изменяется.
 */
export function aggregateToMainProcesses(works: GPRTask[]): GPRTask[] {
  if (works.length === 0) return [];

  if (isParkingRootOnlyDataset(works)) {
    const out: GPRTask[] = [];
    pushAggregatedRow(out, "2.05", [...works]);
    return out;
  }

  const filtered = filterWorksForResidentialGprAggregation(works);
  if (filtered.length === 0) return [];

  const out: GPRTask[] = [];
  for (const bucketId of AGGREGATED_GPR_BUCKET_IDS) {
    const children = filtered.filter((t) => gprTaskCodeMatchesBucket(t.code, bucketId));
    pushAggregatedRow(out, bucketId, children);
  }
  return out;
}

/**
 * @deprecated ранее — первые два сегмента шифра; для укрупнения используйте {@link gprTaskCodeMatchesBucket} и ведра.
 */
export function mainProcessGroupKey(code: string): string {
  const parts = code.trim().split(".").filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return parts[0] ?? code.trim();
}

/** @deprecated используйте {@link aggregateToMainProcesses} */
export const aggregateGprTasksByMainProcess = aggregateToMainProcesses;

/** delay = duration_fact − duration_plan (дни, включительно по календарю как durationDays). */
export function aggregatedMainProcessDelayDays(task: GPRTask): number | null {
  if (!isAggregatedMainProcessTask(task)) return null;
  if (!task.factStart?.trim() || !task.factEnd?.trim()) return null;
  const dp = durationDays(task.planStart, task.planEnd);
  const df = durationDays(task.factStart, task.factEnd);
  if (!Number.isFinite(dp) || !Number.isFinite(df)) return null;
  return df - dp;
}

export function aggregatedMainProcessStatus(
  task: GPRTask,
): "нет данных" | "в срок" | "риск" | "отставание" {
  const delay = aggregatedMainProcessDelayDays(task);
  if (delay === null) return "нет данных";
  if (delay <= 0) return "в срок";
  if (delay <= 14) return "риск";
  return "отставание";
}

export function factBarColorForAggregatedMainProcess(task: GPRTask): string | null {
  if (!isAggregatedMainProcessTask(task)) return null;
  const delay = aggregatedMainProcessDelayDays(task);
  if (delay === null) return "rgba(148, 163, 184, 0.5)";
  if (delay <= 0) return "#22c55e";
  if (delay <= 14) return "#f59e0b";
  return "#ef4444";
}

/** Порядок строк на оси Y для укрупнённого режима (по перечню ГПР, не по дате начала). */
export function sortAggregatedMainProcessRows(rows: GPRTask[]): GPRTask[] {
  return [...rows].sort((a, b) => {
    const ia = BUCKET_ORDER_INDEX.get(a.code) ?? -1;
    const ib = BUCKET_ORDER_INDEX.get(b.code) ?? -1;
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    if (a.code === "2.05" && b.code !== "2.05") return 1;
    if (b.code === "2.05" && a.code !== "2.05") return -1;
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });
}
