import { tmcItemBelongsToWorkCode, effectiveTmcGprCode } from "@/lib/gprTmcDependency";
import { computeGprStageFactCompletionChartPercent } from "@/lib/gprStageCompletion";
import {
  calculateDeviation,
  compareGprCodesByNumericPath,
  getPlannedProgressPercent,
  normalizeGprCodeFinal,
  partIdToProjectPartKey,
  type ConstructionObjectScope,
  type GPRTask,
  type ProjectPartKey,
} from "@/lib/gprUtils";
import { filterTmcByProjectPart, type TMCItem } from "@/lib/tmcData";
import {
  classifyTmcArmatureByGprStage,
  computeTmcRemainingPercent,
  isTmcArmatureMaterial,
  TMC_ARMATURE_ABOVE_LABEL,
  TMC_ARMATURE_BELOW_LABEL,
} from "@/lib/tmcPresentationAnalytics";

export type TmcGprImpactLevel = "low" | "medium" | "high" | "critical";

export type TmcGprImpactStageRow = {
  rowKey: string;
  stageCode: string;
  stageTitle: string;
  stageLabel: string;
  planPct: number | null;
  factPct: number | null;
  deviationPct: number | null;
  isLagging: boolean;
};

export type TmcGprImpactMaterialRow = {
  materialKey: string;
  materialName: string;
  remainingPercent: number;
  linkedStageCount: number;
  laggingStageCount: number;
  impactScore: number;
  impactLevel: TmcGprImpactLevel;
  impactLabel: string;
  stages: TmcGprImpactStageRow[];
};

const IMPACT_LABELS: Record<TmcGprImpactLevel, string> = {
  low: "Низкое влияние",
  medium: "Среднее влияние",
  high: "Высокое влияние",
  critical: "Критическое влияние",
};

function tmcMaterialImpactBucketKey(item: TMCItem): string {
  const name = item.name.trim() || "Без наименования";
  if (!isTmcArmatureMaterial(name)) return name;
  const group = classifyTmcArmatureByGprStage(item.gprStage, item.itemCode);
  return group === "below" ? TMC_ARMATURE_BELOW_LABEL : TMC_ARMATURE_ABOVE_LABEL;
}

function buildImpactStageRow(task: GPRTask, allTasks: GPRTask[], asOf: Date): TmcGprImpactStageRow {
  const stageCode = normalizeGprCodeFinal(task.code);
  const planPct = getPlannedProgressPercent(task, asOf);
  const deviationPct = calculateDeviation(task, asOf);
  const factPct =
    planPct !== null && deviationPct !== null
      ? Math.round((planPct + deviationPct) * 10) / 10
      : computeGprStageFactCompletionChartPercent(allTasks, task, asOf);
  const stageTitle = task.name?.trim() || stageCode;
  const isLagging = planPct != null && factPct != null && planPct > factPct;

  return {
    rowKey: `${task.partId ?? 0}|${stageCode}`,
    stageCode,
    stageTitle,
    stageLabel: `${stageCode} ${stageTitle}`,
    planPct,
    factPct,
    deviationPct,
    isLagging,
  };
}

function findGprTasksLinkedToMaterial(materialItems: TMCItem[], gprTasks: GPRTask[]): GPRTask[] {
  if (materialItems.length === 0) return [];

  const materialIds = new Set(materialItems.map((item) => item.id));
  const matched = new Map<string, GPRTask>();

  for (const task of gprTasks) {
    if (task.missingFromImport) continue;

    let linked = false;
    for (const tmcId of task.relatedTmcIds ?? []) {
      if (materialIds.has(tmcId)) {
        linked = true;
        break;
      }
    }
    if (!linked) {
      linked = materialItems.some((item) => tmcItemBelongsToWorkCode(item, task.code));
    }
    if (!linked) {
      const taskCode = normalizeGprCodeFinal(task.code);
      for (const item of materialItems) {
        const itemCode = normalizeGprCodeFinal(effectiveTmcGprCode(item));
        if (!itemCode || !taskCode) continue;
        if (taskCode === itemCode || taskCode.startsWith(`${itemCode}.`) || itemCode.startsWith(`${taskCode}.`)) {
          linked = true;
          break;
        }
      }
    }
    if (!linked) continue;

    matched.set(`${task.partId ?? 0}|${normalizeGprCodeFinal(task.code)}`, task);
  }

  return [...matched.values()].sort((a, b) =>
    compareGprCodesByNumericPath(a.code, b.code),
  );
}

/** impactScore = дефицит ТМЦ × 0.55 + суммарное отставание связанных этапов × 0.45. */
export function computeTmcGprImpactScore(remainingPercent: number, totalLagPp: number): number {
  const deficitPart = Math.min(100, Math.max(0, remainingPercent)) * 0.55;
  const lagPart = Math.min(100, Math.max(0, totalLagPp)) * 0.45;
  return Math.round((deficitPart + lagPart) * 10) / 10;
}

export function resolveTmcGprImpactLevel(score: number): TmcGprImpactLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export function tmcGprImpactLevelColor(level: TmcGprImpactLevel): string {
  if (level === "critical") return "#ef4444";
  if (level === "high") return "#f97316";
  if (level === "medium") return "#eab308";
  return "#94a3b8";
}

