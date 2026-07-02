import {
  compareGprCodesByNumericPath,
  computeGprStageGroupAverageDurationDeviation,
  formatGprManagementScheduleDeviationDays,
  getCalendarFactProgressPercent,
  getStatusByDeviation,
  gprTaskFactCompletionPercent,
  isGprWorkItemNotStarted,
  matchesGprCodeBranch,
  normalizeGprCodeFinal,
  planFactEndDeviationDays,
  type GPRTask,
} from "@/lib/gprUtils";
import { isGprTaskFactCompleted } from "@/lib/gprStageCompletion";
import { listGprDirectChildWorkCodes } from "@/lib/gprTmcDependency";

/** Сортировка работ в порядке календарного графика ГПР (planStart, затем шифр). */
export function sortGprTasksByCalendarOrder(tasks: GPRTask[]): GPRTask[] {
  return [...tasks].sort((a, b) => {
    const sa = a.planStart?.trim()
      ? new Date(`${a.planStart.trim()}T00:00:00`).getTime()
      : NaN;
    const sb = b.planStart?.trim()
      ? new Date(`${b.planStart.trim()}T00:00:00`).getTime()
      : NaN;
    if (!Number.isFinite(sa) && !Number.isFinite(sb)) {
      return compareGprCodesByNumericPath(a.code, b.code);
    }
    if (!Number.isFinite(sa)) return 1;
    if (!Number.isFinite(sb)) return -1;
    if (sa !== sb) return sa - sb;
    return compareGprCodesByNumericPath(a.code, b.code);
  });
}

function sortWorkCellsByCalendar(cells: GprStageProgressWorkCell[]): GprStageProgressWorkCell[] {
  const order = new Map(
    sortGprTasksByCalendarOrder(cells.map((c) => c.task)).map((t, i) => [
      t.globalTaskId ?? t.id,
      i,
    ]),
  );
  return [...cells].sort(
    (a, b) =>
      (order.get(a.task.globalTaskId ?? a.task.id) ?? 0) -
      (order.get(b.task.globalTaskId ?? b.task.id) ?? 0),
  );
}

/** Статус работы для тепловой матрицы «Прогресс этапа». */
export type GprWorkHeatmapStatus =
  | "completed_ahead"
  | "completed_on_time"
  | "slight_delay"
  | "delay"
  | "critical_delay"
  | "in_progress"
  | "not_started"
  | "excluded";

export const GPR_WORK_HEATMAP_STATUS_ORDER: readonly GprWorkHeatmapStatus[] = [
  "completed_ahead",
  "completed_on_time",
  "slight_delay",
  "delay",
  "critical_delay",
  "in_progress",
  "not_started",
  "excluded",
] as const;

export const GPR_WORK_HEATMAP_META: Record<
  GprWorkHeatmapStatus,
  { label: string; color: string; textColor: string }
> = {
  completed_ahead: {
    label: "Выполнено с опережением",
    color: "#16a34a",
    textColor: "#ecfdf5",
  },
  completed_on_time: {
    label: "Выполнено в срок",
    color: "#22c55e",
    textColor: "#f0fdf4",
  },
  slight_delay: {
    label: "Небольшое отставание",
    color: "#f59e0b",
    textColor: "#fffbeb",
  },
  delay: {
    label: "Отставание",
    color: "#f97316",
    textColor: "#fff7ed",
  },
  critical_delay: {
    label: "Критическое отставание",
    color: "#ef4444",
    textColor: "#fef2f2",
  },
  in_progress: {
    label: "Работа выполняется",
    color: "#06b6d4",
    textColor: "#ecfeff",
  },
  not_started: {
    label: "Не начата",
    color: "#64748b",
    textColor: "#f8fafc",
  },
  excluded: {
    label: "Исключена / отменена",
    color: "#475569",
    textColor: "#e2e8f0",
  },
};

/** Шифр подэтапа WBS (например, `2.05.04`) для работы внутри ветки `branchRoot`. */
export function gprWbsSubStageCode(taskCode: string, branchRoot: string): string | null {
  const c = normalizeGprCodeFinal(taskCode);
  const root = normalizeGprCodeFinal(branchRoot);
  if (!matchesGprCodeBranch(c, root) || c === root) return null;
  const segments = c.split(".").filter(Boolean);
  const rootSegments = root.split(".").filter(Boolean);
  const subStageLen = rootSegments.length + 1;
  if (segments.length < subStageLen) return null;
  return segments.slice(0, subStageLen).join(".");
}

function gprTaskNameByCode(tasks: GPRTask[], code: string): string {
  const norm = normalizeGprCodeFinal(code);
  const row = tasks.find((t) => normalizeGprCodeFinal(t.code) === norm);
  return String(row?.name ?? "").trim();
}

