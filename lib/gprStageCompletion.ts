import {
  compareGprCodesByNumericPath,
  getCalendarFactProgressPercent,
  getPlannedProgressPercent,
  gprCodeSegmentCount,
  gprTaskFactCompletionPercent,
  gprWbsLevelFromCode,
  getStatusByDeviation,
  isGprWorkItemNotStarted,
  matchesGprCodeBranch,
  normalizeGprCodeFinal,
  parseDateSafe,
  partIdToProjectPartKey,
  planFactEndDeviationDays,
  sortGprTasksByCsvArticleNumber,
  type GPRTask,
  type ProjectPartKey,
} from "@/lib/gprUtils";

export type GprStageCompletionSource =
  | "csv_article_rollup"
  | "leaf_rollup"
  | "descendant_rollup"
  | "root_field";

export type GprStageCompletionInsight = {
  /** Факт % для отображения (0–100). */
  factPercent: number;
  /** Плановый % на дату отчёта по корневой работе. */
  planPercent: number | null;
  source: GprStageCompletionSource;
  /** Работы CSV («№ статей»), участвующие в расчёте KPI этапа. */
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

/** Подпись «План выполнения» для KPI и диаграммы «Динамика выполнения ГПР» (режим «Упрощённо»). */
export function formatGprStageKpiPlanDisplay(planPercent: number | null): string {
  if (planPercent === null) return "—";
  return formatGprStageFactPercentValue(planPercent);
}

export type GprStageCompletionDiagnosticTask = {
  code: string;
  name: string;
  planEnd: string | null;
  articleNumber: number | null;
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

/** Шифр «Монолитные конструкции» — в KPI одна работа; разбиение на этажи только на диаграмме. */
export const GPR_MONOLITH_KPI_STAGE_CODE = "2.05.04.2";

export function isGprMonolithKpiStageCode(code: string | null | undefined): boolean {
  return normalizeGprCodeFinal(code ?? "") === GPR_MONOLITH_KPI_STAGE_CODE;
}

export function findGprMonolithStageTask(allTasks: GPRTask[]): GPRTask | null {
  return allTasks.find((t) => isGprMonolithKpiStageCode(t.code)) ?? null;
}

function isUnderMonolithKpiBranch(code: string, monolithCode: string): boolean {
  const c = normalizeGprCodeFinal(code);
  const root = normalizeGprCodeFinal(monolithCode);
  if (!root) return false;
  return c === root || c.startsWith(`${root}.`);
}

/** Строка CSV с порядковым номером работы («№ статей») — для plan/fact и legacy CSV. */
export function isGprCsvArticleWork(task: GPRTask): boolean {
  const n = task.articleNumber;
  return n != null && Number.isFinite(n) && n > 0;
}

/**
 * KPI-работа по полям API/PostgreSQL (code, level, part_id): лист WBS, не группирующий узел.
 * Глубокие работы (2.05.04.02) и короткие ветки (2.06.01 на parking).
 */
export function isGprKpiWorkItem(task: GPRTask, allTasks: GPRTask[]): boolean {
  if (task.missingFromImport) return false;

  const code = normalizeGprCodeFinal(task.code);
  if (!code || !/^2\.\d+(?:\.\d+)*$/.test(code)) return false;
  if (!isLeafAmong(task, allTasks)) return false;

  const wbsLevel = gprWbsLevelFromCode(task.code, task.level);
  const segCount = gprCodeSegmentCount(task.code);

  if (wbsLevel >= 3 || segCount >= 4) return true;
  if (wbsLevel >= 2 && segCount >= 3) return true;

  return false;
}

/**
 * KPI: если в наборе работ несколько строк ветки 2.05.04.2 (этажи WBS),
 * считаем одной работой «Монолитные конструкции».
 * @deprecated Только для визуальной диаграммы; KPI использует {@link isGprCsvArticleWork}.
 */
export function collapseMonolithBranchForKpi(allTasks: GPRTask[], workItems: GPRTask[]): GPRTask[] {
  const monolith = findGprMonolithStageTask(allTasks);
  if (!monolith) return workItems;

  const root = normalizeGprCodeFinal(monolith.code);
  const branchItems = workItems.filter((t) => isUnderMonolithKpiBranch(t.code, root));
  if (branchItems.length <= 1) return workItems;

  const withoutBranch = workItems.filter((t) => !isUnderMonolithKpiBranch(t.code, root));
  if (!withoutBranch.some((t) => normalizeGprCodeFinal(t.code) === root)) {
    withoutBranch.push(monolith);
  }
  return withoutBranch;
}

/**
 * Задачи для аналитики KPI: листья WBS с глубиной работ (без группирующих узлов 2.04 / 2.05).
 * Не использует articleNumber — только code, level и структуру дерева.
 */
export function filterGprTasksForKpiAnalytics(tasks: GPRTask[]): GPRTask[] {
  return tasks.filter((t) => isGprKpiWorkItem(t, tasks));
}

export function isGprTaskProgressPercent100(task: GPRTask, asOf: Date = new Date()): boolean {
  if (gprTaskFactCompletionPercent(task) >= 100) return true;
  if (getCalendarFactProgressPercent(task, asOf) >= 100) return true;
  return false;
}

/**
 * Завершена для KPI «Выполнение»:
 * factEnd, поле completion ≥ 100%, либо календарный факт ≥ 100% при наличии factStart.
 */
export function isGprTaskFactCompleted(task: GPRTask, asOf: Date = new Date()): boolean {
  if (Boolean(task.factEnd?.trim())) return true;
  if (gprTaskFactCompletionPercent(task) >= 100) return true;
  if (task.factStart?.trim() && getCalendarFactProgressPercent(task, asOf) >= 100) return true;
  return false;
}

export function isGprTaskPlanCompleteByDate(task: GPRTask, asOf: Date): boolean {
  const plan = getPlannedProgressPercent(task, asOf);
  return plan !== null && plan >= 100;
}

/**
 * Бизнес-классификация работы для donut KPI «Строительство зданий и сооружений».
 * Каждая работа — ровно в одной категории; сумма всех = workTotal этапа.
 */
export type GprBusinessStatusKey =
  | "completed"
  | "in_progress"
  | "late"
  | "overdue"
  | "not_started";

export function gprStageWorkItemBusinessStatus(
  task: GPRTask,
  asOf: Date = new Date(),
): GprBusinessStatusKey {
  if (isGprWorkItemNotStarted(task)) return "not_started";

  const completed = isGprTaskFactCompleted(task, asOf);
  const endDelay = planFactEndDeviationDays(task.planEnd, task.factEnd, asOf);
  if (completed && endDelay !== null && endDelay > 0) return "late";
  if (!completed && endDelay !== null && endDelay > 0) return "overdue";
  if (completed) return "completed";
  return "in_progress";
}

/** Плановая дата начала работы наступила или прошла на дату отчёта. */
export function isGprWorkPlanStartDue(task: GPRTask, asOf: Date): boolean {
  const planStart = parseDateSafe(task.planStart);
  if (!planStart) return false;
  const asOfYmd = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}-${String(asOf.getDate()).padStart(2, "0")}`;
  return planStart <= asOfYmd;
}

export type GprStageNotStartedOnTimeKpi = {
  workTotal: number;
  workCompleted: number;
  workUncompleted: number;
  shouldHaveStartedCount: number;
  notStartedOnTimeCount: number;
  displayNumerator: number;
  displayDenominator: number;
};

/**
 * KPI «Не начаты в срок» для карточки 2.05:
 * числитель — невыполненные работы с наступившим planStart и статусом «Не начато»;
 * знаменатель — все невыполненные работы этапа.
 */
export function computeGprStageNotStartedOnTimeKpi(
  workItems: GPRTask[],
  asOf: Date = new Date(),
): GprStageNotStartedOnTimeKpi {
  let workCompleted = 0;
  let workUncompleted = 0;
  let shouldHaveStartedCount = 0;
  let notStartedOnTimeCount = 0;

  for (const task of workItems) {
    if (isGprWorkPlanStartDue(task, asOf)) {
      shouldHaveStartedCount += 1;
    }

    if (isGprTaskFactCompleted(task, asOf)) {
      workCompleted += 1;
      continue;
    }

    workUncompleted += 1;

    if (isGprWorkPlanStartDue(task, asOf) && isGprWorkItemNotStarted(task)) {
      notStartedOnTimeCount += 1;
    }
  }

  return {
    workTotal: workItems.length,
    workCompleted,
    workUncompleted,
    shouldHaveStartedCount,
    notStartedOnTimeCount,
    displayNumerator: notStartedOnTimeCount,
    displayDenominator: workUncompleted,
  };
}

export function formatGprStageNotStartedOnTimeKpiDisplay(kpi: GprStageNotStartedOnTimeKpi): string {
  return `${kpi.displayNumerator} из ${kpi.displayDenominator}`;
}

/** Диагностика KPI «Не начаты в срок» (dev). */
export function logGprStageNotStartedOnTimeKpiToConsole(input: {
  scopeLabel: string;
  kpi: GprStageNotStartedOnTimeKpi;
}): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;

  const k = input.kpi;
  console.log("=== NOT STARTED KPI ===");
  console.log(`Объект: ${input.scopeLabel}`);
  console.log("Всего работ:", k.workTotal);
  console.log("Выполнено:", k.workCompleted);
  console.log("Невыполнено:", k.workUncompleted);
  console.log("Должны были начаться:", k.shouldHaveStartedCount);
  console.log("Не начаты вовремя:", k.notStartedOnTimeCount);
  console.log("Отображается:", formatGprStageNotStartedOnTimeKpiDisplay(k));
}

export type GprKpiDonutStatusKey =
  | "on_time"
  | "risk"
  | "overdue"
  | "completed_late"
  | "not_started";

export type GprKpiTrafficStatusKey = "green" | "yellow" | "red" | "gray";

/** Donut-категория работы (тот же алгоритм, что у карточки этапа 2.05). */
export function gprKpiWorkItemDonutStatus(
  task: GPRTask,
  asOf: Date = new Date(),
): GprKpiDonutStatusKey {
  if (isGprWorkItemNotStarted(task)) return "not_started";
  if (!task.planStart?.trim() || !task.planEnd?.trim()) return "not_started";

  if (isGprTaskFactCompleted(task, asOf)) {
    const endDelay = planFactEndDeviationDays(task.planEnd, task.factEnd, asOf);
    if (endDelay === null) return "not_started";
    if (endDelay > 0) return "completed_late";
    return "on_time";
  }

  const endDelay = planFactEndDeviationDays(task.planEnd, task.factEnd, asOf);
  if (endDelay === null) return "not_started";
  const st = getStatusByDeviation(endDelay);
  if (st === "green") return "on_time";
  if (st === "yellow") return "risk";
  return "overdue";
}

/** Светофор отклонения по работе (тот же алгоритм, что у карточки этапа). */
export function gprKpiWorkItemTrafficStatus(
  task: GPRTask,
  asOf: Date = new Date(),
): GprKpiTrafficStatusKey {
  if (!task.planStart?.trim() || !task.planEnd?.trim()) return "gray";
  const endDelay = planFactEndDeviationDays(task.planEnd, task.factEnd, asOf);
  if (endDelay === null) return "gray";
  return getStatusByDeviation(endDelay);
}

export type GprKpiArticleWorksBreakdown = {
  completedStages: number;
  totalStages: number;
  onTimeCount: number;
  atRiskCount: number;
  overdueCount: number;
  notStartedCount: number;
  completedSharePct: number;
  donutOnTimeCount: number;
  donutRiskCount: number;
  donutOverdueCount: number;
  donutCompletedLateCount: number;
  donutNotStartedCount: number;
  businessCompletedCount: number;
  businessInProgressCount: number;
  businessLateCount: number;
  businessOverdueCount: number;
  businessNotStartedCount: number;
  problematicSharePct: number;
};

/**
 * KPI по набору работ CSV («№ статей») — единый алгоритм для этапа 2.05 и агрегата «Проект».
 */
export function computeGprKpiArticleWorksBreakdown(
  workItems: GPRTask[],
  asOf: Date = new Date(),
): GprKpiArticleWorksBreakdown {
  const trafficCounts = { green: 0, yellow: 0, red: 0, gray: 0 };
  const donutCounts = {
    on_time: 0,
    risk: 0,
    overdue: 0,
    completed_late: 0,
    not_started: 0,
  };
  const businessCounts = {
    completed: 0,
    in_progress: 0,
    late: 0,
    overdue: 0,
    not_started: 0,
  };
  let completedStages = 0;

  for (const task of workItems) {
    if (isGprTaskFactCompleted(task, asOf)) completedStages += 1;
    const traffic = gprKpiWorkItemTrafficStatus(task, asOf);
    trafficCounts[traffic] += 1;
    donutCounts[gprKpiWorkItemDonutStatus(task, asOf)] += 1;
    businessCounts[gprStageWorkItemBusinessStatus(task, asOf)] += 1;
  }

  const totalStages = workItems.length;
  const problematic =
    donutCounts.risk + donutCounts.overdue + donutCounts.completed_late;
  const withStatus =
    donutCounts.on_time +
    donutCounts.risk +
    donutCounts.overdue +
    donutCounts.completed_late;

  return {
    completedStages,
    totalStages,
    onTimeCount: trafficCounts.green,
    atRiskCount: trafficCounts.yellow,
    overdueCount: trafficCounts.red,
    notStartedCount: trafficCounts.gray,
    completedSharePct:
      totalStages > 0 ? Math.round((completedStages / totalStages) * 1000) / 10 : 0,
    donutOnTimeCount: donutCounts.on_time,
    donutRiskCount: donutCounts.risk,
    donutOverdueCount: donutCounts.overdue,
    donutCompletedLateCount: donutCounts.completed_late,
    donutNotStartedCount: donutCounts.not_started,
    businessCompletedCount: businessCounts.completed,
    businessInProgressCount: businessCounts.in_progress,
    businessLateCount: businessCounts.late,
    businessOverdueCount: businessCounts.overdue,
    businessNotStartedCount: businessCounts.not_started,
    problematicSharePct:
      withStatus > 0 ? Math.round((problematic / withStatus) * 1000) / 10 : 0,
  };
}

/** Все KPI-работы проекта: строки CSV с «№ статей» (без WBS-разделов и групп). */
export function collectGprProjectKpiArticleWorks(projectScopedTasks: GPRTask[]): GPRTask[] {
  return filterGprTasksForKpiAnalytics(projectScopedTasks);
}

/** Диагностика KPI карточки «Проект» (dev). */
export function logGprProjectKpiValidationToConsole(input: {
  workTotal: number;
  workCompleted: number;
  completedOnTime: number;
  completedLate: number;
  notStarted: number;
  completionPct: number;
  factPercent: number | null;
  planPercent: number | null;
  deviationPp: number | null;
  dataSource: string;
  algorithmMatches205: boolean;
}): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;

  console.group("Project KPI validation");
  console.log("Всего работ:", input.workTotal);
  console.log("Выполнено:", input.workCompleted);
  console.log("В срок:", input.completedOnTime);
  console.log("С опозданием:", input.completedLate);
  console.log("Не начато:", input.notStarted);
  console.log("Процент выполнения:", `${input.completionPct}%`);
  if (input.factPercent !== null) {
    console.log("Фактическая готовность:", `${input.factPercent}%`);
  }
  if (input.planPercent !== null) {
    console.log("Плановая готовность:", `${input.planPercent}%`);
  }
  if (input.deviationPp !== null) {
    console.log("Отклонение готовности:", `${input.deviationPp}%`);
  }
  console.log("Источник данных:", input.dataSource);
  console.log(
    "Алгоритм совпадает с карточкой 2.05:",
    input.algorithmMatches205 ? "YES" : "NO",
  );
  console.groupEnd();
}

export type GprParkingStageValidationRow = {
  rootCode: string;
  workTotal: number;
  workCompleted: number;
};

/** Диагностика KPI автостоянки (dev). */
export function logGprParkingValidationToConsole(input: {
  stageRootCodes: readonly string[];
  stageRows: readonly GprParkingStageValidationRow[];
  parkingTotals: {
    workTotal: number;
    workCompleted: number;
    onTime: number;
    late: number;
    inProgress: number;
    notStarted: number;
    completionPct: number;
    factPercent: number | null;
    planPercent: number | null;
    deviationPp: number | null;
  };
  projectKpi: {
    workTotal: number;
    workCompleted: number;
    completionPct: number;
  };
}): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;

  console.log("=== PARKING VALIDATION ===");
  console.log("Этапы, найденные для автостоянки:", input.stageRootCodes.join(", ") || "—");
  console.log();

  for (const row of input.stageRows) {
    console.log(`${row.rootCode}:`);
    console.log(`работ — ${row.workTotal}`);
    console.log(`выполнено — ${row.workCompleted}`);
    console.log();
  }

  const t = input.parkingTotals;
  console.log("Итого по автостоянке:");
  console.log("Всего работ:", t.workTotal);
  console.log("Выполнено:", t.workCompleted);
  console.log("В срок:", t.onTime);
  console.log("С опозданием:", t.late);
  console.log("В процессе:", t.inProgress);
  console.log("Не начато:", t.notStarted);
  if (t.factPercent !== null) {
    console.log("Фактическая готовность:", `${t.factPercent}%`);
  }
  if (t.planPercent !== null) {
    console.log("Плановая готовность:", `${t.planPercent}%`);
  }
  if (t.deviationPp !== null) {
    console.log("Отклонение готовности:", `${t.deviationPp}%`);
  }
  console.log();
  console.log("Project KPI:");
  console.log("Всего работ:", input.projectKpi.workTotal);
  console.log("Выполнено:", input.projectKpi.workCompleted);
  console.log("Процент выполнения:", `${input.projectKpi.completionPct}%`);
}

export type GprStage205BusinessKpiConsistencyRow = {
  code: string;
  name: string;
  businessStatus: GprBusinessStatusKey;
  kpiCompleted: boolean;
  progressPercent100: boolean;
  completionField: number;
  calendarFactPercent: number;
  factEnd: string | null;
  planEnd: string | null;
  endDelayDays: number | null;
};

export type GprStage205BusinessKpiConsistency = {
  rootCode: string;
  workCompleted: number;
  completedOnTime: number;
  completedWithDelay: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  workCompletedEqualsOnTimePlusLate: boolean;
  progressPercent100Total: number;
  progressPercent100InCompletedBuckets: number;
  progressPercent100OutsideCompletedBuckets: GprStage205BusinessKpiConsistencyRow[];
  kpiCompletedOutsideCompletedBuckets: GprStage205BusinessKpiConsistencyRow[];
  rows: GprStage205BusinessKpiConsistencyRow[];
};

/** Согласованность KPI «Выполнение» и donut «Завершено / Завершено с опозданием» этапа 2.05. */
export function buildGprStage205BusinessKpiConsistency(
  allTasks: GPRTask[],
  rootTask: GPRTask,
  asOf: Date = new Date(),
): GprStage205BusinessKpiConsistency {
  const rootCode = normalizeGprCodeFinal(rootTask.code) || rootTask.code;
  const workItems = getGprKpiWorkItems(allTasks, rootTask);
  const insight = computeGprStageCompletionInsight(allTasks, rootTask, asOf);

  const rows: GprStage205BusinessKpiConsistencyRow[] = workItems.map((task) => {
    const businessStatus = gprStageWorkItemBusinessStatus(task, asOf);
    const kpiCompleted = isGprTaskFactCompleted(task, asOf);
    const progressPercent100 = isGprTaskProgressPercent100(task, asOf);
    return {
      code: normalizeGprCodeFinal(task.code) || task.code,
      name: String(task.name ?? "").trim() || "—",
      businessStatus,
      kpiCompleted,
      progressPercent100,
      completionField: gprTaskFactCompletionPercent(task),
      calendarFactPercent: getCalendarFactProgressPercent(task, asOf),
      factEnd: task.factEnd?.trim() || null,
      planEnd: task.planEnd?.trim() || null,
      endDelayDays: planFactEndDeviationDays(task.planEnd, task.factEnd, asOf),
    };
  });

  const completedOnTime = rows.filter((r) => r.businessStatus === "completed").length;
  const completedWithDelay = rows.filter((r) => r.businessStatus === "late").length;
  const inProgress = rows.filter((r) => r.businessStatus === "in_progress").length;
  const notStarted = rows.filter((r) => r.businessStatus === "not_started").length;
  const overdue = rows.filter((r) => r.businessStatus === "overdue").length;
  const workCompleted = insight.workCompleted;

  const progressPercent100OutsideCompletedBuckets = rows.filter(
    (r) =>
      r.progressPercent100 &&
      r.businessStatus !== "completed" &&
      r.businessStatus !== "late",
  );
  const kpiCompletedOutsideCompletedBuckets = rows.filter(
    (r) =>
      r.kpiCompleted &&
      r.businessStatus !== "completed" &&
      r.businessStatus !== "late",
  );

  return {
    rootCode,
    workCompleted,
    completedOnTime,
    completedWithDelay,
    inProgress,
    notStarted,
    overdue,
    workCompletedEqualsOnTimePlusLate:
      workCompleted === completedOnTime + completedWithDelay,
    progressPercent100Total: rows.filter((r) => r.progressPercent100).length,
    progressPercent100InCompletedBuckets: rows.filter(
      (r) =>
        r.progressPercent100 &&
        (r.businessStatus === "completed" || r.businessStatus === "late"),
    ).length,
    progressPercent100OutsideCompletedBuckets,
    kpiCompletedOutsideCompletedBuckets,
    rows,
  };
}

export function logGprStage205BusinessKpiConsistencyToConsole(
  allTasks: GPRTask[],
  rootTask: GPRTask,
  asOf: Date = new Date(),
): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;

  const d = buildGprStage205BusinessKpiConsistency(allTasks, rootTask, asOf);

  console.group("2.05 KPI consistency");
  console.log("completedOnTime (Завершено)", d.completedOnTime);
  console.log("completedWithDelay (Завершено с опозданием)", d.completedWithDelay);
  console.log("workCompleted (Выполнение)", d.workCompleted);
  console.log(
    "workCompleted === completedOnTime + completedWithDelay",
    d.workCompletedEqualsOnTimePlusLate,
    `(${d.workCompleted} === ${d.completedOnTime} + ${d.completedWithDelay})`,
  );
  console.log("В процессе", d.inProgress);
  console.log("Не начато", d.notStarted);
  console.log("Просрочено", d.overdue);
  console.log(
    "progressPercent100 total / in completed buckets",
    d.progressPercent100Total,
    "/",
    d.progressPercent100InCompletedBuckets,
  );

  if (!d.workCompletedEqualsOnTimePlusLate) {
    console.warn(
      "[2.05 KPI consistency] workCompleted не равен completedOnTime + completedWithDelay",
    );
    if (d.kpiCompletedOutsideCompletedBuckets.length > 0) {
      console.log("KPI completed, но не в «Завершено» / «Завершено с опозданием»:");
      console.table(d.kpiCompletedOutsideCompletedBuckets);
    }
  }

  if (d.progressPercent100OutsideCompletedBuckets.length > 0) {
    console.warn(
      "[2.05 KPI consistency] progressPercent = 100 вне «Завершено» / «Завершено с опозданием»:",
      d.progressPercent100OutsideCompletedBuckets.length,
    );
    console.table(d.progressPercent100OutsideCompletedBuckets);
  }

  console.groupEnd();
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

function classifyWorkPhase(
  task: GPRTask,
  asOf: Date,
): "completed" | "in_progress" | "not_started" {
  if (isGprTaskFactCompleted(task, asOf)) return "completed";
  if (task.factStart?.trim() || gprTaskFactCompletionPercent(task) > 0) return "in_progress";
  return "not_started";
}

/** Статус работы для диагностики KPI (фаза выполнения). */
export function gprTaskKpiStatusLabel(task: GPRTask, asOf: Date = new Date()): string {
  return classifyWorkPhase(task, asOf);
}

function countWorkStats(
  items: GPRTask[],
  asOf: Date,
): {
  workTotal: number;
  workCompleted: number;
  workInProgress: number;
  workWithFactDates: number;
} {
  let workCompleted = 0;
  let workInProgress = 0;
  let workWithFactDates = 0;
  for (const t of items) {
    const phase = classifyWorkPhase(t, asOf);
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
  if (insight.source === "csv_article_rollup") {
    lines.push("Факт и план — среднее календарных % по работам CSV («№ статей») этапа.");
  } else if (insight.source === "root_field") {
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
 * Факт выполнения этапа ГПР для KPI и rollup: только работы CSV с «№ статей».
 * Диаграмма «Динамика выполнения ГПР» может использовать отдельное WBS-разбиение.
 */
export function computeGprStageCompletionInsight(
  allTasks: GPRTask[],
  rootTask: GPRTask,
  asOf: Date = new Date(),
): GprStageCompletionInsight {
  const statsSet = getGprKpiWorkItems(allTasks, rootTask);

  let source: GprStageCompletionSource;
  if (statsSet.length > 0) {
    source = "csv_article_rollup";
  } else {
    const descendants = tasksUnderRootCode(allTasks, rootTask.code);
    const leaves = descendants.filter((t) => isLeafAmong(t, descendants));
    if (leaves.length > 0) source = "leaf_rollup";
    else if (descendants.length > 0) source = "descendant_rollup";
    else source = "root_field";
  }

  const factPercent =
    computeGprTasksFactCompletionPercent(statsSet, asOf) ??
    getCalendarFactProgressPercent(rootTask, asOf);
  const planPercent = computeGprTasksPlanCompletionPercent(statsSet, asOf);
  const stats = countWorkStats(statsSet, asOf);
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

/** Набор работ этапа по WBS (листья) — только для визуальной структуры и диагностики. */
export function getGprStageWorkItems(allTasks: GPRTask[], rootTask: GPRTask): GPRTask[] {
  const descendants = tasksUnderRootCode(allTasks, rootTask.code);
  const leaves = descendants.filter((t) => isLeafAmong(t, descendants));
  if (leaves.length > 0) return leaves;
  if (descendants.length > 0) return descendants;
  return [rootTask];
}

/** Набор работ для KPI: листья WBS в ветке этапа (PostgreSQL/API или CSV). */
export function getGprKpiWorkItems(allTasks: GPRTask[], rootTask: GPRTask): GPRTask[] {
  const rootCode = normalizeGprCodeFinal(rootTask.code) || rootTask.code;
  const items = allTasks.filter(
    (t) => isGprKpiWorkItem(t, allTasks) && matchesGprCodeBranch(t.code, rootCode),
  );
  return sortGprTasksByCsvArticleNumber(items);
}

/** Диагностика расчёта готовности этапа: счётчики и список задач с наступившим плановым окончанием. */
export function buildGprStageCompletionDiagnostic(
  allTasks: GPRTask[],
  rootTask: GPRTask,
  asOf: Date = new Date(),
): GprStageCompletionDiagnostic {
  const workItems = getGprKpiWorkItems(allTasks, rootTask);
  const completedItems = workItems.filter((t) => isGprTaskFactCompleted(t, asOf));
  const plannedCompleteItems = workItems.filter((t) => isGprTaskPlanCompleteByDate(t, asOf));

  let source: GprStageCompletionSource;
  if (workItems.length > 0) source = "csv_article_rollup";
  else {
    const descendants = tasksUnderRootCode(allTasks, rootTask.code);
    const leaves = descendants.filter((t) => isLeafAmong(t, descendants));
    if (leaves.length > 0) source = "leaf_rollup";
    else if (descendants.length > 0) source = "descendant_rollup";
    else source = "root_field";
  }

  const plannedCompletedTaskList = sortGprTasksByCsvArticleNumber(plannedCompleteItems)
    .map((t) => ({
      code: normalizeGprCodeFinal(t.code) || t.code,
      name: String(t.name ?? "").trim() || "—",
      planEnd: t.planEnd?.trim() || null,
      articleNumber: t.articleNumber ?? null,
    }));

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
  asOf: Date = new Date(),
): GprStage205KpiDiagnostic {
  const rootCode = normalizeGprCodeFinal(rootTask.code) || rootTask.code;
  const allRows = allTasks.filter((t) => matchesGprCodeBranch(t.code, rootCode));
  const leafRows = allRows.filter((t) => isLeafAmong(t, allRows));
  const rowsUsedInKpi = getGprKpiWorkItems(allTasks, rootTask);
  const completedItems = rowsUsedInKpi.filter((t) => isGprTaskFactCompleted(t, asOf));

  let source: GprStageCompletionSource;
  if (rowsUsedInKpi.length > 0) source = "csv_article_rollup";
  else {
    const descendants = tasksUnderRootCode(allTasks, rootTask.code);
    const leaves = descendants.filter((t) => isLeafAmong(t, descendants));
    if (leaves.length > 0) source = "leaf_rollup";
    else if (descendants.length > 0) source = "descendant_rollup";
    else source = "root_field";
  }

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

/** Код WBS из подписи строки диаграммы «Динамика выполнения ГПР». */
export function codeFromPlanFactChartLabel(label: string): string {
  const raw = label.split(" — ")[0]?.trim() ?? label.trim();
  return normalizeGprCodeFinal(raw) || raw;
}

/** Строки диаграммы, относящиеся к ветке WBS (например, 2.05). */
export function filterPlanFactChartLabelsForBranch(labels: string[], rootCode: string): string[] {
  const root = normalizeGprCodeFinal(rootCode);
  if (!root) return [];
  return labels.filter((label) => matchesGprCodeBranch(codeFromPlanFactChartLabel(label), root));
}

/**
 * Диагностика KPI этапа 2.05 в консоль: источник «N из M», сравнение с диаграммой.
 * `totalTasks` — работы этапа для KPI (`getGprKpiWorkItems`, строки CSV с «№ статей»).
 */
export function logGprStage205KpiToConsole(
  allTasks: GPRTask[],
  rootTask: GPRTask,
  asOf: Date = new Date(),
  chartLabelsUnderBranch?: string[],
): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;

  const diagnostic = buildGprStage205KpiDiagnostic(allTasks, rootTask, asOf);
  const totalTasks = getGprKpiWorkItems(allTasks, rootTask);
  const completedTasks = totalTasks.filter((t) => isGprTaskFactCompleted(t, asOf));

  console.group("2.05 KPI");
  console.log("completedTasks", completedTasks.length);
  console.log("totalTasks", totalTasks.length);
  console.log(
    "source",
    diagnostic.source,
    "— знаменатель «из N» = работы CSV с «№ статей» в ветке этапа (getGprKpiWorkItems)",
  );
  console.log("allRowsUnder205 (вся ветка WBS, включая родителей)", diagnostic.allRowsUnder205);
  console.log("leafRowsUnder205 (листья в ветке, без фильтра этапа)", diagnostic.leafRowsUnder205);

  console.table(
    totalTasks.map((task) => ({
      code: normalizeGprCodeFinal(task.code) || task.code,
      name: String(task.name ?? "").trim() || "—",
      status: gprTaskKpiStatusLabel(task, asOf),
      progressPercent: gprTaskFactCompletionPercent(task),
      calendarFactPercent: getCalendarFactProgressPercent(task, asOf),
      kpiCompleted: isGprTaskFactCompleted(task, asOf),
      factEnd: task.factEnd?.trim() || null,
    })),
  );

  if (chartLabelsUnderBranch) {
    const chartRows = filterPlanFactChartLabelsForBranch(
      chartLabelsUnderBranch,
      diagnostic.rootCode,
    );
    const chartCodes = chartRows.map((label) => codeFromPlanFactChartLabel(label));
    const chartUniqueCodes = [...new Set(chartCodes)];
    const kpiCodes = totalTasks.map((t) => normalizeGprCodeFinal(t.code) || t.code);
    const kpiCodeSet = new Set(kpiCodes);
    const chartCodeSet = new Set(chartUniqueCodes);
    const kpiOnlyCodes = kpiCodes.filter((c) => !chartCodeSet.has(c));
    const chartOnlyCodes = chartUniqueCodes.filter((c) => !kpiCodeSet.has(c));
    const countsMatch = chartRows.length === totalTasks.length;

    console.log("chartRowsUnder205 (строк на диаграмме)", chartRows.length);
    console.log("chartUniqueCodesUnder205", chartUniqueCodes.length);
    console.log("kpiTotalTasks (работы CSV «№ статей»)", totalTasks.length);
    console.log("chartRowCountMatchesKpiTotal", countsMatch);

    if (!countsMatch) {
      console.warn(
        `[2.05 KPI] Диаграмма: ${chartRows.length} строк, KPI: ${totalTasks.length} работ. ` +
          "Режим WBS диаграммы и синтетические этажи монолита (2.05.04.2) дают расхождение.",
      );
      if (kpiOnlyCodes.length > 0) {
        console.log("В KPI, но нет уникального кода на диаграмме:", kpiOnlyCodes.length);
        console.table(kpiOnlyCodes.map((code) => ({ code })));
      }
      if (chartOnlyCodes.length > 0) {
        console.log("На диаграмме, но нет в KPI (уникальные коды):", chartOnlyCodes.length);
        console.table(chartOnlyCodes.map((code) => ({ code })));
      }
      const chartRowCountByCode = chartCodes.reduce<Record<string, number>>((acc, code) => {
        acc[code] = (acc[code] ?? 0) + 1;
        return acc;
      }, {});
      const duplicatedOnChart = Object.entries(chartRowCountByCode).filter(([, n]) => n > 1);
      if (duplicatedOnChart.length > 0) {
        console.log("Повторяющиеся коды на диаграмме (синтетические строки):");
        console.table(
          duplicatedOnChart.map(([code, count]) => ({ code, chartRowCount: count })),
        );
      }
      console.log("Подписи строк диаграммы (2.05):");
      console.table(chartRows.map((label) => ({ label, code: codeFromPlanFactChartLabel(label) })));
    }
  }

  console.groupEnd();
}

/** @deprecated Используйте {@link logGprStage205KpiToConsole}. */
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
    ].join("\n"),
  );
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

export type GprKpiChartCompletionGapRow = {
  code: string;
  name: string;
  completionField: number;
  calendarFactPercent: number;
  factStart: string | null;
  factEnd: string | null;
  kpiCompleted: boolean;
  progressPercent100: boolean;
};

export type GprKpiChartCompletionGapDiagnostic = {
  rootCode: string;
  workTotal: number;
  kpiCompletedCount: number;
  progressPercent100Count: number;
  rows: GprKpiChartCompletionGapRow[];
  progress100NotInKpi: GprKpiChartCompletionGapRow[];
  kpiCompletedNotProgress100: GprKpiChartCompletionGapRow[];
};

/** Сравнение KPI «Выполнение» и работ с progressPercent === 100 (календарный / completion). */
export function buildGprKpiChartCompletionGapDiagnostic(
  allTasks: GPRTask[],
  rootTask: GPRTask,
  asOf: Date = new Date(),
): GprKpiChartCompletionGapDiagnostic {
  const rootCode = normalizeGprCodeFinal(rootTask.code) || rootTask.code;
  const workItems = getGprKpiWorkItems(allTasks, rootTask);
  const rows: GprKpiChartCompletionGapRow[] = workItems.map((t) => {
    const kpiCompleted = isGprTaskFactCompleted(t, asOf);
    const progressPercent100 = isGprTaskProgressPercent100(t, asOf);
    return {
      code: normalizeGprCodeFinal(t.code) || t.code,
      name: String(t.name ?? "").trim() || "—",
      completionField: gprTaskFactCompletionPercent(t),
      calendarFactPercent: getCalendarFactProgressPercent(t, asOf),
      factStart: t.factStart?.trim() || null,
      factEnd: t.factEnd?.trim() || null,
      kpiCompleted,
      progressPercent100,
    };
  });
  const progress100NotInKpi = rows.filter((r) => r.progressPercent100 && !r.kpiCompleted);
  const kpiCompletedNotProgress100 = rows.filter((r) => r.kpiCompleted && !r.progressPercent100);
  return {
    rootCode,
    workTotal: workItems.length,
    kpiCompletedCount: rows.filter((r) => r.kpiCompleted).length,
    progressPercent100Count: rows.filter((r) => r.progressPercent100).length,
    rows,
    progress100NotInKpi,
    kpiCompletedNotProgress100,
  };
}

export function logGprKpiChartCompletionGapToConsole(
  diagnostic: GprKpiChartCompletionGapDiagnostic,
  chartOnlyRows?: { label: string; floorPercent: number }[],
): void {
  console.group("KPI vs CHART completion gap");
  console.log("Root", diagnostic.rootCode);
  console.log("KPI work items", diagnostic.workTotal);
  console.log("KPI completedTasks", diagnostic.kpiCompletedCount);
  console.log("progressPercent === 100", diagnostic.progressPercent100Count);
  console.log(
    "KPI criteria: factEnd OR completion>=100 OR (factStart AND calendarFact>=100)",
  );
  console.log("Chart criteria (rows): calendar rollup / monolith floor split — see chartOnlyRows");
  console.table(
    diagnostic.rows.map((r) => ({
      code: r.code,
      name: r.name,
      completionField: r.completionField,
      calendarFactPercent: r.calendarFactPercent,
      progress100: r.progressPercent100,
      kpiCompleted: r.kpiCompleted,
      factStart: r.factStart,
      factEnd: r.factEnd,
    })),
  );
  if (diagnostic.progress100NotInKpi.length > 0) {
    console.log("progress 100% but NOT in KPI completed:");
    console.table(diagnostic.progress100NotInKpi);
  }
  if (diagnostic.kpiCompletedNotProgress100.length > 0) {
    console.log("KPI completed but NOT progress 100%:");
    console.table(diagnostic.kpiCompletedNotProgress100);
  }
  if (chartOnlyRows?.length) {
    console.log("Chart-only synthetic rows (not separate KPI work items):");
    console.table(chartOnlyRows);
  }
  console.groupEnd();
}
