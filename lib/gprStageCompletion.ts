import {
  compareGprCodesByNumericPath,
  getCalendarFactProgressPercent,
  getPlannedProgressPercent,
  gprTaskFactCompletionPercent,
  matchesGprCodeBranch,
  normalizeGprCodeFinal,
  partIdToProjectPartKey,
  type GPRTask,
  type ProjectPartKey,
} from "@/lib/gprUtils";

export type GprStageCompletionSource = "leaf_rollup" | "descendant_rollup" | "root_field";

export type GprStageCompletionInsight = {
  /** Факт % для отображения (0–100). */
  factPercent: number;
  /** Плановый % на дату отчёта по корневой работе. */
  planPercent: number | null;
  source: GprStageCompletionSource;
  /** Работы, участвующие в расчёте (листья WBS или дочерние). */
  workTotal: number;
  workCompleted: number;
  workInProgress: number;
  workWithFactDates: number;
  tooltipText: string;
};

/** Нет фактических данных для KPI «Факт выполнения» (как в карточке этапа). */
export function isGprStageFactCompletionNoData(
  insight: Pick<
    GprStageCompletionInsight,
    "factPercent" | "workInProgress" | "workCompleted" | "workWithFactDates"
  >,
): boolean {
  const progressClamped = Math.max(0, Math.min(100, Math.round(insight.factPercent * 10) / 10));
  return (
    progressClamped === 0 &&
    insight.workInProgress === 0 &&
    insight.workCompleted === 0 &&
    insight.workWithFactDates === 0
  );
}

/** Формат числа «Факт выполнения» (левая часть «20,4% из …» в KPI-карточке). */
export function formatGprStageFactPercentValue(factPercent: number): string {
  const progressClamped = Math.max(0, Math.min(100, Math.round(factPercent * 10) / 10));
  if (Math.abs(progressClamped - Math.round(progressClamped)) < 1e-6) {
    return `${Math.round(progressClamped)}%`;
  }
  return `${progressClamped.toFixed(1)}%`;
}

/** Подпись «Факт выполнения» для KPI и диаграммы «Динамика выполнения ГПР». */
export function formatGprStageKpiFactDisplay(insight: GprStageCompletionInsight): string {
  if (isGprStageFactCompletionNoData(insight)) return "—";
  return formatGprStageFactPercentValue(insight.factPercent);
}

export type GprStageCompletionDiagnosticTask = {
  code: string;
  name: string;
  planEnd: string | null;
};

export type GprStageCompletionDiagnostic = {
  rootCode: string;
  source: GprStageCompletionSource;
  totalTasks: number;
  completedTasks: number;
  plannedCompletedTasks: number;
  factPercent: number;
  planPercent: number | null;
  plannedCompletedTaskList: GprStageCompletionDiagnosticTask[];
};

export type GprStageKpiTaskDiagnosticRow = {
  code: string;
  name: string;
  isLeaf: boolean;
  partId: number;
  projectPartKey: ProjectPartKey;
};

export type GprStage205KpiDiagnostic = {
  rootCode: string;
  source: GprStageCompletionSource;
  totalTasks: number;
  completedTasks: number;
  allRowsUnder205: number;
  leafRowsUnder205: number;
  rowsUsedInKpi: number;
  kpiTaskRows: GprStageKpiTaskDiagnosticRow[];
  rowsUsedInKpiCodes: string[];
};

function roundProgress(n: number): number {
  return Math.round(n * 10) / 10;
}

function tasksUnderRootCode(tasks: GPRTask[], rootCode: string): GPRTask[] {
  const root = normalizeGprCodeFinal(rootCode);
  if (!root) return [];
  return tasks.filter((t) => {
    const c = normalizeGprCodeFinal(t.code);
    return c.startsWith(`${root}.`);
  });
}

function isLeafAmong(task: GPRTask, group: GPRTask[]): boolean {
  const nc = normalizeGprCodeFinal(task.code);
  return !group.some((t) => {
    const oc = normalizeGprCodeFinal(t.code);
    return oc !== nc && oc.startsWith(`${nc}.`);
  });
}

export function isGprTaskFactCompleted(task: GPRTask): boolean {
  return Boolean(task.factEnd?.trim()) || gprTaskFactCompletionPercent(task) >= 100;
}

export function isGprTaskPlanCompleteByDate(task: GPRTask, asOf: Date): boolean {
  const plan = getPlannedProgressPercent(task, asOf);
  return plan !== null && plan >= 100;
}

/** План % по набору работ: среднее календарных planPercent по всем работам. */
export function computeGprTasksPlanCompletionPercent(items: GPRTask[], asOf: Date): number | null {
  if (items.length === 0) return null;
  let sum = 0;
  for (const t of items) {
    sum += getPlannedProgressPercent(t, asOf) ?? 0;
  }
  return roundProgress(sum / items.length);
}

/** Факт % по набору работ: среднее календарных factPercent по всем работам. */
export function computeGprTasksFactCompletionPercent(items: GPRTask[], asOf: Date = new Date()): number | null {
  if (items.length === 0) return null;
  let sum = 0;
  for (const t of items) {
    sum += getCalendarFactProgressPercent(t, asOf);
  }
  return roundProgress(sum / items.length);
}

