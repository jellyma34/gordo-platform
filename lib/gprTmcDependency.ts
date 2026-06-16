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
  const branchRoots = aggregateRootCodesForPart(part, tasks);
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
function listLevel1GprWorksForTmcChart(tasks: GPRTask[]): GPRTask[] {
  return tasks
    .filter((t) => gprWbsLevelFromCode(normalizeGprCodeFinal(t.code), t.level) === 1)
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
function effectiveTmcGprCode(item: TMCItem): string {
  const fromItem = normalizeGprCodeFinal(item.itemCode || "");
  const fromStage = normalizeGprCodeFinal(item.gprStage || "");
  const stageEncodesCode = fromStage.split(".").filter(Boolean).length >= 2;
  if (stageEncodesCode) return fromStage;
  return fromItem;
}

/** Принадлежит ли позиция ТМЦ работе ГПР по шифру: `itemCode === workCode || itemCode.startsWith(workCode + ".")`. */
function tmcItemBelongsToWorkCode(item: TMCItem, workCode: string): boolean {
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
  const branchRoots = aggregateRootCodesForPart(activeProjectPart, tasks);
  let workTasks = listLevel2GprWorksForTmcChart(tasks, activeProjectPart);
  if (workTasks.length === 0) {
    workTasks = listLevel1GprWorksForTmcChart(tasks);
  }
  if (workTasks.length === 0) {
    return buildGprTmcDependencySeries(tasks, tmcItems, todayIso, activeProjectPart).map((row) => ({
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
  const bounds = partPlanBounds(tasks, activeProjectPart);
  if (!bounds) return null;

  const tmcSeries =
    activeProjectPart === "project"
      ? buildGprTmcDependencySeriesProjectWide(tasks, tmcItems, todayIso)
      : buildGprTmcDependencySeries(tasks, tmcItems, todayIso, activeProjectPart);
  const tenderSeries =
    activeProjectPart === "project"
      ? buildGprTenderDependencySeriesProjectWide(tasks, tenders, todayIso)
      : buildGprTenderDependencySeries(tasks, tenders, todayIso, activeProjectPart);

  const factNow = weightedFactGprPart(tasks, activeProjectPart);
  const planAtToday = weightedPlanGprPartAtDate(tasks, activeProjectPart, todayIso);
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
  const startMs = dateToMs(bounds.startIso);
  const endPlanMs = dateToMs(bounds.endIso);
  const axisEndMs = Math.max(endPlanMs, todayMs) + 10 * 86400000;
  const axisMinMs = Math.min(startMs, todayMs) - 5 * 86400000;

  const monthMs = eachMonthStartMs(bounds.startIso, msToIso(axisEndMs));

  const planSeries: GprTimeForecastPoint[] = [];
  for (const ms of monthMs) {
    const y = weightedPlanGprPartAtDate(tasks, activeProjectPart, msToIso(ms));
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
    const delayPp = planFactLagPp ?? 0;
    forecastSeries.push({ x: todayMs, y: factNow });
    for (const p of planSeries) {
      if (p.x <= todayMs) continue;
      const y = clampPercent(p.y - delayPp);
      forecastSeries.push({ x: p.x, y });
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

  for (const monthMs of monthMsList) {
    const monthEndIso = endOfMonthIso(monthMs);
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
    if (planTenders != null) planTenderSeries.push({ x: monthMs, y: planTenders });
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
