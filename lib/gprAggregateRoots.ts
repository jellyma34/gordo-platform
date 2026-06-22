import {
  gprWbsLevelFromCode,
  normalizeGprCodeFinal,
  parseDateSafe,
  PROJECT_PART_KEY_TO_ID,
  type ConstructionObjectScope,
  type GPRTask,
  type ProjectPartKey,
} from "@/lib/gprUtils";

/** Корневой этап «Подготовка территории», скрываемый из карточек презентации «Жилой дом». */
export const GPR_RESIDENTIAL_PRESENTATION_HIDDEN_STAGE_ROOT = "2.04";

export function isGprResidentialPrepTerritoryStageRoot(task: GPRTask): boolean {
  const code = normalizeGprCodeFinal(task.code);
  return (
    code === GPR_RESIDENTIAL_PRESENTATION_HIDDEN_STAGE_ROOT ||
    task.name.trim() === "Подготовка территории строительства"
  );
}

/**
 * Список корневых этапов для карточек KPI в презентации.
 * На вкладке «Жилой дом» исключает 2.04; в редактировании и на «Проект»/«Автостоянка» — без изменений.
 */
export function filterGprPresentationStageCardRoots(
  roots: GPRTask[],
  options: {
    presentationMode: boolean;
    activePartScope: ConstructionObjectScope;
  },
): GPRTask[] {
  if (!options.presentationMode) return roots;
  if (options.activePartScope !== PROJECT_PART_KEY_TO_ID.residential) return roots;
  return roots.filter((t) => !isGprResidentialPrepTerritoryStageRoot(t));
}

/** Группа этапа 2.04 в блоке «Отклонения по этапам» (prep → «Подготовка территории строительства»). */
export const GPR_RESIDENTIAL_PRESENTATION_HIDDEN_DEVIATION_GROUP = "prep" as const;

/**
 * Ключи групп для блока «Отклонения по этапам» в презентации.
 * На вкладке «Жилой дом» исключает prep (2.04); edit / «Проект» / «Автостоянка» — без изменений.
 */
export function filterGprPresentationStageDeviationGroupKeys<K extends string>(
  groupKeys: readonly K[],
  options: {
    presentationMode: boolean;
    activePartScope: ConstructionObjectScope;
  },
): K[] {
  if (!options.presentationMode) return [...groupKeys];
  if (options.activePartScope !== PROJECT_PART_KEY_TO_ID.residential) return [...groupKeys];
  return groupKeys.filter((k) => k !== GPR_RESIDENTIAL_PRESENTATION_HIDDEN_DEVIATION_GROUP);
}

/** Корневые этапы по умолчанию (модель mock / Primavera). */
export const DEFAULT_AGGREGATE_ROOT_CODES_BY_PART: Record<ProjectPartKey, readonly string[]> = {
  residential: ["2.04", "2.05"],
  parking: ["2.06", "2.07"],
};

export const DEFAULT_AGGREGATE_ROOT_CODES_PROJECT: readonly string[] = [
  "2.04",
  "2.05",
  "2.06",
  "2.07",
];

/** Есть ли работы с шифром `root` или `root.*`. */
export function hasTasksUnderGprRoot(tasks: GPRTask[], rootCode: string): boolean {
  const root = normalizeGprCodeFinal(rootCode);
  if (!root) return false;
  return tasks.some((t) => {
    const c = normalizeGprCodeFinal(t.code);
    return c === root || c.startsWith(`${root}.`);
  });
}

function tasksUnderRootCode(tasks: GPRTask[], rootCode: string): GPRTask[] {
  const root = normalizeGprCodeFinal(rootCode);
  if (!root) return [];
  return tasks.filter((t) => {
    const c = normalizeGprCodeFinal(t.code);
    return c.startsWith(`${root}.`);
  });
}

function pickExtremeIso(dates: (string | null | undefined)[], mode: "min" | "max"): string | null {
  let best: string | null = null;
  let bestMs = mode === "min" ? Infinity : -Infinity;
  for (const raw of dates) {
    const iso = parseDateSafe(raw ?? undefined);
    if (!iso) continue;
    const ms = new Date(`${iso}T12:00:00`).getTime();
    if (Number.isNaN(ms)) continue;
    if (mode === "min" ? ms < bestMs : ms > bestMs) {
      bestMs = ms;
      best = iso;
    }
  }
  return best;
}

