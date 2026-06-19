import {
  buildGprTmcDependencyChartSeries,
  tmcItemBelongsToWorkCode,
} from "@/lib/gprTmcDependency";
import { computeGprStageFactCompletionChartPercent } from "@/lib/gprStageCompletion";
import {
  calculateDeviation,
  getPlannedProgressPercent,
  normalizeGprCodeFinal,
  partIdToProjectPartKey,
  type ConstructionObjectScope,
  type GPRTask,
  type ProjectPartKey,
} from "@/lib/gprUtils";
import {
  classifyTmcArmatureByGprStage,
  computeTmcRemainingPercent,
  isTmcArmatureMaterial,
  TMC_ARMATURE_ABOVE_LABEL,
  TMC_ARMATURE_BELOW_LABEL,
} from "@/lib/tmcPresentationAnalytics";
import { filterTmcByProjectPart, type TMCItem } from "@/lib/tmcData";
import { hasTenderSignedContract, resolveTenderCycleStatus, type Tender } from "@/lib/tenderData";

export type GprProcurementLagRiskLevel = "high" | "medium" | "low";

export type GprProcurementLagRiskRow = {
  rowKey: string;
  stageCode: string;
  stageTitle: string;
  planPct: number | null;
  factPct: number | null;
  deviationPct: number | null;
  /** Отставание этапа (п.п.): max(0, план − факт). */
  lagPp: number;
  openProcurementMaterials: string[];
  tmcLinkLabel: string;
  unclosedContractCount: number;
  contractsLinkLabel: string;
  riskLevel: GprProcurementLagRiskLevel;
  riskLabel: string;
  hasOpenProcurement: boolean;
  hasOpenContracts: boolean;
  hasResourceConstraints: boolean;
};

export const GPR_PROCUREMENT_LAG_HIGH_PP = 10;
export const GPR_PROCUREMENT_LAG_MEDIUM_PP = 5;

export type GprStageLagCauseType = "tmc_deficit" | "missing_contracts" | "both" | "not_established";

export type GprStageDependencyStatus = "critical" | "medium" | "weak" | "not_confirmed";

export type GprStageTmcDeficitItem = {
  material: string;
  remainingPercent: number;
};

export type GprStageLagCauseRow = {
  rowKey: string;
  stageCode: string;
  stageTitle: string;
  planPct: number | null;
  factPct: number | null;
  deviationPct: number | null;
  lagPp: number;
  causeType: GprStageLagCauseType;
  causeLabel: string;
  tmcDeficits: GprStageTmcDeficitItem[];
  tmcLinkDefined: boolean;
  unclosedContractCount: number;
  contractsDataAvailable: boolean;
  dependencyStatus: GprStageDependencyStatus;
  dependencyLabel: string;
  /** Сводный индекс влияния ресурсов на отставание (0–100). */
  influenceScore: number;
};

function tmcMaterialBucketKey(item: TMCItem): string {
  const name = item.name.trim() || "Без наименования";
  if (!isTmcArmatureMaterial(name)) return name;
  const group = classifyTmcArmatureByGprStage(item.gprStage, item.itemCode);
  return group === "below" ? TMC_ARMATURE_BELOW_LABEL : TMC_ARMATURE_ABOVE_LABEL;
}

function codeBelongsToWork(code: string, workCode: string): boolean {
  const c = normalizeGprCodeFinal(code);
  const wc = normalizeGprCodeFinal(workCode);
  if (!c || !wc) return false;
  return c === wc || c.startsWith(`${wc}.`);
}

function isTenderUnclosed(t: Tender): boolean {
  const status = resolveTenderCycleStatus(t);
  if (status === "cancelled") return false;
  if (!hasTenderSignedContract(t)) return true;
  return status === "contractNotConcluded";
}

