import { matchesGprCodeBranch, normalizeGprCodeFinal, type GPRTask } from "@/lib/gprUtils";
import { aggregateWorksToProjectPlanFactBounds, type ProjectPlanFactOverviewBounds } from "@/lib/gprProjectOverview";

/** Три строки свода для режима «Проект»: ЖД (2.04+2.05), автостоянка 2.06 и 2.07. */
export type AggregatedProjectWideStageId = "204_205" | "206" | "207";

export type AggregatedProjectWideStage = {
  id: AggregatedProjectWideStageId;
  title: string;
  planStart: string | null;
  planEnd: string | null;
  factStart: string | null;
  factEnd: string | null;
  /** 0–100; объёмы → взвешенное выполнение, иначе среднее по корням. */
  progress: number;
};

function clampPct(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.round(Math.max(0, Math.min(100, x)) * 10) / 10;
}

export function tasksResidential204205(tasks: GPRTask[]): GPRTask[] {
  return tasks.filter(
    (t) =>
      t.partId === 1 &&
      (matchesGprCodeBranch(t.code, "2.04") || matchesGprCodeBranch(t.code, "2.05")),
  );
}

export function tasksParking206207(tasks: GPRTask[]): GPRTask[] {
  return tasks.filter(
    (t) =>
      t.partId === 2 &&
      (matchesGprCodeBranch(t.code, "2.06") || matchesGprCodeBranch(t.code, "2.07")),
  );
}

function tasksParking206(tasks: GPRTask[]): GPRTask[] {
  return tasks.filter((t) => t.partId === 2 && matchesGprCodeBranch(t.code, "2.06"));
}

function tasksParking207(tasks: GPRTask[]): GPRTask[] {
  return tasks.filter((t) => t.partId === 2 && matchesGprCodeBranch(t.code, "2.07"));
}

function findRoot(tasks: GPRTask[], partId: number, rootCode: string): GPRTask | null {
  const rc = normalizeGprCodeFinal(rootCode);
  return (
    tasks.find((t) => {
      const c = normalizeGprCodeFinal(t.code);
      const lvl = t.level ?? c.split(".").length - 1;
      return t.partId === partId && c === rc && lvl === 1;
    }) ?? null
  );
}

/**
 * Объёмный «факт» / «план» по корню: Σ(vol×completion/100) / Σ(vol); без объёмов — среднее completion по переданным корням.
 */
function progressFromRoots(roots: GPRTask[]): number {
  const valid = roots.filter(Boolean);
  if (valid.length === 0) return 0;

  let planSum = 0;
  let factSum = 0;
  let usedVol = false;

  for (const r of valid) {
    const pv = r.plannedWorkVolume;
    const cv = r.contractValue;
    const vol =
      typeof pv === "number" && Number.isFinite(pv) && pv > 0
        ? pv
        : typeof cv === "number" && Number.isFinite(cv) && cv > 0
          ? cv
          : null;
    if (vol != null) {
      usedVol = true;
      planSum += vol;
      factSum += vol * (Math.min(100, Math.max(0, Number(r.completion) || 0)) / 100);
    }
  }

  if (usedVol && planSum > 0) {
    return clampPct((factSum / planSum) * 100);
  }

  const avg =
    valid.reduce((s, r) => s + Math.min(100, Math.max(0, Number(r.completion) || 0)), 0) /
    valid.length;
  return clampPct(avg);
}

function parseDay(iso: string): number {
  return new Date(`${iso.trim()}T12:00:00`).getTime();
}

/** План по строке «ЖД + парковка»: min начала и max конца между сводами ЖД (2.04–2.05) и парковки (2.06–2.07). */
function mergePlanEnvelopeZhParking(
  boundsZh: ProjectPlanFactOverviewBounds | null,
  boundsPark206207: ProjectPlanFactOverviewBounds | null,
): { planStart: string; planEnd: string } | null {
  const candidates: ProjectPlanFactOverviewBounds[] = [];
  if (boundsZh?.planStart && boundsZh?.planEnd) candidates.push(boundsZh);
  if (boundsPark206207?.planStart && boundsPark206207?.planEnd) candidates.push(boundsPark206207);
  if (candidates.length === 0) return null;

  let planStart = candidates[0]!.planStart;
  let planEnd = candidates[0]!.planEnd;
  for (let i = 1; i < candidates.length; i += 1) {
    const b = candidates[i]!;
    if (parseDay(b.planStart) < parseDay(planStart)) planStart = b.planStart;
    if (parseDay(b.planEnd) > parseDay(planEnd)) planEnd = b.planEnd;
  }
  if (parseDay(planStart) > parseDay(planEnd)) return null;
  return { planStart, planEnd };
}

