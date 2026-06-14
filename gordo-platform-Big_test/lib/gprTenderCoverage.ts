import {
  durationDays,
  gprParentCode,
  normalizeGprCodeFinal,
  PROJECT_PART_KEY_TO_ID,
  type GPRTask,
  type ProjectPartKey,
} from "@/lib/gprUtils";
import type { Tender } from "@/lib/tenderData";

export type GprTenderCoverageScope = ProjectPartKey | "project";

/** Порог предупреждения по обеспеченности ГПР тендерами (%). */
export const GPR_TENDER_COVERAGE_RISK_THRESHOLD = 80;

export type GprTenderUnprovidedWork = {
  code: string;
  name: string;
  partId: number;
  reason: string;
  matchedTenderCode: string | null;
  workStart: string | null;
};

export type GprTenderCoverageResult = {
  coveragePercent: number | null;
  coveredWeight: number;
  totalWeight: number;
  leafCount: number;
  coveredLeafCount: number;
  belowRiskThreshold: boolean;
  unprovided: GprTenderUnprovidedWork[];
};

function scopeTasks(tasks: GPRTask[], part: GprTenderCoverageScope): GPRTask[] {
  if (part === "project") return tasks;
  const partId = PROJECT_PART_KEY_TO_ID[part];
  if (partId == null) return [];
  return tasks.filter((t) => t.partId === partId);
}

function scopeTenders(tenders: Tender[], part: GprTenderCoverageScope): Tender[] {
  if (part === "project") return tenders;
  const partId = PROJECT_PART_KEY_TO_ID[part];
  if (partId == null) return [];
  return tenders.filter((t) => t.partId === partId);
}

function leafWeight(task: GPRTask): number {
  const vol = task.plannedWorkVolume;
  if (typeof vol === "number" && Number.isFinite(vol) && vol > 0) return vol;
  const rub = task.contractValue;
  if (typeof rub === "number" && Number.isFinite(rub) && rub > 0) return rub;
  const planD = durationDays(task.planStart, task.planEnd);
  if (planD !== null && planD > 0) return planD;
  return 0;
}

/** Листовая работа: нет другой работы в том же scope с шифром-потомком. */
export function isGprLeafTaskAmong(task: GPRTask, group: GPRTask[]): boolean {
  const nc = normalizeGprCodeFinal(task.code);
  if (!nc) return false;
  return !group.some((t) => {
    if (t.partId !== task.partId) return false;
    const oc = normalizeGprCodeFinal(t.code);
    return oc !== nc && oc.startsWith(`${nc}.`);
  });
}

export function filterLeafGprTasks(tasks: GPRTask[]): GPRTask[] {
  return tasks.filter((t) => isGprLeafTaskAmong(t, tasks));
}

function buildTendersByPartAndCode(tenders: Tender[]): Map<string, Tender[]> {
  const map = new Map<string, Tender[]>();
  for (const t of tenders) {
    const code = normalizeGprCodeFinal(t.code);
    if (!code) continue;
    const key = `${t.partId}::${code}`;
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  return map;
}

/** Точный шифр, иначе ближайший родительский (в той же части проекта). */
export function findTenderForGprWorkCode(
  workCode: string,
  partId: number,
  tendersByPartAndCode: Map<string, Tender[]>,
): { tender: Tender; matchedCode: string } | null {
  let code: string | null = normalizeGprCodeFinal(workCode);
  while (code) {
    const list = tendersByPartAndCode.get(`${partId}::${code}`);
    if (list && list.length > 0) {
      return { tender: list[0]!, matchedCode: code };
    }
    code = gprParentCode(code);
  }
  return null;
}

function workStartIso(task: GPRTask): string | null {
  const fs = task.factStart?.trim();
  if (fs) return fs;
  const ps = task.planStart?.trim();
  return ps || null;
}

function isWorkCoveredByTender(tender: Tender, workStart: string): boolean {
  const fc = tender.factContractDate?.trim();
  if (!fc) return false;
  return fc <= workStart;
}

function unprovidedReason(
  match: { tender: Tender; matchedCode: string } | null,
  workStart: string | null,
): string {
  if (!match) return "Нет тендера по шифру работы";
  if (!workStart) return "Нет даты начала работ (план/факт)";
  const fc = match.tender.factContractDate?.trim();
  if (!fc) return "Договор по тендеру не заключён";
  return "Договор заключён позже начала работ";
}

/**
 * Обеспеченность ГПР тендерами: только листовые работы, взвешенная доля покрытых.
 * Покрытие: factContractDate ≤ (factStart ?? planStart).
 */
export function computeGprTenderCoverage(
  tasks: GPRTask[],
  tenders: Tender[],
  part: GprTenderCoverageScope,
): GprTenderCoverageResult {
  const scopedTasks = scopeTasks(tasks, part);
  const scopedTenders = scopeTenders(tenders, part);
  const leaves = filterLeafGprTasks(scopedTasks);
  const tendersByPartAndCode = buildTendersByPartAndCode(scopedTenders);

  let coveredWeight = 0;
  let totalWeight = 0;
  let coveredLeafCount = 0;
  const unprovided: GprTenderUnprovidedWork[] = [];

  for (const task of leaves) {
    const w = leafWeight(task);
    if (w <= 0) continue;
    totalWeight += w;
    const ws = workStartIso(task);
    const match = findTenderForGprWorkCode(task.code, task.partId, tendersByPartAndCode);
    const covered = Boolean(ws && match && isWorkCoveredByTender(match.tender, ws));
    if (covered) {
      coveredWeight += w;
      coveredLeafCount += 1;
    } else {
      unprovided.push({
        code: task.code,
        name: task.name,
        partId: task.partId,
        reason: unprovidedReason(match, ws),
        matchedTenderCode: match?.matchedCode ?? null,
        workStart: ws,
      });
    }
  }

  const coveragePercent =
    totalWeight > 0 ? Math.round((coveredWeight / totalWeight) * 10) / 10 : null;
  const belowRiskThreshold =
    coveragePercent !== null && coveragePercent < GPR_TENDER_COVERAGE_RISK_THRESHOLD;

  return {
    coveragePercent,
    coveredWeight,
    totalWeight,
    leafCount: leaves.filter((t) => leafWeight(t) > 0).length,
    coveredLeafCount,
    belowRiskThreshold,
    unprovided: unprovided.sort((a, b) =>
      normalizeGprCodeFinal(a.code).localeCompare(normalizeGprCodeFinal(b.code)),
    ),
  };
}
