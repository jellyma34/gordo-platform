export type ProjectStatusKind = "danger" | "warning" | "success";

/**
 * Единые пороги по отклонению в днях (план vs факт по сроку окончания):
 * - success: опережение (отрицательное отклонение)
 * - warning: в допуске по задержке (0…14 дн.)
 * - danger: критическое отставание (>14 дн.)
 */
export function getProjectStatus(deviation: number): ProjectStatusKind {
  if (deviation > 14) return "danger";
  if (deviation >= 0) return "warning";
  return "success";
}