/** Подэтапы WBS уровня xx.xx.xx внутри корневой ветки. */
export function listGprWbsSubStagesForBranch(
  allTasks: GPRTask[],
  branchRoot: string,
): { code: string; name: string }[] {
  const root = normalizeGprCodeFinal(branchRoot);
  const targetLen = root.split(".").filter(Boolean).length + 1;
  const codes = new Set<string>();

  for (const t of allTasks) {
    const c = normalizeGprCodeFinal(t.code);
    if (!matchesGprCodeBranch(c, root)) continue;
    const segs = c.split(".").filter(Boolean);
    if (segs.length === targetLen) codes.add(c);
    const sub = gprWbsSubStageCode(c, root);
    if (sub) codes.add(sub);
  }

  return [...codes]
    .sort(compareGprCodesByNumericPath)
    .map((code) => ({
      code,
      name: gprTaskNameByCode(allTasks, code) || code,
    }));
}

/** Дочерние работы подэтапа (без строки-заголовка подэтапа). */
export function listGprSubStageChildWorks(
  allTasks: GPRTask[],
  subStageCode: string,
  branchRoot: string,
): GPRTask[] {
  const code = normalizeGprCodeFinal(subStageCode);
  return sortGprTasksByCalendarOrder(
    allTasks.filter((t) => {
      const tc = normalizeGprCodeFinal(t.code);
      if (tc === code) return false;
      return gprWbsSubStageCode(tc, branchRoot) === code;
    }),
  );
}

/** Классификация работы для тепловой ячейки по отклонению факта от плана. */
export function resolveGprWorkHeatmapStatus(
  task: GPRTask,
  asOf: Date = new Date(),
): GprWorkHeatmapStatus {
  if (task.missingFromImport) return "excluded";

  if (isGprWorkItemNotStarted(task)) return "not_started";

  const completed = isGprTaskFactCompleted(task, asOf);
  const endDelay = planFactEndDeviationDays(task.planEnd, task.factEnd, asOf);

  if (completed) {
    if (endDelay === null) return "completed_on_time";
    if (endDelay < 0) return "completed_ahead";
    if (endDelay === 0) return "completed_on_time";
    if (getStatusByDeviation(endDelay) === "red") return "critical_delay";
    if (endDelay <= 7) return "slight_delay";
    return "delay";
  }

  if (endDelay !== null && endDelay > 0) {
    if (getStatusByDeviation(endDelay) === "red") return "critical_delay";
    if (endDelay <= 7) return "slight_delay";
    return "delay";
  }

  return "in_progress";
}

/** % выполнения работы для мини-полосы прогресса. */
export function computeGprWorkProgressPercent(task: GPRTask, asOf: Date = new Date()): number {
  if (isGprTaskFactCompleted(task, asOf)) return 100;
  const calendar = getCalendarFactProgressPercent(task, asOf);
  const field = gprTaskFactCompletionPercent(task);
  return Math.round(Math.min(100, Math.max(calendar, field)) * 10) / 10;
}

/** Подпись отклонения / состояния справа от полосы прогресса. */
export function formatGprWorkProgressDeviationLabel(
  task: GPRTask,
  status: GprWorkHeatmapStatus,
  asOf: Date = new Date(),
): string {
  if (status === "excluded") return "Исключена";
  if (status === "not_started") return "Не начата";

  const endDelay = planFactEndDeviationDays(task.planEnd, task.factEnd, asOf);
  if (endDelay !== null && endDelay !== 0) {
    const sign = endDelay > 0 ? "+" : "−";
    return `${sign}${Math.abs(endDelay)} дн.`;
  }
  if (status === "in_progress") return "В работе";
  if (endDelay === 0) return "0 дн.";
  return "—";
}

/** Цвет полосы прогресса по статусу отклонения. */
export function gprWorkProgressBarColor(status: GprWorkHeatmapStatus): string {
  if (status === "completed_ahead" || status === "completed_on_time") {
    return GPR_WORK_HEATMAP_META.completed_on_time.color;
  }
  return GPR_WORK_HEATMAP_META[status].color;
}

export function buildGprStageProgressWorkCell(task: GPRTask, asOf: Date): GprStageProgressWorkCell {
  const status = resolveGprWorkHeatmapStatus(task, asOf);
  return {
    task,
    status,
    progressPercent: computeGprWorkProgressPercent(task, asOf),
    deviationLabel: formatGprWorkProgressDeviationLabel(task, status, asOf),
  };
}

export function isGprWorkCompletedOnTime(task: GPRTask, asOf: Date = new Date()): boolean {
  if (!isGprTaskFactCompleted(task, asOf)) return false;
  const endDelay = planFactEndDeviationDays(task.planEnd, task.factEnd, asOf);
  return endDelay === null || endDelay <= 0;
}

export type GprStageProgressWorkCell = {
  task: GPRTask;
  status: GprWorkHeatmapStatus;
  /** 0..100 — длина заполнения мини-полосы. */
  progressPercent: number;
  /** «+2 дн.», «В работе», «Не начата» и т.д. */
  deviationLabel: string;
};

/** Строка раскрытого этапа: прямая дочерняя работа WBS и её подработы. */
export type GprStageProgressWorkRow = {
  code: string;
  name: string;
  cells: GprStageProgressWorkCell[];
};

