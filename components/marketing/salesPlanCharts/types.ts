/**
 * - work: обычная панель (светлая тема)
 * - presentation: слайды презентации (тёмная)
 * - presentationLight: /presentation/marketing/* (светлая презентация)
 * - explain: тот же вид + интерактив пояснения
 */
export type SalesPlanChartMode = "work" | "presentation" | "presentationLight" | "explain";

export function chartPresentationLike(mode: SalesPlanChartMode): boolean {
  return mode === "presentation" || mode === "presentationLight" || mode === "explain";
}

/** Тёмные оси/подписи графиков (только presentation + explain, не presentationLight). */
export function chartUsesDarkVisual(mode: SalesPlanChartMode): boolean {
  return mode === "presentation" || mode === "explain";
}
