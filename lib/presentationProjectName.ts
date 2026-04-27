/** Имя проекта в шапке презентации (пока нет единого API проекта на фронте). */
export const DEFAULT_PROJECT_DISPLAY_NAME = "ЖК Верба";

/** Очередь / фаза строительства (вторая строка в шапке). */
export const DEFAULT_PROJECT_PHASE = "1 очередь строительства";

export type PresentationProjectSource = {
  name?: string | null;
  /** Линия под названием, например очередь строительства. */
  phase?: string | null;
};

/**
 * Приоритет: `project.name` → `NEXT_PUBLIC_PROJECT_NAME` → дефолт.
 */
export function resolvePresentationProjectName(project?: PresentationProjectSource | null): string {
  const fromApi = project?.name?.trim();
  if (fromApi) return fromApi;
  const fromEnv = process.env.NEXT_PUBLIC_PROJECT_NAME?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_PROJECT_DISPLAY_NAME;
}

/**
 * Приоритет: `project.phase` → `NEXT_PUBLIC_PROJECT_PHASE` → дефолт.
 */
export function resolvePresentationProjectPhase(project?: PresentationProjectSource | null): string {
  const fromApi = project?.phase?.trim();
  if (fromApi) return fromApi;
  const fromEnv = process.env.NEXT_PUBLIC_PROJECT_PHASE?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_PROJECT_PHASE;
}
