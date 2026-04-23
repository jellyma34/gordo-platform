/** Имя проекта в шапке презентации (пока нет единого API проекта на фронте). */
export const DEFAULT_PROJECT_DISPLAY_NAME = "ЖК Верба";

export type PresentationProjectSource = { name?: string | null };

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
