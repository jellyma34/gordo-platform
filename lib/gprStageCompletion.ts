import {
  getPlannedProgressPercent,
  gprTaskFactCompletionPercent,
  normalizeGprCodeFinal,
  durationDays,
  type GPRTask,
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

function roundProgress(n: number): number {
  return Math.round(n * 10) / 10;
}

function rollupWeight(task: GPRTask): number {
  const vol = task.plannedWorkVolume;
  if (typeof vol === "number" && Number.isFinite(vol) && vol > 0) return vol;
  const rub = task.contractValue;
  if (typeof rub === "number" && Number.isFinite(rub) && rub > 0) return rub;
  const planD = durationDays(task.planStart, task.planEnd);
  if (planD !== null && planD > 0) return planD;
  return 0;
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

function classifyWorkPhase(task: GPRTask): "completed" | "in_progress" | "not_started" {
  const c = gprTaskFactCompletionPercent(task);
  if (task.factEnd?.trim() || c >= 100) return "completed";
  if (task.factStart?.trim() || c > 0) return "in_progress";
  return "not_started";
}

function weightedFactPercent(items: GPRTask[]): number | null {
  if (items.length === 0) return null;
  let raws = items.map((t) => rollupWeight(t));
  const allZero = raws.every((w) => !Number.isFinite(w) || w <= 0);
  if (allZero) {
    raws = items.map(() => 1);
  } else {
    raws = raws.map((w) => (Number.isFinite(w) && w > 0 ? w : 1));
  }
  const sumRaw = raws.reduce((a, b) => a + b, 0);
  if (sumRaw <= 0) return null;
  const weighted = items.reduce(
    (acc, t, i) => acc + ((raws[i] ?? 0) / sumRaw) * gprTaskFactCompletionPercent(t),
    0,
  );
  return roundProgress(weighted);
}

function weightedPlanPercent(items: GPRTask[], asOf: Date): number | null {
  if (items.length === 0) return null;
  let raws = items.map((t) => rollupWeight(t));
  const allZero = raws.every((w) => !Number.isFinite(w) || w <= 0);
  if (allZero) {
    raws = items.map(() => 1);
  } else {
    raws = raws.map((w) => (Number.isFinite(w) && w > 0 ? w : 1));
  }
  const sumRaw = raws.reduce((a, b) => a + b, 0);
  if (sumRaw <= 0) return null;
  let weighted = 0;
  let usedWeight = 0;
  for (let i = 0; i < items.length; i += 1) {
    const plan = getPlannedProgressPercent(items[i]!, asOf);
    if (plan === null) continue;
    const w = (raws[i] ?? 0) / sumRaw;
    weighted += w * plan;
    usedWeight += w;
  }
  if (usedWeight <= 0) return null;
  return roundProgress(weighted / usedWeight);
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
    lines.push(`% выполнения корневой работы ${rootCode} (дочерние работы в данных отсутствуют).`);
  } else if (insight.source === "leaf_rollup") {
    lines.push(
      "Взвешенное выполнение листьев WBS этапа (объём → стоимость → длительность плана; при отсутствии — равномерно).",
    );
  } else {
    lines.push(
      "Взвешенное выполнение дочерних работ этапа (объём → стоимость → длительность плана).",
    );
  }
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
  lines.push("Источник данных: импорт ГПР (отчёт Primavera / CSV)");
  return lines.join("\n");
}

/**
 * Факт выполнения этапа ГПР: rollup по дочерним/листовым работам, иначе поле completion корня.
 * Единая модель для карточек этапов, «Выполнение ГПР» и графиков «Факт ГПР».
 */
export function computeGprStageCompletionInsight(
  allTasks: GPRTask[],
  rootTask: GPRTask,
  asOf: Date = new Date(),
): GprStageCompletionInsight {
  const descendants = tasksUnderRootCode(allTasks, rootTask.code);
  const leaves = descendants.filter((t) => isLeafAmong(t, descendants));

  let factPercent: number;
  let source: GprStageCompletionSource;
  let statsSet: GPRTask[];

  if (leaves.length > 0) {
    factPercent = weightedFactPercent(leaves) ?? gprTaskFactCompletionPercent(rootTask);
    source = "leaf_rollup";
    statsSet = leaves;
  } else if (descendants.length > 0) {
    factPercent = weightedFactPercent(descendants) ?? gprTaskFactCompletionPercent(rootTask);
    source = "descendant_rollup";
    statsSet = descendants;
  } else {
    factPercent = gprTaskFactCompletionPercent(rootTask);
    source = "root_field";
    statsSet = [rootTask];
  }

  const planPercent =
    source === "leaf_rollup"
      ? weightedPlanPercent(leaves, asOf)
      : source === "descendant_rollup"
        ? weightedPlanPercent(descendants, asOf)
        : getPlannedProgressPercent(rootTask, asOf);
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
