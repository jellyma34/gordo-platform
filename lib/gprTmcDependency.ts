import { GPR_DATA } from "./gprData";
import { aggregateRootCodesForPart } from "./gprAggregateRoots";
import {
  calculateDeviation,
  compareGprCodesByNumericPath,
  durationDays,
  gprPlanFactCompositeKey,
  gprPlanFactScopeFromTask,
  gprTaskScheduleDeviationDisplayDays,
  gprWbsLevelFromCode,
  normalizeGprCodeFinal,
  PROJECT_PART_KEY_TO_ID,
  toDate,
  type GPRTask,
  type ProjectPartKey,
} from "./gprUtils";
import { computeGprStageFactCompletionChartPercent } from "./gprStageCompletion";
import {
  contractDeviationDays,
  getGprStageFromTenderCode,
  getTenderReadiness,
  type Tender,
} from "./tenderData";
import { filterTmcByProjectPart, type TMCItem } from "./tmcData";
import { computeWeightedMaterialDeficitPercentAtDate } from "./tmcPresentationAnalytics";

/** Ключ агрегированного этапа (совпадает с логикой дашборда ГПР). */
export type GprStageGroupKey = "prep" | "build" | "network" | "improve";

/** Подпись этапа = поле `gprStage` в ТМЦ и корневые работы ГПР. */
export const GPR_TMC_STAGE_LABELS: Record<GprStageGroupKey, string> = {
  prep: "Подготовка территории",
  build: "Строительство зданий и сооружений",
  network: "Устройство сетей",
  improve: "Благоустройство",
};

export type TmcImpactStatus = "ok" | "risk" | "block" | "na";

export type GprTmcDependencyPoint = {
  groupKey: GprStageGroupKey;
  /** Подпись для пользователя (как в ГПР / справочнике). */
  stageTitle: string;
  stageFull: string;
  stageShort: string;
  planGpr: number | null;
  factGpr: number | null;
  /** Отклонение по сроку окончания (дни; отриц. — отставание, положит. — опережение). */
  deviationDays: number | null;
  /** Отклонение готовности к плану на дату: факт − план (п.п.). */
  progressDeltaPp: number | null;
  tmcSupply: number | null;
  impact: TmcImpactStatus;
  statusLabel: string;
  zoneBar: number;
  zone: "none" | "risk" | "block";
};

/** Подписи оси X графика «ГПР — ТМЦ» по части проекта (без лишних категорий). */
export const GPR_TMC_CHART_STAGE_SHORT_BY_PART: Record<ProjectPartKey, string[]> = {
  residential: ["Подготовка", "Строительство"],
  parking: ["Сети", "Благоустройство"],
};

const CHART_SHORT_LABEL_TO_GROUP_KEY: Record<string, GprStageGroupKey> = {
  Подготовка: "prep",
  Строительство: "build",
  Сети: "network",
  Благоустройство: "improve",
};

/** Ключи этапов для части проекта (как ось графика «ГПР — ТМЦ» и блок «Отклонения по этапам»). */
export function gprStageGroupKeysForProjectPart(part: ProjectPartKey): GprStageGroupKey[] {
  const labels = GPR_TMC_CHART_STAGE_SHORT_BY_PART[part] ?? [];
  const keys: GprStageGroupKey[] = [];
  for (const short of labels) {
    const k = CHART_SHORT_LABEL_TO_GROUP_KEY[short];
    if (k) keys.push(k);
  }
  return keys;
}

/** Все четыре группы этапов (агрегат «Проект» на графиках отклонений). */
export function gprStageGroupKeysProjectWide(): GprStageGroupKey[] {
  return ["prep", "build", "network", "improve"];
}

function inferGroup(task: GPRTask): GprStageGroupKey {
  const n = `${task.code} ${task.name}`.toLowerCase();
  if (/благоустрой|озелен|тротуар|покрыт|дорож|асфальт/.test(n)) return "improve";
  if (/сет|теплов|водопровод|канализ|электр|слаботоч/.test(n)) return "network";
  if (/подготов|снос|вынос|времен|площадк|территор/.test(n)) return "prep";
  return "build";
}

/** Код корневой работы ГПР по ключу этапа (справочник `GPR_DATA`). */
const GROUP_KEY_TO_ROOT_CODE: Record<GprStageGroupKey, string> = {
  prep: "2.04",
  build: "2.05",
  network: "2.06",
  improve: "2.07",
};

const ROOT_CODE_TO_GROUP_KEY: Partial<Record<string, GprStageGroupKey>> = Object.fromEntries(
  (Object.entries(GROUP_KEY_TO_ROOT_CODE) as [GprStageGroupKey, string][]).map(([key, code]) => [
    normalizeGprCodeFinal(code),
    key,
  ]),
);

function groupKeyForAggregateRootCode(rootCode: string): GprStageGroupKey | null {
  return ROOT_CODE_TO_GROUP_KEY[normalizeGprCodeFinal(rootCode)] ?? null;
}

function groupKeyForWorkTask(task: GPRTask, branchRoots: readonly string[]): GprStageGroupKey {
  const c = normalizeGprCodeFinal(task.code);
  for (const root of branchRoots) {
    const rn = normalizeGprCodeFinal(root);
    if (c === rn || c.startsWith(`${rn}.`)) {
      const mapped = groupKeyForAggregateRootCode(rn);
      if (mapped) return mapped;
    }
  }
  return inferGroup(task);
}

/**
 * Работы WBS level 2 для оси графика «ГПР — ТМЦ»
 * (уровень «Детализированно» plan-fact; без листьев level 3+).
 */
function listLevel2GprWorksForTmcChart(tasks: GPRTask[], part: ProjectPartKey): GPRTask[] {
  const branchRoots = tmcChartBranchRootsForPart(part, tasks);
  const partitions = new Map<string, GPRTask[]>();

  for (const t of tasks) {
    const c = normalizeGprCodeFinal(t.code);
    if (!branchRoots.some((r) => c === normalizeGprCodeFinal(r) || c.startsWith(`${normalizeGprCodeFinal(r)}.`))) {
      continue;
    }
    const pk = `${t.partId ?? 0}|${gprPlanFactScopeFromTask(t)}|${(t.objectType ?? "").trim().replace(/\s+/g, " ")}`;
    const arr = partitions.get(pk);
    if (arr) arr.push(t);
    else partitions.set(pk, [t]);
  }

  const out: GPRTask[] = [];
  for (const [, group] of partitions) {
    for (const t of group) {
      const c = normalizeGprCodeFinal(t.code);
      if (gprWbsLevelFromCode(c, t.level) !== 2) continue;
      out.push(t);
    }
  }

  return out.sort((a, b) => {
    const cmp = compareGprCodesByNumericPath(a.code, b.code);
    if (cmp !== 0) return cmp;
    return gprPlanFactCompositeKey(a).localeCompare(gprPlanFactCompositeKey(b));
  });
}

/** Fallback: корневые работы WBS level 1 (упрощённый режим plan-fact). */
function listLevel1GprWorksForTmcChart(tasks: GPRTask[], part: ProjectPartKey): GPRTask[] {
  const branchRoots = tmcChartBranchRootsForPart(part, tasks);
  const rootSet = new Set(branchRoots.map((r) => normalizeGprCodeFinal(r)));
  return tasks
    .filter((t) => {
      const c = normalizeGprCodeFinal(t.code);
      if (gprWbsLevelFromCode(c, t.level) !== 1) return false;
      return rootSet.has(c);
    })
    .sort((a, b) => {
      const cmp = compareGprCodesByNumericPath(a.code, b.code);
      if (cmp !== 0) return cmp;
      return gprPlanFactCompositeKey(a).localeCompare(gprPlanFactCompositeKey(b));
    });
}

function catalogStageName(groupKey: GprStageGroupKey): string {
  const code = GROUP_KEY_TO_ROOT_CODE[groupKey];
  const row = GPR_DATA.find((i) => i.code === code);
  return row?.name ?? GPR_TMC_STAGE_LABELS[groupKey];
}

/**
 * Полное наименование этапа для UI: имя корневой задачи из ГПР, иначе строка из справочника работ.
 */
export function gprStageDisplayTitle(tasks: GPRTask[], groupKey: GprStageGroupKey): string {
  const root = findRootByCode(tasks, GROUP_KEY_TO_ROOT_CODE[groupKey]);
  const name = root?.name?.trim();
  if (name) return name;
  return catalogStageName(groupKey);
}

function plannedProgressBySchedule(task: GPRTask | null, todayIso: string): number | null {
  if (!task) return null;
  const ps = task.planStart?.trim();
  const pe = task.planEnd?.trim();
  if (!ps || !pe) return null;
  const t0 = new Date(`${ps}T00:00:00`).getTime();
  const t1 = new Date(`${pe}T00:00:00`).getTime();
  const now = new Date(`${todayIso}T00:00:00`).getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return null;
  if (now <= t0) return 0;
  if (now >= t1) return 100;
  return Math.round(((now - t0) / (t1 - t0)) * 100);
}