function listTmcDeficitsForWork(
  items: TMCItem[],
  workCode: string,
): {
  deficits: GprStageTmcDeficitItem[];
  hasLinkedTmc: boolean;
  maxRemainingPercent: number;
} {
  const linked = items.filter((item) => tmcItemBelongsToWorkCode(item, workCode));
  if (linked.length === 0) {
    return { deficits: [], hasLinkedTmc: false, maxRemainingPercent: 0 };
  }

  const buckets = new Map<string, { volumePlan: number; volumeFact: number }>();
  for (const item of linked) {
    const key = tmcMaterialBucketKey(item);
    const cur = buckets.get(key) ?? { volumePlan: 0, volumeFact: 0 };
    cur.volumePlan += item.volumePlan;
    cur.volumeFact += item.volumeFact;
    buckets.set(key, cur);
  }

  const deficits: GprStageTmcDeficitItem[] = [];
  let maxRemainingPercent = 0;
  for (const [material, bucket] of buckets) {
    const remainingQty = Math.max(bucket.volumePlan - bucket.volumeFact, 0);
    const remainingPercent = computeTmcRemainingPercent(bucket.volumePlan, remainingQty);
    if (remainingQty > 0 || remainingPercent > 0) {
      deficits.push({ material, remainingPercent });
      if (remainingPercent > maxRemainingPercent) maxRemainingPercent = remainingPercent;
    }
  }

  deficits.sort((a, b) => b.remainingPercent - a.remainingPercent || a.material.localeCompare(b.material, "ru"));
  return { deficits, hasLinkedTmc: true, maxRemainingPercent };
}

/** Связанный дефицит ТМЦ для этапа ГПР (для блока «Отклонения по этапам»). */
export function getGprStageTmcDeficitDisplay(
  items: TMCItem[],
  workCode: string,
): { material: string; remainingPercent: number } | null {
  const { deficits, hasLinkedTmc } = listTmcDeficitsForWork(items, workCode);
  if (!hasLinkedTmc || deficits.length === 0) return null;
  return deficits[0] ?? null;
}

function listOpenProcurementMaterialsForWork(
  items: TMCItem[],
  workCode: string,
): { materials: string[]; hasLinkedTmc: boolean } {
  const { deficits, hasLinkedTmc } = listTmcDeficitsForWork(items, workCode);
  return { materials: deficits.map((d) => d.material), hasLinkedTmc };
}

function listUnclosedContractsForWork(tenders: Tender[], workCode: string): {
  count: number;
  hasLinkedTenders: boolean;
} {
  const linked = tenders.filter((t) => codeBelongsToWork(t.code, workCode));
  if (linked.length === 0) {
    return { count: 0, hasLinkedTenders: false };
  }
  const count = linked.filter(isTenderUnclosed).length;
  return { count, hasLinkedTenders: true };
}

export function assessGprProcurementLagRiskLevel(
  lagPp: number,
  hasOpenProcurement: boolean,
  hasOpenContracts: boolean,
): GprProcurementLagRiskLevel {
  const hasResourceConstraints = hasOpenProcurement || hasOpenContracts;
  if (lagPp > GPR_PROCUREMENT_LAG_HIGH_PP && hasResourceConstraints) return "high";
  if (lagPp >= GPR_PROCUREMENT_LAG_MEDIUM_PP && lagPp <= GPR_PROCUREMENT_LAG_HIGH_PP && hasResourceConstraints) {
    return "medium";
  }
  return "low";
}

export function gprProcurementLagRiskLabel(level: GprProcurementLagRiskLevel): string {
  if (level === "high") return "Высокий";
  if (level === "medium") return "Средний";
  return "Низкий";
}

function formatTmcLinkLabel(materials: string[], hasLinkedTmc: boolean): string {
  if (!hasLinkedTmc) return "Связь не определена";
  if (materials.length === 0) return "—";
  return materials.join(", ");
}

function formatContractsLinkLabel(count: number, hasLinkedTenders: boolean): string {
  if (!hasLinkedTenders) return "Нет данных";
  if (count <= 0) return "—";
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "не заключён"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "не заключено"
        : "не заключено";
  return `${count} ${word}`;
}

