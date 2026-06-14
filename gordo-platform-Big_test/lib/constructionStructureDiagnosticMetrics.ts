import { calculateDeviation, planRootStageCode, type GPRTask } from "@/lib/gprUtils";
import { getGprStageFromTenderCode, type Tender } from "@/lib/tenderData";
import { tmcFactReferenceDate, type TMCItem } from "@/lib/tmcData";

/**
 * Сквозная диагностика: связь отклонений ГПР с тендерами (договор) и ТМЦ (факт поставки).
 * Не дублирует формулы базового блока ГПР — отдельный слой «причина vs симптом».
 */
export type ConstructionStructureDiagnosticSnapshot = {
  totalTasks: number;
  tasksWithoutTender: number;
  tasksWithoutMaterials: number;
  delayedWithResources: number;
  avgDeviationDays: number;
  positiveDeviationCount: number;
  positiveDeviationPct: number;
  noTenderRatePct: number;
  noMaterialsRatePct: number;
  executionDelayRatePct: number;
};

function taskHasSignedTender(task: GPRTask, tendersForPart: Tender[]): boolean {
  const root = planRootStageCode(task.code);
  const stageTenders = tendersForPart.filter(
    (t) => getGprStageFromTenderCode(t.code) === root,
  );
  if (stageTenders.length === 0) return false;
  return stageTenders.some((t) => Boolean(t.factContractDate?.trim()));
}

function taskHasMaterialsSupplyFact(task: GPRTask, tmcById: Map<string, TMCItem>): boolean {
  const ids = task.relatedTmcIds ?? [];
  if (ids.length === 0) return false;
  return ids.some((id) => {
    const item = tmcById.get(id);
    return item != null && Boolean(tmcFactReferenceDate(item));
  });
}

function hasResources(
  task: GPRTask,
  tendersForPart: Tender[],
  tmcById: Map<string, TMCItem>,
): boolean {
  return taskHasSignedTender(task, tendersForPart) && taskHasMaterialsSupplyFact(task, tmcById);
}

/**
 * noTenderRate = tasks_without_contractor / total_tasks
 * «Без тендера» — по этапу задачи (корень шифра) нет ни одного договора с factContractDate в реестре части.
 *
 * noMaterialsRate = tasks_without_materials / total_tasks
 * «Без ТМЦ» — нет связанных позиций или ни одна связанная позиция не имеет фактической даты поставки.
 *
 * executionDelayRate = delayed_tasks_with_resources / total_tasks
 * «Чистое отставание» — Δ>0 по ГПР при закрытом договоре и факте поставки по связанным ТМЦ.
 */
export function computeConstructionStructureDiagnostic(
  tasks: GPRTask[],
  tenders: Tender[],
  tmcItems: TMCItem[],
  /** Часть 1/2 или `"all"` — весь проект (сводная диагностика). */
  partId: number | "all",
): ConstructionStructureDiagnosticSnapshot {
  const list = partId === "all" ? tasks : tasks.filter((t) => t.partId === partId);
  const tendersForPart =
    partId === "all" ? tenders : tenders.filter((t) => t.partId === partId);
  const tmcById = new Map(tmcItems.map((i) => [i.id, i]));

  const totalTasks = list.length;
  if (totalTasks === 0) {
    return {
      totalTasks: 0,
      tasksWithoutTender: 0,
      tasksWithoutMaterials: 0,
      delayedWithResources: 0,
      avgDeviationDays: 0,
      positiveDeviationCount: 0,
      positiveDeviationPct: 0,
      noTenderRatePct: 0,
      noMaterialsRatePct: 0,
      executionDelayRatePct: 0,
    };
  }

  let tasksWithoutTender = 0;
  let tasksWithoutMaterials = 0;
  let delayedWithResources = 0;
  const deviations: number[] = [];
  let positiveDeviationCount = 0;

  for (const task of list) {
    if (!taskHasSignedTender(task, tendersForPart)) tasksWithoutTender += 1;
    if (!taskHasMaterialsSupplyFact(task, tmcById)) tasksWithoutMaterials += 1;

    const d = calculateDeviation(task);
    if (d !== null) {
      deviations.push(d);
      if (d > 0) positiveDeviationCount += 1;
    }

    if (d !== null && d > 0 && hasResources(task, tendersForPart, tmcById)) {
      delayedWithResources += 1;
    }
  }

  const avgDeviationDays =
    deviations.length > 0
      ? Number((deviations.reduce((a, b) => a + b, 0) / deviations.length).toFixed(1))
      : 0;

  const positiveDeviationPct = Math.round((positiveDeviationCount / totalTasks) * 1000) / 10;
  const noTenderRatePct = Math.round((tasksWithoutTender / totalTasks) * 1000) / 10;
  const noMaterialsRatePct = Math.round((tasksWithoutMaterials / totalTasks) * 1000) / 10;
  const executionDelayRatePct = Math.round((delayedWithResources / totalTasks) * 1000) / 10;

  return {
    totalTasks,
    tasksWithoutTender,
    tasksWithoutMaterials,
    delayedWithResources,
    avgDeviationDays,
    positiveDeviationCount,
    positiveDeviationPct,
    noTenderRatePct,
    noMaterialsRatePct,
    executionDelayRatePct,
  };
}