function pctFromItems(items: TMCItem[]): number | null {
  const plan = items.reduce((s, i) => s + i.planCost, 0);
  const fact = items.reduce((s, i) => s + (i.factCost ?? 0), 0);
  if (plan <= 0) return null;
  return Math.round(Math.min(100, (fact / plan) * 100));
}

/**
 * Эффективный шифр ГПР позиции ТМЦ для матчинга по работам:
 * 1) приоритет — `itemCode` (колонка «Шифр ГПР» CSV / поле реестра);
 * 2) если `itemCode` отсутствует или это синтетический фолбэк импорта (без сегментов кода
 *    в исходном CSV), используется код, извлечённый из текстового поля `gprStage`
 *    (например, ячейка «Этап работ ГПР» = «2.05.01.9. Прочие земляные работы» → «2.05.01.9»).
 *
 * Никаких подстрочных эвристик по названию материала и текстовому совпадению `gprStage`
 * с подписью этапа не используется.
 */
export function effectiveTmcGprCode(item: TMCItem): string {
  const fromItem = normalizeGprCodeFinal(item.itemCode || "");
  const fromStage = normalizeGprCodeFinal(item.gprStage || "");
  const stageEncodesCode = fromStage.split(".").filter(Boolean).length >= 2;
  if (stageEncodesCode) return fromStage;
  return fromItem;
}

/** Принадлежит ли позиция ТМЦ работе ГПР по шифру: `itemCode === workCode || itemCode.startsWith(workCode + ".")`. */
export function tmcItemBelongsToWorkCode(item: TMCItem, workCode: string): boolean {
  const wc = normalizeGprCodeFinal(workCode);
  if (!wc) return false;
  const code = effectiveTmcGprCode(item);
  if (!code) return false;
  return code === wc || code.startsWith(`${wc}.`);
}

/**
 * Обеспеченность ТМЦ для конкретной работы ГПР по шифру.
 *
 * Plan = Σ planCost по позициям, у которых `effectiveCode === workCode`
 *        или `effectiveCode.startsWith(workCode + ".")`.
 * Fact = Σ factCost по тем же позициям (null трактуется как 0).
 * Supply% = round( min(100, Fact / Plan × 100 ) ).
 *
 * Возвращает `null`, если по работе нет ни одной позиции ТМЦ или сумма Plan ≤ 0
 * (искусственные значения и проценты соседних работ не подставляются).
 */
export function tmcSupplyPercentForWorkCode(
  items: TMCItem[],
  workCode: string,
): number | null {
  const wc = normalizeGprCodeFinal(workCode);
  if (!wc) return null;
  const filtered = items.filter((i) => tmcItemBelongsToWorkCode(i, wc));
  if (filtered.length === 0) return null;
  return pctFromItems(filtered);
}

export function tmcImpactStatus(tmcPct: number | null): TmcImpactStatus {
  if (tmcPct === null) return "na";
  if (tmcPct < 50) return "block";
  if (tmcPct < 80) return "risk";
  return "ok";
}

export function tmcImpactStatusLabel(impact: TmcImpactStatus): string {
  if (impact === "block") return "Блок (ТМЦ < 50%)";
  if (impact === "risk") return "Риск (ТМЦ < 80%)";
  if (impact === "na") return "Нет данных ТМЦ";
  return "В срок";
}

/**
 * Корневые ветки WBS для графика «ГПР — ТМЦ».
 * Жилой дом: только 2.05 (строительный цикл здания), без 2.04 (подготовка территории).
 */
export function tmcChartBranchRootsForPart(
  partKey: ProjectPartKey,
  tasks: GPRTask[],
): readonly string[] {
  if (partKey === "residential") return ["2.05"];
  return aggregateRootCodesForPart(partKey, tasks);
}

export function buildGprTmcDependencySeries(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  todayIso: string,
  activeProjectPart: ProjectPartKey,
): GprTmcDependencyPoint[] {
  const labels = GPR_TMC_CHART_STAGE_SHORT_BY_PART[activeProjectPart] ?? [];
  if (labels.length === 0) {
    return [];
  }

  const tmcForChart = filterTmcByProjectPart(tmcItems, activeProjectPart);

  return labels.map((stageShort) => {
    const key = CHART_SHORT_LABEL_TO_GROUP_KEY[stageShort];
    if (!key) {
      throw new Error(`Неизвестная подпись этапа на графике: ${stageShort}`);
    }
    const stageFull = GPR_TMC_STAGE_LABELS[key];
    const rootCode = GROUP_KEY_TO_ROOT_CODE[key];
    const task = findRootByCode(tasks, rootCode);
    const stageTitle = gprStageDisplayTitle(tasks, key);
    const planGpr = plannedProgressBySchedule(task, todayIso);
    const asOf = toDate(todayIso) ?? new Date();
    const factGpr = task ? computeGprStageFactCompletionChartPercent(tasks, task, asOf) : null;
    const progressDeltaPp = task ? calculateDeviation(task, asOf) : null;
    const deviationDays = task ? gprTaskScheduleDeviationDisplayDays(task, asOf) : null;
    const tmcSupply = tmcSupplyPercentForWorkCode(tmcForChart, rootCode);
    const impact = tmcImpactStatus(tmcSupply);
    const zone: GprTmcDependencyPoint["zone"] =
      tmcSupply === null ? "none" : tmcSupply < 50 ? "block" : tmcSupply < 80 ? "risk" : "none";

    return {
      groupKey: key,
      stageTitle,
      stageFull,
      stageShort,
      planGpr,
      factGpr,
      deviationDays,
      progressDeltaPp,
      tmcSupply,
      impact,
      statusLabel: tmcImpactStatusLabel(impact),
      zoneBar: 100,
      zone,
    };
  });
}

/** Серия для графика «ГПР — ТМЦ»: точки по шифрам работ level 2 (ось X — только код). */
export function buildGprTmcDependencyChartSeries(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  todayIso: string,
  activeProjectPart: ProjectPartKey,
): GprTmcDependencyPoint[] {
  const branchRoots = tmcChartBranchRootsForPart(activeProjectPart, tasks);
  let workTasks = listLevel2GprWorksForTmcChart(tasks, activeProjectPart);
  if (workTasks.length === 0) {
    workTasks = listLevel1GprWorksForTmcChart(tasks, activeProjectPart);
  }
  if (workTasks.length === 0) {
    const allowedRoots = new Set(branchRoots.map((r) => normalizeGprCodeFinal(r)));
    return buildGprTmcDependencySeries(tasks, tmcItems, todayIso, activeProjectPart)
      .filter((row) => allowedRoots.has(normalizeGprCodeFinal(GROUP_KEY_TO_ROOT_CODE[row.groupKey])))
      .map((row) => ({
        ...row,
        stageShort: GROUP_KEY_TO_ROOT_CODE[row.groupKey],
      }));
  }

  const tmcForChart = filterTmcByProjectPart(tmcItems, activeProjectPart);

  const asOf = toDate(todayIso) ?? new Date();

  return workTasks.map((task) => {
    const workCode = normalizeGprCodeFinal(task.code);
    const key = groupKeyForWorkTask(task, branchRoots);
    const stageFull = GPR_TMC_STAGE_LABELS[key];
    const stageTitle = task.name?.trim() || catalogStageName(key);
    const planGpr = plannedProgressBySchedule(task, todayIso);
    const factGpr = computeGprStageFactCompletionChartPercent(tasks, task, asOf);
    const progressDeltaPp = calculateDeviation(task, asOf);
    const deviationDays = gprTaskScheduleDeviationDisplayDays(task, asOf);
    const tmcSupply = tmcSupplyPercentForWorkCode(tmcForChart, workCode);
    const impact = tmcImpactStatus(tmcSupply);
    const zone: GprTmcDependencyPoint["zone"] =
      tmcSupply === null ? "none" : tmcSupply < 50 ? "block" : tmcSupply < 80 ? "risk" : "none";

    return {
      groupKey: key,
      stageTitle,
      stageFull,
      stageShort: workCode,
      planGpr,
      factGpr,
      deviationDays,
      progressDeltaPp,
      tmcSupply,
      impact,
      statusLabel: tmcImpactStatusLabel(impact),
      zoneBar: 100,
      zone,
    };
  });
}

/** Порог зон риска на scatter «% выполнения» (ТМЦ и ГПР). */
export const GPR_TMC_COMPLETION_SCATTER_THRESHOLD_PCT = 80;

export type GprTmcCompletionScatterQuadrant =
  | "normal"
  | "lag_not_tmc"
  | "tmc_risk"
  | "tmc_confirmed";

export type GprTmcCompletionQuadrantStyle = {
  solid: string;
  fill: string;
  border: string;
  label: string;
};

/** Единая управленческая палитра матрицы «% выполнения» (заливка, граница, точки, легенда). */
export const GPR_TMC_COMPLETION_QUADRANT_STYLES: Record<
  GprTmcCompletionScatterQuadrant,
  GprTmcCompletionQuadrantStyle
