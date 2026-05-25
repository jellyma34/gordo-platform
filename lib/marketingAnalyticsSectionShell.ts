/**
 * Единый rhythm между смысловыми блоками маркетинговой аналитики
 * (ДДУ → стоимость проекта → выбытие → прогноз → …).
 */

/** Крупный разрыв + мягкий divider перед новым разделом. */
export function marketingAnalyticsMajorSectionClass(presDark: boolean): string {
  const border = presDark ? "border-white/10" : "border-[#EEF2F7]";
  return `relative min-w-0 w-full mt-24 border-t pt-10 ${border}`;
}

/** Divider между сегментами внутри одного блока (машино-места, кладовые). */
export function marketingAnalyticsSegmentBorderColor(presDark: boolean): string {
  return presDark ? "rgba(255,255,255,0.1)" : "rgba(226,232,240,0.55)";
}