/**
 * Корневая работа level 1 из CSV — только точное совпадение шифра, без синтеза из дочерних.
 */
export function findGprCsvRootTask(taskList: GPRTask[], codeStr: string): GPRTask | null {
  const norm = normalizeGprCodeFinal(String(codeStr ?? "").trim());
  if (!norm) return null;
  return (
    taskList.find((x) => {
      const xc = normalizeGprCodeFinal(x.code);
      if (xc !== norm) return false;
      return gprWbsLevelFromCode(xc, x.level) === 1;
    }) ?? null
  );
}

/**
 * Корневая работа для агрегата «Выполнение ГПР» (fallback для устаревших данных):
 * 1) level 1 из CSV;
 * 2) любая строка с точным шифром;
 * 3) синтетический корень при наличии дочерних `root.*`.
 */
export function resolveAggregateRootTask(taskList: GPRTask[], codeStr: string): GPRTask | null {
  const csvRoot = findGprCsvRootTask(taskList, codeStr);
  if (csvRoot) return csvRoot;

  const code = String(codeStr ?? "").trim();
  if (!code) return null;
  const norm = normalizeGprCodeFinal(code);

  const anyExact = taskList.find((x) => normalizeGprCodeFinal(x.code) === norm);
  if (anyExact) return anyExact;

  const descendants = tasksUnderRootCode(taskList, code);
  if (descendants.length === 0) return null;

  const nameFromChild =
    descendants.find((t) => gprWbsLevelFromCode(t.code, t.level) === 2)?.name ??
    descendants[0]?.name ??
    code;

  return {
    id: `synthetic-root-${norm}`,
    code: norm,
    name: nameFromChild,
    level: 1,
    partId: descendants[0]?.partId,
    projectPartKey: descendants[0]?.projectPartKey,
    planStart: pickExtremeIso(
      descendants.flatMap((t) => [t.planStart, t.planEnd]),
      "min",
    ),
    planEnd: pickExtremeIso(
      descendants.flatMap((t) => [t.planStart, t.planEnd]),
      "max",
    ),
    factStart: pickExtremeIso(descendants.map((t) => t.factStart), "min"),
    factEnd: pickExtremeIso(descendants.map((t) => t.factEnd), "max"),
    completion: 0,
  };
}

/**
 * Актуальные корневые шифры для агрегата по части проекта.
 * Для автостоянки: если нет 2.06/2.07 (типично CSV-импорт), используем 2.04/2.05.
 */
export function aggregateRootCodesForPart(
  partKey: ProjectPartKey | "project",
  tasks: GPRTask[],
): readonly string[] {
  if (partKey === "project") return DEFAULT_AGGREGATE_ROOT_CODES_PROJECT;
  if (partKey === "residential") return DEFAULT_AGGREGATE_ROOT_CODES_BY_PART.residential;

  const has206 = hasTasksUnderGprRoot(tasks, "2.06");
  const has207 = hasTasksUnderGprRoot(tasks, "2.07");
  if (has206 || has207) {
    const codes: string[] = [];
    if (has206) codes.push("2.06");
    if (has207) codes.push("2.07");
    return codes;
  }

  const fallback: string[] = [];
  if (hasTasksUnderGprRoot(tasks, "2.04")) fallback.push("2.04");
  if (hasTasksUnderGprRoot(tasks, "2.05")) fallback.push("2.05");
  if (fallback.length > 0) return fallback;

  return DEFAULT_AGGREGATE_ROOT_CODES_BY_PART.parking;
}

/** Карточки верхнего уровня — только корни level 1 из CSV (2.04 / 2.05 и т.д.). */
export function resolveStageCardRootTasks(
  taskList: GPRTask[],
  rootCodes: readonly string[],
): GPRTask[] {
  return rootCodes
    .map((code) => findGprCsvRootTask(taskList, code))
    .filter((t): t is GPRTask => t != null);
}

export function resolveAggregateRootTasks(
  taskList: GPRTask[],
  rootCodes: readonly string[],
): GPRTask[] {
  return rootCodes
    .map((code) => resolveAggregateRootTask(taskList, code))
    .filter((t): t is GPRTask => t != null);
}
