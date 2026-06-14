import { numFmt } from "@/lib/salesPlanChartFormat";

/** Полная цена в тултипе и подписи «Средняя». */
export function formatSqmPriceRub(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return `${numFmt.format(Math.round(v))} ₽/м²`;
}

/** Шаг между тремя делениями оси Y (₽/м²). */
export const SQM_PRICE_CHART_Y_STEP_RUB = 5_000;

/** Компактная ось Y: 277k, 282k (без ₽/м²). */
export function formatSqmPriceAxisTick(v: number): string {
  const n = Math.round(v);
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n) >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m >= 10 || m % 1 === 0 ? Math.round(m) : m.toFixed(1)}M`;
  }
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
  return numFmt.format(n);
}

/** Три деления: center ± 5 000 ₽/м² (локально по сегменту). */
export function sqmPriceChartCenteredYScale(centerRub: number): {
  ticks: [number, number, number];
  domain: [number, number];
} {
  const center = Math.round(centerRub);
  const ticks: [number, number, number] = [
    center - SQM_PRICE_CHART_Y_STEP_RUB,
    center,
    center + SQM_PRICE_CHART_Y_STEP_RUB,
  ];
  return { ticks, domain: [ticks[0], ticks[2]] };
}

/** Изменение за период: +4,2 % */
export function formatSqmPriceChangePct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1).replace(".", ",")}%`;
}