function boundsFromParts(
  planStart: string | null,
  planEnd: string | null,
  factStart: string | null,
  factEnd: string | null,
): ProjectPlanFactOverviewBounds | null {
  if (!planStart?.trim() || !planEnd?.trim()) return null;
  return {
    planStart: planStart.trim(),
    planEnd: planEnd.trim(),
    factStart: factStart?.trim() ? factStart : null,
    factEnd: factEnd?.trim() ? factEnd : null,
  };
}

/**
 * Три статьи для «Проект»: агрегат 2.04+2.05 (план — огибающая ЖД/парковка по ТЗ), 2.06, 2.07.
 */
export function buildAggregatedProjectWideStagesSummary(tasks: GPRTask[]): AggregatedProjectWideStage[] {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return [
      {
        id: "204_205",
        title: "Подготовка территории + Строительство",
        planStart: null,
        planEnd: null,
        factStart: null,
        factEnd: null,
        progress: 0,
      },
      {
        id: "206",
        title: "Инженерные сети",
        planStart: null,
        planEnd: null,
        factStart: null,
        factEnd: null,
        progress: 0,
      },
      {
        id: "207",
        title: "Благоустройство",
        planStart: null,
        planEnd: null,
        factStart: null,
        factEnd: null,
        progress: 0,
      },
    ];
  }

  const res204205Tasks = tasksResidential204205(tasks);
  const park206207Tasks = tasksParking206207(tasks);
  const bZh = aggregateWorksToProjectPlanFactBounds(res204205Tasks);
  const bPark206207 = aggregateWorksToProjectPlanFactBounds(park206207Tasks);
  const mergedPlan = mergePlanEnvelopeZhParking(bZh, bPark206207);
  const factZhOnly = aggregateWorksToProjectPlanFactBounds(res204205Tasks);

  const rootsZh = [findRoot(tasks, 1, "2.04"), findRoot(tasks, 1, "2.05")].filter(
    (x): x is GPRTask => x != null,
  );

  let row204205: AggregatedProjectWideStage = {
    id: "204_205",
    title: "Подготовка территории + Строительство",
    planStart: null,
    planEnd: null,
    factStart: null,
    factEnd: null,
    progress: progressFromRoots(rootsZh),
  };

  if (mergedPlan) {
    row204205 = {
      ...row204205,
      planStart: mergedPlan.planStart,
      planEnd: mergedPlan.planEnd,
      factStart: factZhOnly?.factStart ?? null,
      factEnd: factZhOnly?.factEnd ?? null,
      progress: row204205.progress,
    };
  } else if (bZh) {
    row204205 = {
      ...row204205,
      planStart: bZh.planStart,
      planEnd: bZh.planEnd,
      factStart: bZh.factStart,
      factEnd: bZh.factEnd,
      progress: row204205.progress,
    };
  }

  const b206 = aggregateWorksToProjectPlanFactBounds(tasksParking206(tasks));
  const root206 = findRoot(tasks, 2, "2.06");
  const row206: AggregatedProjectWideStage = {
    id: "206",
    title: "Инженерные сети",
    planStart: b206?.planStart ?? null,
    planEnd: b206?.planEnd ?? null,
    factStart: b206?.factStart ?? null,
    factEnd: b206?.factEnd ?? null,
    progress: root206 ? progressFromRoots([root206]) : 0,
  };

  const b207 = aggregateWorksToProjectPlanFactBounds(tasksParking207(tasks));
  const root207 = findRoot(tasks, 2, "2.07");
  const row207: AggregatedProjectWideStage = {
    id: "207",
    title: "Благоустройство",
    planStart: b207?.planStart ?? null,
    planEnd: b207?.planEnd ?? null,
    factStart: b207?.factStart ?? null,
    factEnd: b207?.factEnd ?? null,
    progress: root207 ? progressFromRoots([root207]) : 0,
  };

  return [row204205, row206, row207];
}

export type PlanFactProjectWideWorkRow = {
  key: AggregatedProjectWideStageId;
  label: string;
  bounds: ProjectPlanFactOverviewBounds | null;
};

/** Строки для графика «План vs факт» по видам работ в режиме «Проект». */
export function buildPlanFactProjectWideRows(tasks: GPRTask[]): PlanFactProjectWideWorkRow[] {
  const stages = buildAggregatedProjectWideStagesSummary(tasks);
  return stages.map((s) => ({
    key: s.id,
    label: s.title,
    bounds: boundsFromParts(s.planStart, s.planEnd, s.factStart, s.factEnd),
  }));
}