function buildRowForWork(
  task: GPRTask,
  allTasks: GPRTask[],
  tmcItems: TMCItem[],
  tenders: Tender[],
  asOf: Date,
): GprProcurementLagRiskRow {
  const workCode = normalizeGprCodeFinal(task.code);
  const planPct = getPlannedProgressPercent(task, asOf);
  const deviationPct = calculateDeviation(task, asOf);
  const factPct =
    planPct !== null && deviationPct !== null
      ? Math.round((planPct + deviationPct) * 10) / 10
      : computeGprStageFactCompletionChartPercent(allTasks, task, asOf);
  const lagPp =
    deviationPct !== null && deviationPct < 0
      ? Math.round(-deviationPct * 10) / 10
      : planPct !== null
        ? Math.max(0, Math.round((planPct - factPct) * 10) / 10)
        : 0;

  const { materials, hasLinkedTmc } = listOpenProcurementMaterialsForWork(tmcItems, workCode);
  const { count: unclosedContractCount, hasLinkedTenders } = listUnclosedContractsForWork(
    tenders,
    workCode,
  );
  const hasOpenProcurement = materials.length > 0;
  const hasOpenContracts = unclosedContractCount > 0;
  const riskLevel = assessGprProcurementLagRiskLevel(lagPp, hasOpenProcurement, hasOpenContracts);

  return {
    rowKey: `${task.partId ?? 0}|${workCode}`,
    stageCode: workCode,
    stageTitle: task.name?.trim() || workCode,
    planPct,
    factPct,
    deviationPct,
    lagPp,
    openProcurementMaterials: materials,
    tmcLinkLabel: formatTmcLinkLabel(materials, hasLinkedTmc),
    unclosedContractCount,
    contractsLinkLabel: formatContractsLinkLabel(unclosedContractCount, hasLinkedTenders),
    riskLevel,
    riskLabel: gprProcurementLagRiskLabel(riskLevel),
    hasOpenProcurement,
    hasOpenContracts,
    hasResourceConstraints: hasOpenProcurement || hasOpenContracts,
  };
}

function riskSortKey(level: GprProcurementLagRiskLevel): number {
  if (level === "high") return 0;
  if (level === "medium") return 1;
  return 2;
}

function sortGprProcurementLagRiskRows(rows: GprProcurementLagRiskRow[]): GprProcurementLagRiskRow[] {
  return [...rows].sort((a, b) => {
    const riskCmp = riskSortKey(a.riskLevel) - riskSortKey(b.riskLevel);
    if (riskCmp !== 0) return riskCmp;
    if (b.lagPp !== a.lagPp) return b.lagPp - a.lagPp;
    return a.stageCode.localeCompare(b.stageCode, "ru", { numeric: true });
  });
}

function workTasksFromDependencySeries(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  todayIso: string,
  part: ProjectPartKey,
): GPRTask[] {
  const series = buildGprTmcDependencyChartSeries(tasks, tmcItems, todayIso, part);
  const taskByCode = new Map<string, GPRTask>();
  for (const t of tasks) {
    taskByCode.set(`${t.partId ?? 0}|${normalizeGprCodeFinal(t.code)}`, t);
  }
  const out: GPRTask[] = [];
  for (const point of series) {
    const code = normalizeGprCodeFinal(point.stageShort);
    const match =
      tasks.find((t) => normalizeGprCodeFinal(t.code) === code) ??
      taskByCode.get(`1|${code}`) ??
      taskByCode.get(`2|${code}`);
    if (match) out.push(match);
  }
  return out;
}

function computeGprProcurementLagRiskForPart(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  tenders: Tender[],
  asOf: Date,
  part: ProjectPartKey,
): GprProcurementLagRiskRow[] {
  const todayIso = asOf.toISOString().slice(0, 10);
  const partTasks = tasks.filter((t) => (t.partId ?? 1) === (part === "residential" ? 1 : 2));
  const partTmc = filterTmcByProjectPart(tmcItems, part);
  const partTenders = tenders.filter((t) => t.partId === (part === "residential" ? 1 : 2));
  const workTasks = workTasksFromDependencySeries(partTasks, partTmc, todayIso, part);

  return workTasks.map((task) => buildRowForWork(task, partTasks, partTmc, partTenders, asOf));
}

