/** Строка горизонтального grouped bar chart «План vs Факт» (накопительно). */
export type PerformanceChartRow = {
  key: string;
  label: string;
  shortLabel: string;
  plan: number;
  fact: number;
};

export function buildPerformanceChartRows(
  items: readonly {
    key: string;
    label: string;
    shortLabel?: string;
    planCumulative: number;
    factCumulative: number;
  }[],
): PerformanceChartRow[] {
  return items.map((item) => ({
    key: item.key,
    label: item.label,
    shortLabel: item.shortLabel ?? item.label,
    plan: Math.max(0, item.planCumulative),
    fact: Math.max(0, item.factCumulative),
  }));
}

export function performanceChartHasData(rows: readonly PerformanceChartRow[]): boolean {
  return rows.length > 0 && rows.some((r) => r.plan > 0 || r.fact > 0);
}