/** Отклонение готовности: факт − план (п.п.), календарный метод по средним работ. */
export function computeGprTasksCompletionDeviation(items: GPRTask[], asOf: Date): number | null {
  const fact = computeGprTasksFactCompletionPercent(items, asOf);
  const plan = computeGprTasksPlanCompletionPercent(items, asOf);
  if (fact === null || plan === null) return null;
  return roundProgress(fact - plan);
}

function classifyWorkPhase(task: GPRTask): "completed" | "in_progress" | "not_started" {
  if (isGprTaskFactCompleted(task)) return "completed";
  if (task.factStart?.trim() || gprTaskFactCompletionPercent(task) > 0) return "in_progress";
  return "not_started";
}

function countWorkStats(items: GPRTask[]): {
  workTotal: number;
  workCompleted: number;
  workInProgress: number;
  workWithFactDates: number;
} {
  let workCompleted = 0;
  let workInProgress = 0;
  let workWithFactDates = 0;
  for (const t of items) {
    const phase = classifyWorkPhase(t);
    if (phase === "completed") workCompleted += 1;
    if (phase === "in_progress") workInProgress += 1;
    if (t.factStart?.trim() || t.factEnd?.trim()) workWithFactDates += 1;
  }
  return {
    workTotal: items.length,
    workCompleted,
    workInProgress,
    workWithFactDates,
  };
}

function buildTooltip(
  insight: Omit<GprStageCompletionInsight, "tooltipText">,
  rootCode: string,
): string {
  const lines: string[] = ["Расчёт:"];
  if (insight.source === "root_field") {
    lines.push(`Календарный метод по корневой работе ${rootCode} (дочерние работы в данных отсутствуют).`);
  } else if (insight.source === "leaf_rollup") {
    lines.push("Факт и план — среднее календарных % по листьям WBS этапа.");
  } else {
    lines.push("Факт и план — среднее календарных % по дочерним работам этапа.");
  }
  lines.push(
    "План работы: (дата отчёта − planStart) / (planEnd − planStart), ограничение 0..100%.",
  );
  lines.push(
    "Факт работы: (дата отчёта − factStart) / (planEnd − planStart); при factEnd — 100%; без factStart — 0%.",
  );
  if (insight.workTotal > 0) {
    lines.push(
      `Выполнено: ${insight.workCompleted} из ${insight.workTotal} работ` +
        (insight.workInProgress > 0 ? ` · в работе: ${insight.workInProgress}` : "") +
        (insight.workWithFactDates > 0 ? ` · с факт. датами: ${insight.workWithFactDates}` : ""),
    );
  }
  const planPart =
    insight.planPercent === null ? "План: —" : `План: ${insight.planPercent}%`;
  lines.push(`Факт: ${insight.factPercent}% · ${planPart}`);
  lines.push("Отклонение = факт − план.");
  lines.push("Источник данных: импорт ГПР (отчёт Primavera / CSV)");
  return lines.join("\n");
}

/**
 * Факт выполнения этапа ГПР: среднее календарных % по дочерним/листовым работам, иначе по корню.
 * Единая модель для карточек этапов, «Выполнение ГПР» и графиков «Факт ГПР».
 */
export function computeGprStageCompletionInsight(
  allTasks: GPRTask[],
  rootTask: GPRTask,
  asOf: Date = new Date(),
): GprStageCompletionInsight {
  const descendants = tasksUnderRootCode(allTasks, rootTask.code);
  const leaves = descendants.filter((t) => isLeafAmong(t, descendants));

  let source: GprStageCompletionSource;
  let statsSet: GPRTask[];

  if (leaves.length > 0) {
    source = "leaf_rollup";
    statsSet = leaves;
  } else if (descendants.length > 0) {
    source = "descendant_rollup";
    statsSet = descendants;
  } else {
    source = "root_field";
    statsSet = [rootTask];
  }

  const factPercent =
    computeGprTasksFactCompletionPercent(statsSet, asOf) ?? getCalendarFactProgressPercent(rootTask, asOf);
  const planPercent = computeGprTasksPlanCompletionPercent(statsSet, asOf);
  const stats = countWorkStats(statsSet);
  const partial = {
    factPercent,
    planPercent,
    source,
    ...stats,
  };
  return {
    ...partial,
    tooltipText: buildTooltip(partial, normalizeGprCodeFinal(rootTask.code) || rootTask.code),
  };
}

/** Набор работ этапа — тот же, что для rollup % и счётчиков выполнения. */
export function getGprStageWorkItems(allTasks: GPRTask[], rootTask: GPRTask): GPRTask[] {
  const descendants = tasksUnderRootCode(allTasks, rootTask.code);
  const leaves = descendants.filter((t) => isLeafAmong(t, descendants));
  if (leaves.length > 0) return leaves;
  if (descendants.length > 0) return descendants;
  return [rootTask];
}