export function tmcGprImpactLevelLabel(level: TmcGprImpactLevel): string {
  return IMPACT_LABELS[level];
}

function buildMaterialImpactRow(
  materialKey: string,
  materialItems: TMCItem[],
  gprTasks: GPRTask[],
  asOf: Date,
): TmcGprImpactMaterialRow | null {
  let volumePlan = 0;
  let volumeFact = 0;
  for (const item of materialItems) {
    volumePlan += item.volumePlan;
    volumeFact += item.volumeFact;
  }
  if (volumePlan <= 0) return null;

  const remainingQty = Math.max(volumePlan - volumeFact, 0);
  const remainingPercent = computeTmcRemainingPercent(volumePlan, remainingQty);
  if (remainingQty <= 0 || remainingPercent <= 0) return null;

  const linkedTasks = findGprTasksLinkedToMaterial(materialItems, gprTasks);
  const stages = linkedTasks.map((task) => buildImpactStageRow(task, gprTasks, asOf));
  const laggingStageCount = stages.filter((stage) => stage.isLagging).length;
  const totalLagPp = stages.reduce((sum, stage) => {
    if (!stage.isLagging || stage.planPct == null || stage.factPct == null) return sum;
    return sum + (stage.planPct - stage.factPct);
  }, 0);
  const impactScore = computeTmcGprImpactScore(remainingPercent, totalLagPp);
  const impactLevel = resolveTmcGprImpactLevel(impactScore);

  return {
    materialKey,
    materialName: materialKey,
    remainingPercent,
    linkedStageCount: stages.length,
    laggingStageCount,
    impactScore,
    impactLevel,
    impactLabel: tmcGprImpactLevelLabel(impactLevel),
    stages,
  };
}

function computeTmcGprImpactForPart(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  asOf: Date,
  part: ProjectPartKey,
): TmcGprImpactMaterialRow[] {
  const partId = part === "residential" ? 1 : 2;
  const partTasks = tasks.filter((t) => (t.partId ?? 1) === partId);
  const partTmc = filterTmcByProjectPart(tmcItems, part);

  const buckets = new Map<string, TMCItem[]>();
  for (const item of partTmc) {
    const key = tmcMaterialImpactBucketKey(item);
    const cur = buckets.get(key) ?? [];
    cur.push(item);
    buckets.set(key, cur);
  }

  const rows: TmcGprImpactMaterialRow[] = [];
  for (const [key, items] of buckets) {
    const row = buildMaterialImpactRow(key, items, partTasks, asOf);
    if (row) rows.push(row);
  }

  return rows.sort((a, b) => b.impactScore - a.impactScore || b.remainingPercent - a.remainingPercent);
}

/** Влияние дефицита ТМЦ на выполнение ГПР: группировка ТМЦ → связанные этапы. */
export function computeTmcGprImpactAnalysis(
  tasks: GPRTask[],
  tmcItems: TMCItem[],
  scope: ConstructionObjectScope,
  asOf: Date = new Date(),
): TmcGprImpactMaterialRow[] {
  if (scope === "project") {
    const residential = computeTmcGprImpactForPart(tasks, tmcItems, asOf, "residential");
    const parking = computeTmcGprImpactForPart(tasks, tmcItems, asOf, "parking");
    const merged = new Map<string, TmcGprImpactMaterialRow>();

    for (const row of [...residential, ...parking]) {
      const existing = merged.get(row.materialKey);
      if (!existing) {
        merged.set(row.materialKey, row);
        continue;
      }
      const stageKeys = new Set(existing.stages.map((s) => s.rowKey));
      const mergedStages = [...existing.stages];
      for (const stage of row.stages) {
        if (!stageKeys.has(stage.rowKey)) mergedStages.push(stage);
      }
      mergedStages.sort((a, b) => compareGprCodesByNumericPath(a.stageCode, b.stageCode));
      const laggingStageCount = mergedStages.filter((s) => s.isLagging).length;
      const totalLagPp = mergedStages.reduce((sum, stage) => {
        if (!stage.isLagging || stage.planPct == null || stage.factPct == null) return sum;
        return sum + (stage.planPct - stage.factPct);
      }, 0);
      const remainingPercent = Math.max(existing.remainingPercent, row.remainingPercent);
      const impactScore = computeTmcGprImpactScore(remainingPercent, totalLagPp);
      const impactLevel = resolveTmcGprImpactLevel(impactScore);
      merged.set(row.materialKey, {
        materialKey: row.materialKey,
        materialName: row.materialName,
        remainingPercent,
        linkedStageCount: mergedStages.length,
        laggingStageCount,
        impactScore,
        impactLevel,
        impactLabel: tmcGprImpactLevelLabel(impactLevel),
        stages: mergedStages,
      });
    }

    return [...merged.values()].sort(
      (a, b) => b.impactScore - a.impactScore || b.remainingPercent - a.remainingPercent,
    );
  }

  const part = partIdToProjectPartKey(scope);
  return computeTmcGprImpactForPart(tasks, tmcItems, asOf, part);
}