export type GprStageProgressStageRow = {
  code: string;
  name: string;
  branchRoot: string;
  works: GprStageProgressWorkCell[];
  workRows: GprStageProgressWorkRow[];
  completionPercent: number;
  completedCount: number;
  totalCount: number;
};

export type GprStageProgressKpiSummary = {
  averageDeviation: number | null;
  averageDeviationDisplay: string;
  criticalCount: number;
  totalWorks: number;
  completedOnTimeCount: number;
};

export type GprStageProgressModel = {
  stages: GprStageProgressStageRow[];
  kpi: GprStageProgressKpiSummary;
  allStageOptions: { code: string; label: string }[];
};

function buildWorkRowsForStage(
  stageWorks: GprStageProgressWorkCell[],
  allTasks: GPRTask[],
  subStageCode: string,
): GprStageProgressWorkRow[] {
  const directCodes = listGprDirectChildWorkCodes(allTasks, subStageCode);
  if (directCodes.length === 0) {
    return sortWorkCellsByCalendar(stageWorks).map((w) => ({
      code: normalizeGprCodeFinal(w.task.code) || w.task.code,
      name: String(w.task.name ?? "").trim() || w.task.code,
      cells: [w],
    }));
  }

  const rows: GprStageProgressWorkRow[] = [];
  const assigned = new Set<string>();

  for (const dc of directCodes) {
    const cells = stageWorks.filter((w) => {
      const c = normalizeGprCodeFinal(w.task.code);
      return c === dc || c.startsWith(`${dc}.`);
    });
    if (cells.length === 0) continue;
    for (const c of cells) assigned.add(c.task.globalTaskId ?? c.task.id);
    rows.push({
      code: dc,
      name: gprTaskNameByCode(allTasks, dc) || dc,
      cells: sortWorkCellsByCalendar(cells),
    });
  }

  const orphans = stageWorks.filter((w) => !assigned.has(w.task.globalTaskId ?? w.task.id));
  for (const w of sortWorkCellsByCalendar(orphans)) {
    rows.push({
      code: normalizeGprCodeFinal(w.task.code) || w.task.code,
      name: String(w.task.name ?? "").trim() || w.task.code,
      cells: [w],
    });
  }

  return rows;
}

function buildStageRows(
  allTasks: GPRTask[],
  branchRoots: readonly string[],
  asOf: Date,
): GprStageProgressStageRow[] {
  const rows: GprStageProgressStageRow[] = [];

  for (const branchRoot of branchRoots) {
    const root = normalizeGprCodeFinal(branchRoot);
    if (!root) continue;

    for (const { code, name } of listGprWbsSubStagesForBranch(allTasks, root)) {
      const childTasks = listGprSubStageChildWorks(allTasks, code, root);
      if (childTasks.length === 0) continue;

      const works: GprStageProgressWorkCell[] = childTasks.map((task) =>
        buildGprStageProgressWorkCell(task, asOf),
      );

      const completedCount = works.filter((w) => isGprTaskFactCompleted(w.task, asOf)).length;
      const totalCount = works.length;
      const completionPercent =
        totalCount > 0 ? Math.round((completedCount / totalCount) * 1000) / 10 : 0;

      rows.push({
        code,
        name,
        branchRoot: root,
        works,
        workRows: buildWorkRowsForStage(works, allTasks, code),
        completionPercent,
        completedCount,
        totalCount,
      });
    }
  }

  return rows.sort((a, b) => compareGprCodesByNumericPath(a.code, b.code));
}

function buildKpiSummary(works: GprStageProgressWorkCell[], asOf: Date): GprStageProgressKpiSummary {
  const tasks = works.map((w) => w.task);
  const durationStats = computeGprStageGroupAverageDurationDeviation(tasks);

  const criticalCount = works.filter((w) => w.status === "critical_delay").length;
  const completedOnTimeCount = works.filter((w) => isGprWorkCompletedOnTime(w.task, asOf)).length;

  return {
    averageDeviation: durationStats.averageDeviation,
    averageDeviationDisplay:
      durationStats.averageDeviation === null
        ? "—"
        : formatGprManagementScheduleDeviationDays(durationStats.averageDeviation, {
            decimals: true,
          }),
    criticalCount,
    totalWorks: works.length,
    completedOnTimeCount,
  };
}

/** Модель блока «Прогресс этапа» по данным календарного ГПР. */
export function buildGprStageProgressModel(
  allTasks: GPRTask[],
  branchRoots: readonly string[],
  asOf: Date,
  selectedStageCodes?: readonly string[] | null,
): GprStageProgressModel {
  const allStages = buildStageRows(allTasks, branchRoots, asOf);
  const selected = selectedStageCodes?.filter(Boolean) ?? [];
  const stages =
    selected.length > 0
      ? allStages.filter((s) => selected.includes(s.code))
      : allStages;

  const flatWorks = stages.flatMap((s) => s.works);
  const kpi = buildKpiSummary(flatWorks, asOf);

  const allStageOptions = allStages.map((s) => ({
    code: s.code,
    label: s.name && s.name !== s.code ? `${s.code} ${s.name}` : s.code,
  }));

  return { stages, kpi, allStageOptions };
}