> = {
  normal: {
    solid: "#22c55e",
    fill: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.18)",
    label: "Норма",
  },
  tmc_risk: {
    solid: "#f97316",
    fill: "rgba(249, 115, 22, 0.12)",
    border: "rgba(249, 115, 22, 0.18)",
    label: "Риск дефицита ТМЦ",
  },
  lag_not_tmc: {
    solid: "#facc15",
    fill: "rgba(250, 204, 21, 0.12)",
    border: "rgba(250, 204, 21, 0.18)",
    label: "Отставание не связано с ТМЦ",
  },
  tmc_confirmed: {
    solid: "#ef4444",
    fill: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.18)",
    label: "Критическая зона",
  },
};

export const GPR_TMC_COMPLETION_QUADRANT_LEGEND_ORDER: GprTmcCompletionScatterQuadrant[] = [
  "normal",
  "tmc_risk",
  "lag_not_tmc",
  "tmc_confirmed",
];

export type GprTmcCompletionScatterPoint = {
  stageShort: string;
  stageTitle: string;
  gprPercent: number;
  tmcPercent: number;
  color: string;
  quadrant: GprTmcCompletionScatterQuadrant;
};

export function resolveGprTmcCompletionScatterPointMeta(
  tmcPercent: number,
  gprPercent: number,
  threshold = GPR_TMC_COMPLETION_SCATTER_THRESHOLD_PCT,
): { color: string; quadrant: GprTmcCompletionScatterQuadrant } {
  const tmcOk = tmcPercent >= threshold;
  const gprOk = gprPercent >= threshold;
  if (tmcOk && gprOk) {
    return { color: GPR_TMC_COMPLETION_QUADRANT_STYLES.normal.solid, quadrant: "normal" };
  }
  if (tmcOk && !gprOk) {
    return {
      color: GPR_TMC_COMPLETION_QUADRANT_STYLES.lag_not_tmc.solid,
      quadrant: "lag_not_tmc",
    };
  }
  if (!tmcOk && gprOk) {
    return { color: GPR_TMC_COMPLETION_QUADRANT_STYLES.tmc_risk.solid, quadrant: "tmc_risk" };
  }
  return {
    color: GPR_TMC_COMPLETION_QUADRANT_STYLES.tmc_confirmed.solid,
    quadrant: "tmc_confirmed",
  };
}

/** Точки scatter «% выполнения» — только этапы с фактом ГПР и обеспеченностью ТМЦ. */
export function buildGprTmcCompletionScatterPoints(
  series: GprTmcDependencyPoint[],
): GprTmcCompletionScatterPoint[] {
  const out: GprTmcCompletionScatterPoint[] = [];
  for (const row of series) {
    if (row.factGpr == null || row.tmcSupply == null) continue;
    const meta = resolveGprTmcCompletionScatterPointMeta(row.tmcSupply, row.factGpr);
    out.push({
      stageShort: row.stageShort,
      stageTitle: row.stageTitle,
      gprPercent: row.factGpr,
      tmcPercent: row.tmcSupply,
      ...meta,
    });
  }
  return out;
}

/** Агрегат «Проект»: работы жилой части и автостоянки подряд. */
export function buildGprTmcDependencyChartSeriesProjectWide(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  todayIso: string,
): GprTmcDependencyPoint[] {
  return [
    ...buildGprTmcDependencyChartSeries(
      tasks.filter((t) => t.partId === 1),
      filterTmcByProjectPart(tmcItems, "residential"),
      todayIso,
      "residential",
    ),
    ...buildGprTmcDependencyChartSeries(
      tasks.filter((t) => t.partId === 2),
      filterTmcByProjectPart(tmcItems, "parking"),
      todayIso,
      "parking",
    ),
  ];
}

export const GPR_TMC_DYNAMICS_GAP_THRESHOLD_PP = 30;
export const GPR_TMC_DYNAMICS_SEGMENT_DROP_PP = 2;

export type GprTmcDynamicsInsight = "tmc_deficit_likely" | "cause_not_tmc_likely" | "none";

export type GprTmcSupplyTimelinePoint = {
  monthKey: string;
  /** Подпись оси X: «Ноя'25». */
  axisMonthLabel: string;
  /** Календарный период для tooltip: «Ноябрь 2025». */
  calendarPeriodLabel: string;
  monthIndex: number;
  projectMonthCode: string;
  /** @deprecated Используйте axisMonthLabel. */
  monthLabel: string;
  monthMs: number;
  gprFactPercent: number | null;
  tmcSupplyPercent: number | null;
  weightedDeficitPercent: number | null;
  differencePp: number | null;
};

export type GprTmcSupplyTimelineSegment = {
  fromMonthKey: string;
  toMonthKey: string;
  fromMonthIndex: number;
  toMonthIndex: number;
  insight: GprTmcDynamicsInsight;
  insightLabel: string;
};

export type GprTmcSupplyTimelineModel = {
  /** Минимальная дата из задач ГПР (planStart / factStart). */
  projectStartIso: string;
  /** Максимальная дата из задач ГПР (planEnd / factEnd). */
  projectEndIso: string;
  /** Первый месяц на графике (календарный). */
  chartMonthFromLabel: string;
  /** Последний месяц на графике (календарный). */
  chartMonthToLabel: string;
  todayIso: string;
  todayMs: number;
  points: GprTmcSupplyTimelinePoint[];
  segments: GprTmcSupplyTimelineSegment[];
};

export function resolveGprTmcDynamicsSegmentInsight(
  prev: { gprFactPercent: number; tmcSupplyPercent: number },
  cur: { gprFactPercent: number; tmcSupplyPercent: number },
  dropThresholdPp: number = GPR_TMC_DYNAMICS_SEGMENT_DROP_PP,
): { insight: GprTmcDynamicsInsight; insightLabel: string } {
  const tmcDelta = Math.round((cur.tmcSupplyPercent - prev.tmcSupplyPercent) * 10) / 10;
  const gprDelta = Math.round((cur.gprFactPercent - prev.gprFactPercent) * 10) / 10;

  if (tmcDelta < -dropThresholdPp && tmcDelta < gprDelta - 0.5) {
    return {
      insight: "tmc_deficit_likely",
      insightLabel: "Вероятное влияние дефицита ТМЦ",
    };
  }

  if (
    gprDelta < -dropThresholdPp &&
    cur.tmcSupplyPercent >= cur.gprFactPercent &&
    tmcDelta >= gprDelta
  ) {
    return {
      insight: "cause_not_tmc_likely",
      insightLabel: "Причина вероятно не связана с ТМЦ",
    };
  }

  return { insight: "none", insightLabel: "" };
}

function tmcItemsForForecastPart(items: TMCItem[], part: ForecastPart): TMCItem[] {
  if (part === "project") {
    return items.filter((i) => i.projectPart === "residential" || i.projectPart === "parking");
  }
  return filterTmcByProjectPart(items, part);
}

function partTimelineBoundsGprTmcSupply(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  part: ForecastPart,
  todayIso: string,
): { startIso: string; endIso: string } | null {
  const scopedTasks = tasksForForecastPart(tasks, part);
  const scopedTmc = tmcItemsForForecastPart(tmcItems, part);
  let minS: string | null = null;
  let maxE: string | null = null;

  const consider = (iso: string | null | undefined) => {
    const s = iso?.trim();
    if (!s) return;
    if (!minS || s < minS) minS = s;
    if (!maxE || s > maxE) maxE = s;
  };

  for (const t of scopedTasks) {
    consider(t.planStart);
    consider(t.planEnd);
    consider(t.factStart);
    consider(t.factEnd);
  }
  for (const item of scopedTmc) {
    consider(item.supplyPlanDate);
    consider(item.supplyFactDate);
    consider(item.contractPlanDate);
    consider(item.contractFactDate);
  }

  if (!minS || !maxE) {
    const roots = partPlanBounds(scopedTasks, part);
    if (!roots) return null;
    minS = roots.startIso;
    maxE = roots.endIso;
  }

  if (todayIso > maxE) maxE = todayIso;
  return { startIso: minS, endIso: maxE };
}

function formatGprTimelineMonthShortLabel(monthMs: number, spanYears: number): string {
  const d = new Date(monthMs);
  const short = TIMELINE_MONTH_SHORT_RU[d.getMonth()] ?? "";
  if (spanYears <= 1) return short;
  return `${short} ${String(d.getFullYear()).slice(-2)}`;
}

const TIMELINE_MONTH_FULL_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

/** Минимальная дата старта проекта по задачам ГПР. */
export function resolveGprProjectStartIso(tasks: GPRTask[], part: ForecastPart): string | null {
  const scopedTasks = tasksForForecastPart(tasks, part);
  let minStart: string | null = null;
  for (const task of scopedTasks) {
    for (const iso of [task.planStart, task.factStart]) {
      const value = iso?.trim();
      if (!value) continue;
      if (!minStart || value < minStart) minStart = value;
    }
  }
  return minStart;
}

/** Максимальная дата окончания проекта по задачам ГПР. */
export function resolveGprProjectEndIso(tasks: GPRTask[], part: ForecastPart): string | null {
  const scopedTasks = tasksForForecastPart(tasks, part);
  let maxEnd: string | null = null;
  for (const task of scopedTasks) {
    for (const iso of [task.planEnd, task.factEnd]) {
      const value = iso?.trim();
      if (!value) continue;
      if (!maxEnd || value > maxEnd) maxEnd = value;
    }
  }
  return maxEnd;
}

