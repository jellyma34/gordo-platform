/**
 * Rhythm внутри одного смыслового блока (сегменты: машино-места, кладовые).
 * Крупные section breaks — {@link MarketingAnalyticsSectionIsland}.
 */

/** Divider между сегментами внутри одного блока (машино-места, кладовые). */
export function marketingAnalyticsSegmentBorderColor(presDark: boolean): string {
  return presDark ? "rgba(255,255,255,0.1)" : "rgba(226,232,240,0.55)";
}
