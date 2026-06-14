export type ProjectStatusKind = "danger" | "warning" | "success";

/**
 * Единые пороги по отклонению в днях (факт окончания − план окончания):
 * - success: в срок или раньше плана (≤ 0)
 * - warning: отставание 1…14 дн.
 * - danger: отставание > 14 дн.
 */
export function getProjectStatus(deviation: number): ProjectStatusKind {
  if (deviation > 14) return "danger";
  if (deviation > 0) return "warning";
  return "success";
}
