/**
 * - work: обычная панель (светлая тема)
 * - presentation: слайды презентации (тёмная)
 * - explain: тот же вид + интерактив пояснения
 */
export type SalesPlanChartMode = "work" | "presentation" | "explain";

export function chartPresentationLike(mode: SalesPlanChartMode): boolean {
  return mode === "presentation" || mode === "explain";
}