/** Зависимость отставания ГПР от закупок и договоров. */
export function computeGprProcurementLagRisk(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  tenders: Tender[],
  scope: ConstructionObjectScope,
  asOf: Date = new Date(),
): GprProcurementLagRiskRow[] {
  if (scope === "project") {
    const residential = computeGprProcurementLagRiskForPart(
      tasks,
      tmcItems,
      tenders,
      asOf,
      "residential",
    );
    const parking = computeGprProcurementLagRiskForPart(tasks, tmcItems, tenders, asOf, "parking");
    return sortGprProcurementLagRiskRows([...residential, ...parking]);
  }

  const part = partIdToProjectPartKey(scope);
  return sortGprProcurementLagRiskRows(
    computeGprProcurementLagRiskForPart(tasks, tmcItems, tenders, asOf, part),
  );
}

const GPR_STAGE_CAUSE_LABELS: Record<GprStageLagCauseType, string> = {
  tmc_deficit: "Дефицит ТМЦ",
  missing_contracts: "Отсутствие договоров",
  both: "Дефицит ТМЦ и отсутствие договоров",
  not_established: "Причина не установлена",
};

const GPR_STAGE_DEPENDENCY_LABELS: Record<GprStageDependencyStatus, string> = {
  critical: "Критичная зависимость",
  medium: "Средняя зависимость",
  weak: "Слабая зависимость",
  not_confirmed: "Не подтверждено",
};

export function gprStageLagCauseLabel(cause: GprStageLagCauseType): string {
  return GPR_STAGE_CAUSE_LABELS[cause];
}

export function gprStageDependencyStatusLabel(status: GprStageDependencyStatus): string {
  return GPR_STAGE_DEPENDENCY_LABELS[status];
}

/** Цвет бейджа итогового статуса зависимости. */
export function gprStageDependencyStatusColor(status: GprStageDependencyStatus): string {
  if (status === "critical") return "#ef4444";
  if (status === "medium") return "#eab308";
  if (status === "weak") return "#f97316";
  return "#22c55e";
}

/**
 * Индекс влияния ресурсов на отставание этапа (0–100).
 * influence = lagPp×0.45 + maxTmcRemaining×0.40 + contractPressure×0.15
 * contractPressure = min(100, unclosedContracts × 25) при наличии тендеров по этапу.
 */
export function computeGprStageInfluenceScore(
  lagPp: number,
  maxTmcRemainingPercent: number,
  unclosedContractCount: number,
  hasTmcDeficit: boolean,
  hasContractGap: boolean,
): number {
  const tmcPart = hasTmcDeficit ? maxTmcRemainingPercent * 0.4 : 0;
  const contractPart = hasContractGap ? Math.min(100, unclosedContractCount * 25) * 0.15 : 0;
  const lagPart = Math.min(100, lagPp) * 0.45;
  return Math.round((lagPart + tmcPart + contractPart) * 10) / 10;
}

/** Подтверждённая причина отставания по ресурсным ограничениям. */
export function resolveGprStageLagCauseType(
  lagPp: number,
  hasTmcDeficit: boolean,
  hasContractGap: boolean,
): GprStageLagCauseType {
  if (lagPp <= 0) return "not_established";
  if (hasTmcDeficit && hasContractGap) return "both";
  if (hasTmcDeficit) return "tmc_deficit";
  if (hasContractGap) return "missing_contracts";
  return "not_established";
}

/**
 * Итоговый статус зависимости этапа от ТМЦ/договоров.
 * Критичная: lag > 10 п.п. и (обе причины | max ТМЦ ≥ 50% | ≥ 2 договоров).
 * Средняя: lag ≥ 5 п.п. и подтверждённая причина.
 * Слабая: lag > 0 и подтверждённая причина, но ниже порогов средней/критичной.
 */