/** Диагностика расчёта готовности этапа: счётчики и список задач с наступившим плановым окончанием. */
export function buildGprStageCompletionDiagnostic(
  allTasks: GPRTask[],
  rootTask: GPRTask,
  asOf: Date = new Date(),
): GprStageCompletionDiagnostic {
  const workItems = getGprStageWorkItems(allTasks, rootTask);
  const completedItems = workItems.filter(isGprTaskFactCompleted);
  const plannedCompleteItems = workItems.filter((t) => isGprTaskPlanCompleteByDate(t, asOf));

  const descendants = tasksUnderRootCode(allTasks, rootTask.code);
  const leaves = descendants.filter((t) => isLeafAmong(t, descendants));
  let source: GprStageCompletionSource;
  if (leaves.length > 0) source = "leaf_rollup";
  else if (descendants.length > 0) source = "descendant_rollup";
  else source = "root_field";

  const plannedCompletedTaskList = plannedCompleteItems
    .map((t) => ({
      code: normalizeGprCodeFinal(t.code) || t.code,
      name: String(t.name ?? "").trim() || "—",
      planEnd: t.planEnd?.trim() || null,
    }))
    .sort((a, b) => compareGprCodesByNumericPath(a.code, b.code));

  return {
    rootCode: normalizeGprCodeFinal(rootTask.code) || rootTask.code,
    source,
    totalTasks: workItems.length,
    completedTasks: completedItems.length,
    plannedCompletedTasks: plannedCompleteItems.length,
    factPercent: computeGprTasksFactCompletionPercent(workItems, asOf) ?? 0,
    planPercent: computeGprTasksPlanCompletionPercent(workItems, asOf),
    plannedCompletedTaskList,
  };
}

/**
 * Диагностика KPI этапа 2.05: все строки ветки, листья, набор для rollup и детализация по задачам.
 */
export function buildGprStage205KpiDiagnostic(
  allTasks: GPRTask[],
  rootTask: GPRTask,
): GprStage205KpiDiagnostic {
  const rootCode = normalizeGprCodeFinal(rootTask.code) || rootTask.code;
  const allRows = allTasks.filter((t) => matchesGprCodeBranch(t.code, rootCode));
  const leafRows = allRows.filter((t) => isLeafAmong(t, allRows));
  const rowsUsedInKpi = getGprStageWorkItems(allTasks, rootTask);
  const completedItems = rowsUsedInKpi.filter(isGprTaskFactCompleted);

  const descendants = tasksUnderRootCode(allTasks, rootTask.code);
  const leaves = descendants.filter((t) => isLeafAmong(t, descendants));
  let source: GprStageCompletionSource;
  if (leaves.length > 0) source = "leaf_rollup";
  else if (descendants.length > 0) source = "descendant_rollup";
  else source = "root_field";

  const kpiTaskRows = rowsUsedInKpi
    .map((t) => ({
      code: normalizeGprCodeFinal(t.code) || t.code,
      name: String(t.name ?? "").trim() || "—",
      isLeaf: isLeafAmong(t, allRows),
      partId: t.partId,
      projectPartKey: t.projectPartKey ?? partIdToProjectPartKey(t.partId),
    }))
    .sort((a, b) => compareGprCodesByNumericPath(a.code, b.code));

  return {
    rootCode,
    source,
    totalTasks: rowsUsedInKpi.length,
    completedTasks: completedItems.length,
    allRowsUnder205: allRows.length,
    leafRowsUnder205: leafRows.length,
    rowsUsedInKpi: rowsUsedInKpi.length,
    kpiTaskRows,
    rowsUsedInKpiCodes: kpiTaskRows.map((r) => r.code),
  };
}

/** Форматированный вывод диагностики KPI этапа 2.05 в консоль браузера. */
export function logGprStage205KpiDiagnosticToConsole(d: GprStage205KpiDiagnostic): void {
  console.info(
    [
      "[2.05 KPI]",
      `totalTasks: ${d.totalTasks}`,
      `completedTasks: ${d.completedTasks}`,
      `allRowsUnder205: ${d.allRowsUnder205}`,
      `leafRowsUnder205: ${d.leafRowsUnder205}`,
      `rowsUsedInKpi: ${d.rowsUsedInKpi}`,
      `source: ${d.source}`,
      `rowsUsedInKpiCodes: ${d.rowsUsedInKpiCodes.join(", ") || "—"}`,
    ].join("\n"),
  );
  console.info("[2.05 KPI] tasks in KPI calculation (code, name, isLeaf, partId, projectPartKey):", d.kpiTaskRows);
  if (d.kpiTaskRows.length > 0) {
    console.table(d.kpiTaskRows);
  }
}

/** Краткий API: факт % этапа (rollup или корень). */
export function computeGprStageFactCompletionPercent(
  allTasks: GPRTask[],
  rootTask: GPRTask,
  asOf: Date = new Date(),
): number {
  return computeGprStageCompletionInsight(allTasks, rootTask, asOf).factPercent;
}

/** Для оси графика — целое из того же rollup. */
export function computeGprStageFactCompletionChartPercent(
  allTasks: GPRTask[],
  rootTask: GPRTask,
  asOf: Date = new Date(),
): number {
  return Math.round(computeGprStageFactCompletionPercent(allTasks, rootTask, asOf));
}