/** Индекс месяца проекта: 1 = месяц, содержащий дату старта ГПР. */
export function computeGprProjectMonthIndex(projectStartIso: string, monthMs: number): number {
  const start = new Date(`${projectStartIso.slice(0, 7)}-01T12:00:00`);
  const current = new Date(monthMs);
  if (Number.isNaN(start.getTime()) || Number.isNaN(current.getTime())) return 1;
  const diff =
    (current.getFullYear() - start.getFullYear()) * 12 + (current.getMonth() - start.getMonth());
  return Math.max(1, diff + 1);
}

export function formatGprProjectMonthCode(monthIndex: number): string {
  return `М${monthIndex}`;
}

/** Подпись оси X: «М7» при длинной шкале, иначе «7 месяц». */
export function formatGprProjectMonthAxisLabel(monthIndex: number, pointCount: number): string {
  if (pointCount > 12) return formatGprProjectMonthCode(monthIndex);
  const mod10 = monthIndex % 10;
  const mod100 = monthIndex % 100;
  const noun =
    mod10 === 1 && mod100 !== 11
      ? "месяц"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "месяца"
        : "месяцев";
  return `${monthIndex} ${noun}`;
}

export function formatGprTimelineCalendarPeriod(monthMs: number): string {
  const d = new Date(monthMs);
  const monthName = TIMELINE_MONTH_FULL_RU[d.getMonth()] ?? "";
  return `${monthName} ${d.getFullYear()}`.trim();
}

/** Подпись оси X: «Ноя'25». */
export function formatGprTimelineMonthAxisLabel(monthMs: number): string {
  const d = new Date(monthMs);
  const short = TIMELINE_MONTH_SHORT_RU[d.getMonth()] ?? "";
  const year = String(d.getFullYear()).slice(-2);
  return `${short}'${year}`;
}

/** Помесячная динамика факта ГПР и обеспеченности ТМЦ проекта. */
export function buildGprTmcSupplyTimelineModel(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  todayIso: string,
  activeProjectPart: ForecastPart,
): GprTmcSupplyTimelineModel | null {
  const scopedTasks = tasksForForecastPart(tasks, activeProjectPart);
  const projectStartIso = resolveGprProjectStartIso(tasks, activeProjectPart);
  const projectEndIso = resolveGprProjectEndIso(tasks, activeProjectPart);
  if (!projectStartIso || !projectEndIso) return null;

  const scopedTmc = tmcItemsForForecastPart(tmcItems, activeProjectPart);
  const todayMs = dateToMs(todayIso);
  const startYear = new Date(dateToMs(projectStartIso)).getFullYear();
  const endYear = new Date(dateToMs(projectEndIso)).getFullYear();
  const spanYears = endYear - startYear + 1;
  const monthMsList = eachMonthStartMs(projectStartIso, projectEndIso);
  if (monthMsList.length === 0) return null;

  const points: GprTmcSupplyTimelinePoint[] = [];
  for (const monthMs of monthMsList) {
    const axisMonthLabel = formatGprTimelineMonthAxisLabel(monthMs);
    const calendarPeriodLabel = formatGprTimelineCalendarPeriod(monthMs);
    const monthIndex = computeGprProjectMonthIndex(projectStartIso, monthMs);

    if (monthMs > todayMs) {
      points.push({
        monthKey: msToIso(monthMs).slice(0, 7),
        axisMonthLabel,
        calendarPeriodLabel,
        monthIndex,
        projectMonthCode: formatGprProjectMonthCode(monthIndex),
        monthLabel: formatGprTimelineMonthShortLabel(monthMs, spanYears),
        monthMs,
        gprFactPercent: null,
        tmcSupplyPercent: null,
        weightedDeficitPercent: null,
        differencePp: null,
      });
      continue;
    }

    const monthEndIso = endOfMonthIso(monthMs);
    const asOfIso = monthEndIso > todayIso ? todayIso : monthEndIso;
    const monthKey = asOfIso.slice(0, 7);
    const gprFact = weightedFactGprAllTasksAtDate(scopedTasks, asOfIso, todayIso);
    const weightedDeficit = computeWeightedMaterialDeficitPercentAtDate(
      scopedTmc,
      asOfIso,
      todayIso,
    );
    const tmcSupply = Math.round((100 - weightedDeficit) * 10) / 10;
    const differencePp =
      gprFact != null ? Math.round((gprFact - tmcSupply) * 10) / 10 : null;

    points.push({
      monthKey,
      axisMonthLabel,
      calendarPeriodLabel,
      monthIndex,
      projectMonthCode: formatGprProjectMonthCode(monthIndex),
      monthLabel: formatGprTimelineMonthShortLabel(monthMs, spanYears),
      monthMs,
      gprFactPercent: gprFact,
      tmcSupplyPercent: tmcSupply,
      weightedDeficitPercent: weightedDeficit,
      differencePp,
    });
  }

  const dataPoints = points.filter((p) => p.gprFactPercent != null);
  if (dataPoints.length === 0) return null;

  const segments: GprTmcSupplyTimelineSegment[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    if (prev.gprFactPercent == null || cur.gprFactPercent == null) continue;
    if (prev.tmcSupplyPercent == null || cur.tmcSupplyPercent == null) continue;
    const { insight, insightLabel } = resolveGprTmcDynamicsSegmentInsight(
      { gprFactPercent: prev.gprFactPercent, tmcSupplyPercent: prev.tmcSupplyPercent },
      { gprFactPercent: cur.gprFactPercent, tmcSupplyPercent: cur.tmcSupplyPercent },
    );
    if (insight === "none") continue;
    segments.push({
      fromMonthKey: prev.monthKey,
      toMonthKey: cur.monthKey,
      fromMonthIndex: prev.monthIndex,
      toMonthIndex: cur.monthIndex,
      insight,
      insightLabel,
    });
  }

  const firstData = dataPoints[0]!;
  const lastData = dataPoints[dataPoints.length - 1]!;

  return {
    projectStartIso,
    projectEndIso,
    chartMonthFromLabel: firstData.calendarPeriodLabel,
    chartMonthToLabel: lastData.calendarPeriodLabel,
    todayIso,
    todayMs,
    points,
    segments,
  };
}

export function buildGprTmcSupplyTimelineModelProjectWide(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  todayIso: string,
): GprTmcSupplyTimelineModel | null {
  return buildGprTmcSupplyTimelineModel(tasks, tmcItems, todayIso, "project");
}

export type GprTenderDependencyPoint = {
  groupKey: GprStageGroupKey;
  stageTitle: string;
  stageFull: string;
  stageShort: string;
  rootCode: string;
  planGpr: number | null;
  factGpr: number | null;
  /** Отклонение по сроку окончания (дни; отриц. — отставание, положит. — опережение). */
  deviationDays: number | null;
  /** Отклонение готовности к плану на дату: факт − план (п.п.). */
  progressDeltaPp: number | null;
  tenderReadiness: number | null;
  tenderStats: { total: number; completed: number; delayed: number; riskContracts: number };
  insight: string;
};

function tenderStatsForRoot(rootCode: string, tenders: Tender[]): {
  total: number;
  completed: number;
  delayed: number;
  riskContracts: number;
} {
  const stageTenders = tenders.filter((t) => getGprStageFromTenderCode(t.code) === rootCode);
  const total = stageTenders.length;
  const completed = stageTenders.filter((t) => t.factContractDate).length;
  let delayed = 0;
  let riskContracts = 0;
  for (const t of stageTenders) {
    const d = contractDeviationDays(t);
    if (d === null) continue;
    if (d > 14) delayed += 1;
    else if (d > 0) riskContracts += 1;
  }
  return { total, completed, delayed, riskContracts };
}

function tenderInsight(factGpr: number | null, tenderReadiness: number | null, hasTenders: boolean): string {
  if (!hasTenders) return "Нет тендеров по этапу в реестре части проекта.";
  if (tenderReadiness === null) return "Нет тендеров по этапу в реестре части проекта.";
  if (factGpr === null) return "Нет данных по факту ГПР для сравнения.";
  if (tenderReadiness < factGpr) {
    const gap = factGpr - tenderReadiness;
    if (gap > 15) {
      return "Тендеры отстают существенно сильнее выполнения ГПР — потенциальная причина будущего отставания работ.";
    }
    return "Низкая готовность тендеров влияет на выполнение этапа; возможен риск замедления работ.";
  }
  if (tenderReadiness > factGpr) {
    return "По доле заключённых договоров тендеры не отстают от факта ГПР.";
  }
  return "Готовность тендеров на уровне выполнения ГПР.";
}