export function assessGprStageDependencyStatus(
  lagPp: number,
  causeType: GprStageLagCauseType,
  maxTmcRemainingPercent: number,
  unclosedContractCount: number,
): GprStageDependencyStatus {
  if (lagPp <= 0 || causeType === "not_established") return "not_confirmed";

  const severeTmc = maxTmcRemainingPercent >= 50;
  const moderateTmc = maxTmcRemainingPercent >= 25;

  if (lagPp > GPR_PROCUREMENT_LAG_HIGH_PP && (causeType === "both" || severeTmc || unclosedContractCount >= 2)) {
    return "critical";
  }
  if (lagPp >= GPR_PROCUREMENT_LAG_MEDIUM_PP && (causeType === "both" || moderateTmc || unclosedContractCount >= 1)) {
    return "medium";
  }
  return "weak";
}

function buildGprStageLagCauseRow(
  task: GPRTask,
  allTasks: GPRTask[],
  tmcItems: TMCItem[],
  tenders: Tender[],
  asOf: Date,
): GprStageLagCauseRow {
  const base = buildRowForWork(task, allTasks, tmcItems, tenders, asOf);
  const { deficits, hasLinkedTmc, maxRemainingPercent } = listTmcDeficitsForWork(
    tmcItems,
    base.stageCode,
  );
  const { count: unclosedContractCount, hasLinkedTenders } = listUnclosedContractsForWork(
    tenders,
    base.stageCode,
  );
  const hasTmcDeficit = deficits.length > 0;
  const hasContractGap = unclosedContractCount > 0;
  const causeType = resolveGprStageLagCauseType(base.lagPp, hasTmcDeficit, hasContractGap);
  const dependencyStatus = assessGprStageDependencyStatus(
    base.lagPp,
    causeType,
    maxRemainingPercent,
    unclosedContractCount,
  );
  const influenceScore = computeGprStageInfluenceScore(
    base.lagPp,
    maxRemainingPercent,
    unclosedContractCount,
    hasTmcDeficit,
    hasContractGap,
  );

  return {
    rowKey: base.rowKey,
    stageCode: base.stageCode,
    stageTitle: base.stageTitle,
    planPct: base.planPct,
    factPct: base.factPct,
    deviationPct: base.deviationPct,
    lagPp: base.lagPp,
    causeType,
    causeLabel: gprStageLagCauseLabel(causeType),
    tmcDeficits: deficits,
    tmcLinkDefined: hasLinkedTmc,
    unclosedContractCount,
    contractsDataAvailable: hasLinkedTenders,
    dependencyStatus,
    dependencyLabel: gprStageDependencyStatusLabel(dependencyStatus),
    influenceScore,
  };
}

function computeGprStageLagCauseForPart(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  tenders: Tender[],
  asOf: Date,
  part: ProjectPartKey,
): GprStageLagCauseRow[] {
  const todayIso = asOf.toISOString().slice(0, 10);
  const partTasks = tasks.filter((t) => (t.partId ?? 1) === (part === "residential" ? 1 : 2));
  const partTmc = filterTmcByProjectPart(tmcItems, part);
  const partTenders = tenders.filter((t) => t.partId === (part === "residential" ? 1 : 2));
  const workTasks = workTasksFromDependencySeries(partTasks, partTmc, todayIso, part);
  return workTasks.map((task) => buildGprStageLagCauseRow(task, partTasks, partTmc, partTenders, asOf));
}

function sortGprStageLagCauseRows(rows: GprStageLagCauseRow[]): GprStageLagCauseRow[] {
  return [...rows].sort((a, b) => b.lagPp - a.lagPp || a.stageCode.localeCompare(b.stageCode, "ru", { numeric: true }));
}

/** Анализ причин отставания этапов ГПР (ТМЦ и договоры). */
export function computeGprStageLagCauseAnalysis(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  tenders: Tender[],
  scope: ConstructionObjectScope,
  asOf: Date = new Date(),
): GprStageLagCauseRow[] {
  if (scope === "project") {
    const residential = computeGprStageLagCauseForPart(tasks, tmcItems, tenders, asOf, "residential");
    const parking = computeGprStageLagCauseForPart(tasks, tmcItems, tenders, asOf, "parking");
    return sortGprStageLagCauseRows([...residential, ...parking]);
  }
  const part = partIdToProjectPartKey(scope);
  return sortGprStageLagCauseRows(
    computeGprStageLagCauseForPart(tasks, tmcItems, tenders, asOf, part),
  );
}