/** Серия для графика «ГПР — тендеры»: те же этапы и план/факт ГПР, что и у ТМЦ-графика. */
export function buildGprTenderDependencySeries(
  tasks: GPRTask[],
  tenders: Tender[],
  todayIso: string,
  activeProjectPart: ProjectPartKey,
): GprTenderDependencyPoint[] {
  const partId = PROJECT_PART_KEY_TO_ID[activeProjectPart];
  if (partId == null || !Number.isFinite(partId)) {
    return [];
  }
  const tendersForPart = tenders.filter((t) => t.partId === partId);

  const labels = GPR_TMC_CHART_STAGE_SHORT_BY_PART[activeProjectPart] ?? [];

  return labels.map((stageShort) => {
    const key = CHART_SHORT_LABEL_TO_GROUP_KEY[stageShort];
    if (!key) {
      throw new Error(`Неизвестная подпись этапа на графике: ${stageShort}`);
    }
    const stageFull = GPR_TMC_STAGE_LABELS[key];
    const task = findRootByCode(tasks, GROUP_KEY_TO_ROOT_CODE[key]);
    const stageTitle = gprStageDisplayTitle(tasks, key);
    const planGpr = plannedProgressBySchedule(task, todayIso);
    const asOf = toDate(todayIso) ?? new Date();
    const factGpr = task ? computeGprStageFactCompletionChartPercent(tasks, task, asOf) : null;
    const progressDeltaPp = task ? calculateDeviation(task, asOf) : null;
    const deviationDays = task ? gprTaskScheduleDeviationDisplayDays(task, asOf) : null;
    const rootCode = GROUP_KEY_TO_ROOT_CODE[key];
    const tenderStats = tenderStatsForRoot(rootCode, tendersForPart);
    const tenderReadiness = getTenderReadiness(rootCode, tendersForPart);
    const hasTenders = tenderStats.total > 0;
    const insight = tenderInsight(factGpr, tenderReadiness, hasTenders);

    return {
      groupKey: key,
      stageTitle,
      stageFull,
      stageShort,
      rootCode,
      planGpr,
      factGpr,
      deviationDays,
      progressDeltaPp,
      tenderReadiness,
      tenderStats,
      insight,
    };
  });
}

/** Агрегат «Проект»: серии жилой части и автостоянки подряд. */
export function buildGprTmcDependencySeriesProjectWide(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  todayIso: string,
): GprTmcDependencyPoint[] {
  return [
    ...buildGprTmcDependencySeries(
      tasks.filter((t) => t.partId === 1),
      filterTmcByProjectPart(tmcItems, "residential"),
      todayIso,
      "residential",
    ),
    ...buildGprTmcDependencySeries(
      tasks.filter((t) => t.partId === 2),
      filterTmcByProjectPart(tmcItems, "parking"),
      todayIso,
      "parking",
    ),
  ];
}

export function buildGprTenderDependencySeriesProjectWide(
  tasks: GPRTask[],
  tenders: Tender[],
  todayIso: string,
): GprTenderDependencyPoint[] {
  return [
    ...buildGprTenderDependencySeries(
      tasks.filter((t) => t.partId === 1),
      tenders.filter((t) => t.partId === 1),
      todayIso,
      "residential",
    ),
    ...buildGprTenderDependencySeries(
      tasks.filter((t) => t.partId === 2),
      tenders.filter((t) => t.partId === 2),
      todayIso,
      "parking",
    ),
  ];
}

/**
 * Прогноз выполнения ГПР по этапу: факт минус штраф за дефицит ТМЦ (40%) и тендеров (60%).
 * Пропуски ТМЦ/тендеров трактуются как 100% (без штрафа), как в ТЗ.
 */
export function computeGprForecastPercent(
  fact: number | null,
  tmc: number | null,
  tenders: number | null,
): number | null {
  if (fact === null || Number.isNaN(fact)) return null;
  const riskFactor = (100 - (tmc ?? 100)) * 0.4 + (100 - (tenders ?? 100)) * 0.6;
  const forecast = fact - riskFactor * 0.3;
  return Math.max(0, Math.min(100, Math.round(forecast)));
}

export type GprForecastPoint = {
  groupKey: GprStageGroupKey;
  stageTitle: string;
  stageFull: string;
  stageShort: string;
  planGpr: number | null;
  factGpr: number | null;
  forecastGpr: number | null;
  tmcPct: number | null;
  tenderPct: number | null;
  insight: string;
};

/** Порог разрыва факт − прогноз (п.п.) для «сильного» сигнала на точке прогноза. */
export const GPR_FORECAST_DROP_STRONG_PP = 12;

function buildGprForecastInsight(
  fact: number | null,
  forecast: number | null,
  tmc: number | null,
  tenders: number | null,
): string {
  if (forecast === null) {
    return "Недостаточно данных для прогноза: нет фактического выполнения ГПР по этапу.";
  }
  if (fact === null) {
    return "Недостаточно данных для прогноза.";
  }
  if (forecast >= fact) {
    return "Риски по ТМЦ и тендерам в сумме не уводят прогноз ниже текущего факта ГПР.";
  }
  const gap = fact - forecast;
  const tmcDrag = tmc !== null && tmc < 75;
  const tenDrag = tenders !== null && tenders < 75;
  if (gap > GPR_FORECAST_DROP_STRONG_PP) {
    if (tenDrag && tmcDrag) {
      return "Сильное снижение прогноза: низкая обеспеченность ТМЦ и готовность тендеров снижают ожидаемое выполнение.";
    }
    if (tenDrag) {
      return "Низкая готовность тендеров снижает прогноз выполнения.";
    }
    if (tmcDrag) {
      return "Низкая обеспеченность ТМЦ снижает прогноз выполнения.";
    }
    return "Совокупный фактор риска ТМЦ и тендеров заметно снижает прогноз относительно факта.";
  }
  return "Умеренное снижение прогноза относительно факта ГПР из-за отставания ТМЦ и/или тендеров.";
}

/** Те же этапы, что у графиков «ГПР—ТМЦ» и «ГПР—тендеры»; данные только из текущих расчётов серий. */
export function buildGprForecastSeries(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  tenders: Tender[],
  todayIso: string,
  activeProjectPart: ProjectPartKey,
): GprForecastPoint[] {
  const tmcSeries = buildGprTmcDependencySeries(tasks, tmcItems, todayIso, activeProjectPart);
  const tenderSeries = buildGprTenderDependencySeries(tasks, tenders, todayIso, activeProjectPart);

  return tmcSeries.map((tmcRow, i) => {
    const tenRow = tenderSeries[i];
    if (!tenRow || tmcRow.groupKey !== tenRow.groupKey) {
      throw new Error("Несогласованность серий ТМЦ и тендеров для прогноза ГПР");
    }
    const fact = tmcRow.factGpr;
    const tmc = tmcRow.tmcSupply;
    const tendersPct = tenRow.tenderReadiness;
    const forecastGpr = computeGprForecastPercent(fact, tmc, tendersPct);
    const insight = buildGprForecastInsight(fact, forecastGpr, tmc, tendersPct);

    return {
      groupKey: tmcRow.groupKey,
      stageTitle: tmcRow.stageTitle,
      stageFull: tmcRow.stageFull,
      stageShort: tmcRow.stageShort,
      planGpr: tmcRow.planGpr,
      factGpr: fact,
      forecastGpr,
      tmcPct: tmc,
      tenderPct: tendersPct,
      insight,
    };
  });
}

/** Корневые коды ГПР по части проекта (как в карточке «Выполнение ГПР»). */
const PART_ROOT_CODES_FOR_FORECAST: Record<ProjectPartKey, readonly string[]> = {
  residential: ["2.04", "2.05"],
  parking: ["2.06", "2.07"],
};

const ALL_PROJECT_ROOT_FORECAST: readonly string[] = ["2.04", "2.05", "2.06", "2.07"];

export type ForecastPart = ProjectPartKey | "project";

function rootCodesForForecast(part: ForecastPart): readonly string[] {
  if (part === "project") return ALL_PROJECT_ROOT_FORECAST;
  return PART_ROOT_CODES_FOR_FORECAST[part];
}

function findRootByCode(tasks: GPRTask[], code: string): GPRTask | null {
  const rc = normalizeGprCodeFinal(code);
  return (
    tasks.find(
      (t) =>
        normalizeGprCodeFinal(t.code) === rc &&
        (t.level ?? normalizeGprCodeFinal(t.code).split(".").length - 1) === 1,
    ) ?? null
  );
}

function partPlanBounds(
  tasks: GPRTask[],
  part: ForecastPart,
): { startIso: string; endIso: string } | null {
  let minS: string | null = null;
  let maxE: string | null = null;
  for (const code of rootCodesForForecast(part)) {
    const t = findRootByCode(tasks, code);
    if (!t) continue;
    const ps = t.planStart?.trim();
    const pe = t.planEnd?.trim();
    if (!ps || !pe) continue;
    if (!minS || ps < minS) minS = ps;
    if (!maxE || pe > maxE) maxE = pe;
  }
  if (!minS || !maxE) return null;
  return { startIso: minS, endIso: maxE };
}

function dateToMs(iso: string): number {
  return new Date(`${iso}T12:00:00`).getTime();
}

function msToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDaysToIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function eachMonthStartMs(fromIso: string, toIso: string): number[] {
  const out: number[] = [];
  const end = dateToMs(toIso);
  const d = new Date(`${fromIso.slice(0, 7)}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return out;
  while (d.getTime() <= end) {
    out.push(d.getTime());
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

function weightedFactGprPart(tasks: GPRTask[], part: ForecastPart): number | null {
  let wSum = 0;
  let dSum = 0;
  for (const code of rootCodesForForecast(part)) {
    const t = findRootByCode(tasks, code);
    if (!t) continue;
    const pd = durationDays(t.planStart, t.planEnd);
    if (!Number.isFinite(pd) || pd <= 0) continue;
    const c = Math.min(100, Math.max(0, Number(t.completion) || 0));
    wSum += c * pd;
    dSum += pd;
  }
  if (dSum <= 0) return null;
  return Math.round((wSum / dSum) * 10) / 10;
}

function weightedPlanGprPartAtDate(
  tasks: GPRTask[],
  part: ForecastPart,
  dateIso: string,
): number | null {
  let wSum = 0;
  let dSum = 0;
  for (const code of rootCodesForForecast(part)) {
    const t = findRootByCode(tasks, code);
    if (!t) continue;
    const pd = durationDays(t.planStart, t.planEnd);
    if (!Number.isFinite(pd) || pd <= 0) continue;
    const pp = plannedProgressBySchedule(t, dateIso);
    if (pp == null) continue;
    wSum += pp * pd;
    dSum += pd;
  }
  if (dSum <= 0) return null;
  return Math.round((wSum / dSum) * 10) / 10;
}

function weightedAvgFromStageSeries(
  series: { groupKey: GprStageGroupKey; value: number | null }[],
  tasks: GPRTask[],
  part: ForecastPart,
): number | null {
  let wSum = 0;
  let dSum = 0;
  for (const row of series) {
    if (row.value == null) continue;
    const code = GROUP_KEY_TO_ROOT_CODE[row.groupKey];
    const t = findRootByCode(tasks, code);
    if (!t) continue;
    const pd = durationDays(t.planStart, t.planEnd);
    if (!Number.isFinite(pd) || pd <= 0) continue;
    wSum += row.value * pd;
    dSum += pd;
  }
  if (dSum <= 0) return null;
  return Math.round((wSum / dSum) * 10) / 10;
}

export type GprTimeForecastPoint = { x: number; y: number };

/**
 * Устаревшая константа (раньше горизонт +30 дн.). Оставлена для совместимости импортов в UI.
 * @deprecated Прогноз на графике времени строится до конца проекта по датам плана.
 */
export const GPR_FORECAST_HORIZON_DAYS = 30;

export type GprTimeForecastModel = {
  todayIso: string;
  todayMs: number;
  /** Дата последней точки прогноза (конец проекта по оси плана). */
  forecastDateIso: string;
  forecastMs: number;
  factNow: number | null;
  planAtToday: number | null;
  /** Отставание факта от плана на сегодня (п.п.): planAtToday − factNow; &gt; 0 — отстаём от плана. */
  planFactLagPp: number | null;
  tmcPct: number | null;
  tenderPct: number | null;
  /** Прогноз на последней дате (конец серии): plan(конец) − planFactLagPp. */
  forecastValue: number | null;
  forecastReason: string;
  changePct: string | null;
  planSeries: GprTimeForecastPoint[];
  factSeries: GprTimeForecastPoint[];
  /** От «сегодня» (факт) по тем же X, что и план, до последней точки плана: forecast[i] = plan[i] − planFactLagPp. */
  forecastSeries: GprTimeForecastPoint[];
  axisMinMs: number;
  axisMaxMs: number;
  /**
   * Последняя «реальная» дата календаря проекта на оси X — это max из:
   *   endProjectMs (последняя плановая дата ГПР), todayMs, forecastTailEndMs.
   * Диапазон оси (axisMaxMs) расширен дальше для технического буфера справа
   * (см. rightPaddingMs ниже). UI использует dataEndMs, чтобы скрывать подписи
   * месяцев, попадающие в этот буфер — иначе после буфера на оси появляются
   * «лишние» месяцы (например, март 2028 при реальном окончании в ноябре 2027).
   */
  dataEndMs: number;
};

function clampPercent(y: number): number {
  return Math.round(Math.max(0, Math.min(100, y)) * 10) / 10;
}

/**
 * Временная модель для графика «Прогноз ГПР»: план и факт по месяцам; прогноз — от сегодня до конца проекта
 * по тем же датам, что и план: forecast(x) = plan(x) − (planAtToday − factNow).
 * ТМЦ/тендеры — в подсказках и тексте insight (как факторы риска), серия прогноза — от отставания от плана.
 */
export function buildGprTimeForecastModel(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  tenders: Tender[],
  todayIso: string,
  activeProjectPart: ForecastPart,
): GprTimeForecastModel | null {
  // Все задачи ГПР, относящиеся к выбранной части (или ко всему проекту).
  // Берём именно ВСЕ задачи, а не только корневые 2.04/2.05/2.06/2.07 —
  // иначе границы графика, факт и план считаются по корням, у которых planEnd
  // нередко близок к «сегодня», тогда как лист-задачи уходят значительно дальше,
  // и линия прогноза визуально упирается в дату отчёта.
  const scopedTasks = tasksForForecastPart(tasks, activeProjectPart);

  // Реальный диапазон дат ГПР по всем задачам части:
  //   startIso — самый ранний planStart;
  //   endIso   — самый поздний planEnd / factEnd (фактический «потолок» дат ГПР).
  // Если у задач нет дат — отступаем к корневым границам (fallback).
  let startIso: string | null = null;
  let endIso: string | null = null;
  for (const t of scopedTasks) {
    const ps = t.planStart?.trim();
    if (ps && (!startIso || ps < startIso)) startIso = ps;
    const pe = t.planEnd?.trim();
    if (pe && (!endIso || pe > endIso)) endIso = pe;
    const fe = t.factEnd?.trim();
    if (fe && (!endIso || fe > endIso)) endIso = fe;
  }
  if (!startIso || !endIso) {
    const roots = partPlanBounds(tasks, activeProjectPart);
    if (!roots) return null;
    startIso = startIso ?? roots.startIso;
    endIso = endIso ?? roots.endIso;
  }

  const tmcSeries =
    activeProjectPart === "project"
      ? buildGprTmcDependencySeriesProjectWide(tasks, tmcItems, todayIso)
      : buildGprTmcDependencySeries(tasks, tmcItems, todayIso, activeProjectPart);
  const tenderSeries =
    activeProjectPart === "project"
      ? buildGprTenderDependencySeriesProjectWide(tasks, tenders, todayIso)
      : buildGprTenderDependencySeries(tasks, tenders, todayIso, activeProjectPart);

  // Факт/план — взвешенно по ВСЕМ задачам части, чтобы корневой completion=100%
  // при незавершённых лист-задачах не «прятал» реальное отставание.
  const factNow = weightedFactGprAllTasksAtDate(scopedTasks, todayIso, todayIso);
  const planAtToday = weightedPlanGprAllTasksAtDate(scopedTasks, todayIso);
  const planFactLagPp =
    factNow != null && planAtToday != null ? planAtToday - factNow : null;
  const tmcPct = weightedAvgFromStageSeries(
    tmcSeries.map((r) => ({ groupKey: r.groupKey, value: r.tmcSupply })),
    tasks,
    activeProjectPart,
  );
  const tenderPct = weightedAvgFromStageSeries(
    tenderSeries.map((r) => ({ groupKey: r.groupKey, value: r.tenderReadiness })),
    tasks,
    activeProjectPart,
  );

  const todayMs = dateToMs(todayIso);
  const startMs = dateToMs(startIso);
  // endProjectMs — последняя плановая/фактическая дата работ ГПР проекта.
  // Именно она (а не сегодня) задаёт правый предел графика.
  const endProjectMs = dateToMs(endIso);
  const projectDurMs = endProjectMs - startMs;

  // Прогнозная дата завершения проекта.
  // — если факт ещё не 100% и есть отставание (lagPp > 0): сдвиг = lagPp × длительность / 100;
  //   forecastTailEndMs = endProjectMs + сдвиг (с гарантией, что > сегодня, если проект уже
  //   формально просрочен по плану);
  // — если факт ещё не 100%, но lag ≤ 0 (на плане или с опережением): прогноз и так достигает
  //   100% к endProjectMs — отдельный «хвост» не нужен;
  // — если факт уже 100%: прогноз не строим после «сегодня» (требование #8).
  const lagPp = planFactLagPp ?? 0;
  const projectIncomplete = factNow != null && factNow < 100;
  const needsForecastTail = projectIncomplete && lagPp > 0 && projectDurMs > 0;
  const forecastTailEndMs = needsForecastTail
    ? Math.max(endProjectMs, todayMs) + (lagPp / 100) * projectDurMs
    : null;

  // Ось графика покрывает: начало проекта → сегодня → конец проекта/прогноза.
  // todayMs используется ТОЛЬКО как маркер «Сегодня» и нижняя граница оси —
  // он не должен обрезать прогноз справа.
  //
  // Справа резервируем «свободную зону» ≈15% диапазона данных (но не меньше 30 дней).
  // Зачем:
  //   1) Крайняя прогнозная точка не должна упираться в правую границу области
  //      построения (см. UI-требование: ≥5–10% ширины графика как буфер справа).
  //   2) Подпись прогнозной даты завершения (например, «до 16 нояб. 2027»)
  //      должна помещаться рядом с точкой в этом буфере, не накладываясь на линию
  //      и не выходя за правую границу карточки.
  // Расчёт прогноза и положение точек не меняются — меняется ТОЛЬКО диапазон оси X.
  const dataEndMs = Math.max(endProjectMs, todayMs, forecastTailEndMs ?? 0);
  const dataRangeMs = dataEndMs - startMs;
  const rightPaddingMs =
    dataRangeMs > 0
      ? Math.max(dataRangeMs * 0.15, 30 * 86400000)
      : 30 * 86400000;
  const axisEndMs = dataEndMs + rightPaddingMs;
  const axisMinMs = Math.min(startMs, todayMs) - 5 * 86400000;

  const monthMs = eachMonthStartMs(startIso, msToIso(axisEndMs));

  const planSeries: GprTimeForecastPoint[] = [];
  for (const ms of monthMs) {
    const y = weightedPlanGprAllTasksAtDate(scopedTasks, msToIso(ms));
    if (y != null) planSeries.push({ x: ms, y });
  }

  const denom = todayMs - startMs;
  const factSeries: GprTimeForecastPoint[] = [];
  for (const ms of monthMs) {
    if (ms > todayMs) break;
    if (factNow == null) continue;
    const y =
      denom <= 0
        ? factNow
        : Math.round(factNow * Math.min(1, Math.max(0, (ms - startMs) / denom)) * 10) / 10;
    factSeries.push({ x: ms, y });
  }
  const hasTodayFact = factSeries.some((p) => p.x === todayMs);
  if (factNow != null && !hasTodayFact) {
    factSeries.push({ x: todayMs, y: factNow });
  }
  factSeries.sort((a, b) => a.x - b.x);

  const forecastSeries: GprTimeForecastPoint[] = [];
  if (factNow != null) {
    forecastSeries.push({ x: todayMs, y: factNow });

    // Прогноз строим только если факт ещё не 100% (#8): иначе оставляем одну точку «сегодня».
    if (projectIncomplete) {
      // Основной участок прогноза — повторяет форму плановой кривой (по всем задачам части)
      // со смещением вниз на текущий lagPp. Если есть «хвост» до 100% — останавливаемся
      // на endProjectMs и далее достраиваем линейный участок до forecastTailEndMs.
      // Если же lag ≤ 0, прогноз и так достигает 100% на endProjectMs — break не нужен.
      for (const p of planSeries) {
        if (p.x <= todayMs) continue;
        if (forecastTailEndMs != null && p.x > endProjectMs) break;
        const y = clampPercent(p.y - lagPp);
        forecastSeries.push({ x: p.x, y });
      }

      // Линейный «хвост» от последней точки прогноза до достижения 100%
      // на forecastTailEndMs. Промежуточные точки расставляем по тем же месяцам,
      // что и ось графика, чтобы тики оси оставались равномерными.
      if (forecastTailEndMs != null) {
        const lastInside = forecastSeries[forecastSeries.length - 1]!;
        if (forecastTailEndMs > lastInside.x) {
          const slope = (100 - lastInside.y) / (forecastTailEndMs - lastInside.x);
          for (const ms of monthMs) {
            if (ms <= lastInside.x) continue;
            if (ms >= forecastTailEndMs) break;
            const y = clampPercent(lastInside.y + slope * (ms - lastInside.x));
            forecastSeries.push({ x: ms, y });
          }
          forecastSeries.push({ x: forecastTailEndMs, y: 100 });
        }
      }
    }
  }

  let forecastValue: number | null = null;
  let forecastMs = todayMs;
  let forecastDateIso = todayIso;
  if (forecastSeries.length > 0) {
    const last = forecastSeries[forecastSeries.length - 1]!;
    forecastValue = last.y;
    forecastMs = last.x;
    forecastDateIso = msToIso(last.x);
  }

  const forecastReason = buildGprForecastInsight(factNow, forecastValue, tmcPct, tenderPct);

  let changePct: string | null = null;
  if (factNow != null && forecastValue != null && factNow !== 0) {
    const ch = ((forecastValue - factNow) / factNow) * 100;
    changePct = `${ch > 0 ? "+" : ""}${ch.toFixed(1)}%`;
  }

  return {
    todayIso,
    todayMs,
    forecastDateIso,
    forecastMs,
    factNow,
    planAtToday,
    planFactLagPp,
    tmcPct,
    tenderPct,
    forecastValue,
    forecastReason,
    changePct,
    planSeries,
    factSeries,
    forecastSeries,
    axisMinMs,
    axisMaxMs: axisEndMs,
    dataEndMs,
  };
}

const TIMELINE_MONTH_SHORT_RU = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек",
] as const;

export function formatGprTimelineMonthLabel(monthMs: number): string {
  const d = new Date(monthMs);
  return `${TIMELINE_MONTH_SHORT_RU[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}

function tasksForForecastPart(tasks: GPRTask[], part: ForecastPart): GPRTask[] {
  if (part === "project") return tasks;
  const partId = PROJECT_PART_KEY_TO_ID[part];
  if (partId == null) return [];
  return tasks.filter((t) => t.partId === partId);
}

function tendersForForecastPart(tenders: Tender[], part: ForecastPart): Tender[] {
  if (part === "project") return tenders;
  const partId = PROJECT_PART_KEY_TO_ID[part];
  if (partId == null) return [];
  return tenders.filter((t) => t.partId === partId);
}

function partTimelineBounds(
  tasks: GPRTask[],
  tenders: Tender[],
  part: ForecastPart,
  todayIso: string,
): { startIso: string; endIso: string } | null {
  const scopedTasks = tasksForForecastPart(tasks, part);
  const scopedTenders = tendersForForecastPart(tenders, part);
  let minS: string | null = null;
  let maxE: string | null = null;

  const consider = (iso: string | null | undefined) => {
    const s = iso?.trim();
    if (!s) return;
    if (!minS || s < minS) minS = s;
    if (!maxE || s > maxE) maxE = s;
  };

  for (const t of scopedTasks) {
    consider(t.planStart);
    consider(t.planEnd);
    consider(t.factStart);
    consider(t.factEnd);
  }
  for (const t of scopedTenders) {
    consider(t.planStart);
    consider(t.planContractDate);
    consider(t.factStart);
    consider(t.factContractDate);
  }

  if (!minS || !maxE) {
    const roots = partPlanBounds(scopedTasks, part);
    if (!roots) return null;
    minS = roots.startIso;
    maxE = roots.endIso;
  }

  if (todayIso > maxE) maxE = todayIso;
  return { startIso: minS, endIso: maxE };
}

function endOfMonthIso(monthStartMs: number): string {
  const d = new Date(monthStartMs);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return msToIso(d.getTime());
}

function factProgressAtDate(task: GPRTask, dateIso: string, todayIso: string): number {
  const completion = Math.min(100, Math.max(0, Number(task.completion) || 0));
  if (dateIso >= todayIso) return completion;

  const ps = task.planStart?.trim();
  const pe = task.planEnd?.trim();
  const fs = task.factStart?.trim();
  const fe = task.factEnd?.trim();

  if (fs && fe) {
    const t = dateToMs(dateIso);
    const t0 = dateToMs(fs);
    const t1 = dateToMs(fe);
    if (t <= t0) return 0;
    if (t >= t1) return completion;
    if (t1 <= t0) return completion;
    return Math.round((completion * (t - t0)) / (t1 - t0));
  }

  if (fs) {
    const t = dateToMs(dateIso);
    const t0 = dateToMs(fs);
    const tToday = dateToMs(todayIso);
    if (t < t0) return 0;
    if (tToday <= t0) return completion;
    return Math.round((completion * (t - t0)) / (tToday - t0));
  }

  if (ps && pe) {
    const pp = plannedProgressBySchedule(task, dateIso);
    if (pp != null) return Math.min(completion, pp);
  }

  return 0;
}

function weightedPlanGprAllTasksAtDate(scopedTasks: GPRTask[], dateIso: string): number | null {
  let wSum = 0;
  let dSum = 0;
  for (const t of scopedTasks) {
    const pd = durationDays(t.planStart, t.planEnd);
    if (!Number.isFinite(pd) || pd <= 0) continue;
    const pp = plannedProgressBySchedule(t, dateIso);
    if (pp == null) continue;
    wSum += pp * pd;
    dSum += pd;
  }
  if (dSum <= 0) return null;
  return Math.round((wSum / dSum) * 10) / 10;
}

function weightedFactGprAllTasksAtDate(
  scopedTasks: GPRTask[],
  dateIso: string,
  todayIso: string,
): number | null {
  if (dateIso > todayIso) return null;
  let wSum = 0;
  let dSum = 0;
  for (const t of scopedTasks) {
    const pd = durationDays(t.planStart, t.planEnd);
    if (!Number.isFinite(pd) || pd <= 0) continue;
    const fp = factProgressAtDate(t, dateIso, todayIso);
    wSum += fp * pd;
    dSum += pd;
  }
  if (dSum <= 0) return null;
  return Math.round((wSum / dSum) * 10) / 10;
}

function tenderPlanProgressAtDate(tender: Tender, dateIso: string): number | null {
  const ps = tender.planStart?.trim();
  const pe = tender.planContractDate?.trim();
  if (ps && pe) {
    return plannedProgressBySchedule(
      { planStart: ps, planEnd: pe } as GPRTask,
      dateIso,
    );
  }
  if (pe) {
    return dateToMs(dateIso) >= dateToMs(pe) ? 100 : 0;
  }
  return null;
}

function tenderFactProgressAtDate(tender: Tender, dateIso: string, todayIso: string): number | null {
  if (dateIso > todayIso) return null;
  const fc = tender.factContractDate?.trim();
  if (fc) {
    return dateToMs(dateIso) >= dateToMs(fc) ? 100 : 0;
  }
  const fs = tender.factStart?.trim();
  const pe = tender.planContractDate?.trim();
  if (fs && pe) {
    const stub: GPRTask = {
      id: tender.id,
      globalTaskId: tender.id,
      code: tender.code,
      name: tender.name,
      partId: tender.partId,
      planStart: fs,
      planEnd: pe,
      completion: 0,
    };
    return factProgressAtDate(stub, dateIso, todayIso);
  }
  return 0;
}

/**
 * Дата начала первого планового тендера (ISO YYYY-MM-DD) среди переданного набора.
 * Используется как левая граница линии «План тендеров» — до этой даты тендерной программы
 * фактически нет, поэтому линия не должна тянуться по 0 % с начала календаря проекта.
 *
 * Источник: `planStart`; если у тендера нет планового старта, берётся `planContractDate`
 * (тогда тендер трактуется как точечное событие на дату договора).
 *
 * Возвращает `null`, если ни у одного тендера в наборе нет ни `planStart`, ни `planContractDate`.
 */
function firstTenderPlanStartIso(tenders: Tender[]): string | null {
  let min: string | null = null;
  for (const t of tenders) {
    const candidate = t.planStart?.trim() || t.planContractDate?.trim();
    if (!candidate) continue;
    if (!min || candidate < min) min = candidate;
  }
  return min;
}

function weightedPlanTendersAtDate(scopedTenders: Tender[], dateIso: string): number | null {
  let wSum = 0;
  let dSum = 0;
  for (const t of scopedTenders) {
    const pd = durationDays(t.planStart, t.planContractDate);
    const w = pd != null && pd > 0 ? pd : 1;
    const pp = tenderPlanProgressAtDate(t, dateIso);
    if (pp == null) continue;
    wSum += pp * w;
    dSum += w;
  }
  if (dSum <= 0) return null;
  return Math.round((wSum / dSum) * 10) / 10;
}

function weightedFactTendersAtDate(
  scopedTenders: Tender[],
  dateIso: string,
  todayIso: string,
): number | null {
  if (dateIso > todayIso) return null;
  let wSum = 0;
  let dSum = 0;
  for (const t of scopedTenders) {
    const pd = durationDays(t.planStart, t.planContractDate);
    const w = pd != null && pd > 0 ? pd : 1;
    const fp = tenderFactProgressAtDate(t, dateIso, todayIso);
    if (fp == null) continue;
    wSum += fp * w;
    dSum += w;
  }
  if (dSum <= 0) return null;
  return Math.round((wSum / dSum) * 10) / 10;
}

export type GprTenderDependencyTimelinePoint = {
  monthMs: number;
  monthLabel: string;
  planGpr: number | null;
  factGpr: number | null;
  planTenders: number | null;
  factTenders: number | null;
};

export type GprTenderDependencyTimelineModel = {
  todayIso: string;
  todayMs: number;
  points: GprTenderDependencyTimelinePoint[];
  planSeries: GprTimeForecastPoint[];
  factSeries: GprTimeForecastPoint[];
  planTenderSeries: GprTimeForecastPoint[];
  factTenderSeries: GprTimeForecastPoint[];
  axisMinMs: number;
  axisMaxMs: number;
};

/**
 * Временной ряд для графика «ГПР — тендеры»: ось X — месяцы календаря проекта.
 */
export function buildGprTenderDependencyTimelineModel(
  tasks: GPRTask[],
  tenders: Tender[],
  todayIso: string,
  activeProjectPart: ForecastPart,
): GprTenderDependencyTimelineModel | null {
  const bounds = partTimelineBounds(tasks, tenders, activeProjectPart, todayIso);
  if (!bounds) return null;

  const scopedTasks = tasksForForecastPart(tasks, activeProjectPart);
  const scopedTenders = tendersForForecastPart(tenders, activeProjectPart);
  const todayMs = dateToMs(todayIso);
  const startMs = dateToMs(bounds.startIso);
  const endPlanMs = dateToMs(bounds.endIso);
  const axisEndMs = Math.max(endPlanMs, todayMs) + 10 * 86400000;
  const axisMinMs = Math.min(startMs, todayMs) - 5 * 86400000;

  const monthMsList = eachMonthStartMs(bounds.startIso, msToIso(axisEndMs));
  const points: GprTenderDependencyTimelinePoint[] = [];
  const planSeries: GprTimeForecastPoint[] = [];
  const factSeries: GprTimeForecastPoint[] = [];
  const planTenderSeries: GprTimeForecastPoint[] = [];
  const factTenderSeries: GprTimeForecastPoint[] = [];

  // Линия «План тендеров» не должна тянуться по 0 % до даты начала первого планового тендера —
  // без этой границы `weightedPlanTendersAtDate` возвращает 0 для каждого месяца до старта
  // тендерной программы (т.к. `plannedProgressBySchedule` отдаёт 0 для дат раньше planStart),
  // и chart.js рисует ложный горизонтальный участок по 0 % с начала шкалы.
  const firstTenderPlanIso = firstTenderPlanStartIso(scopedTenders);
  const firstTenderPlanMs = firstTenderPlanIso ? dateToMs(firstTenderPlanIso) : null;

  for (const monthMs of monthMsList) {
    const monthEndIso = endOfMonthIso(monthMs);
    const monthEndMs = dateToMs(monthEndIso);
    const planGpr = weightedPlanGprAllTasksAtDate(scopedTasks, monthEndIso);
    const factGpr = weightedFactGprAllTasksAtDate(scopedTasks, monthEndIso, todayIso);
    const planTenders = weightedPlanTendersAtDate(scopedTenders, monthEndIso);
    const factTenders = weightedFactTendersAtDate(scopedTenders, monthEndIso, todayIso);

    points.push({
      monthMs,
      monthLabel: formatGprTimelineMonthLabel(monthMs),
      planGpr,
      factGpr,
      planTenders,
      factTenders,
    });

    if (planGpr != null) planSeries.push({ x: monthMs, y: planGpr });
    if (factGpr != null && monthMs <= todayMs) factSeries.push({ x: monthMs, y: factGpr });
    if (
      planTenders != null &&
      (firstTenderPlanMs == null || monthEndMs >= firstTenderPlanMs)
    ) {
      planTenderSeries.push({ x: monthMs, y: planTenders });
    }
    if (factTenders != null && monthMs <= todayMs) {
      factTenderSeries.push({ x: monthMs, y: factTenders });
    }
  }

  if (factSeries.length > 0) {
    const hasToday = factSeries.some((p) => p.x === todayMs);
    const factToday = weightedFactGprAllTasksAtDate(scopedTasks, todayIso, todayIso);
    if (factToday != null && !hasToday) {
      factSeries.push({ x: todayMs, y: factToday });
      factSeries.sort((a, b) => a.x - b.x);
    }
  }

  const factTendersToday = weightedFactTendersAtDate(scopedTenders, todayIso, todayIso);
  if (factTendersToday != null && !factTenderSeries.some((p) => p.x === todayMs)) {
    factTenderSeries.push({ x: todayMs, y: factTendersToday });
    factTenderSeries.sort((a, b) => a.x - b.x);
  }

  if (points.length === 0) return null;

  return {
    todayIso,
    todayMs,
    points,
    planSeries,
    factSeries,
    planTenderSeries,
    factTenderSeries,
    axisMinMs,
    axisMaxMs: axisEndMs,
  };
}

/** KPI графика «ГПР — тендеры» на дату отчёта (%). */
export function gprTenderDependencyKpiAtDate(
  tasks: GPRTask[],
  tenders: Tender[],
  todayIso: string,
  part: ForecastPart,
): {
  planGpr: number | null;
  factGpr: number | null;
  planTenders: number | null;
  factTenders: number | null;
} {
  const scopedTasks = tasksForForecastPart(tasks, part);
  const scopedTenders = tendersForForecastPart(tenders, part);
  return {
    planGpr: weightedPlanGprAllTasksAtDate(scopedTasks, todayIso),
    factGpr: weightedFactGprAllTasksAtDate(scopedTasks, todayIso, todayIso),
    planTenders: weightedPlanTendersAtDate(scopedTenders, todayIso),
    factTenders: weightedFactTendersAtDate(scopedTenders, todayIso, todayIso),
  };
}
