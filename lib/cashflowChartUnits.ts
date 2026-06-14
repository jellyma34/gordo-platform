import { numFmt } from "@/lib/salesPlanChartFormat";

/** Один unit на графике «Динамика поступлений» = 1 млн ₽ (исходные CSV — в рублях). */
export const RUB_PER_CASHFLOW_CHART_UNIT = 1_000_000;

export function rubToCashflowChartUnit(rub: number | null | undefined): number | null {
  if (rub == null || !Number.isFinite(rub)) return null;
  return rub / RUB_PER_CASHFLOW_CHART_UNIT;
}

/** Подпись точки / тика: число уже в млн (без повторного / 1e6). */
export function formatCashflowChartUnitInteger(unit: number, withRubSuffix = false): string {
  if (!Number.isFinite(unit)) return "";
  const rub = withRubSuffix ? " ₽" : "";
  if (unit === 0) return withRubSuffix ? `0${rub}` : "0";

  const sign = unit < 0 ? "−" : "";
  const abs = Math.abs(unit);

  if (abs >= 1000) {
    const bln = abs / 1000;
    const opts: Intl.NumberFormatOptions =
      bln >= 1
        ? { maximumFractionDigits: 1, minimumFractionDigits: 0 }
        : { maximumFractionDigits: 2, minimumFractionDigits: 0 };
    return `${sign}${bln.toLocaleString("ru-RU", opts)}${rub}`;
  }

  return `${sign}${numFmt.format(Math.round(abs))}${rub}`;
}

export function formatCashflowChartUnitYAxisTick(unit: number): string {
  if (!Number.isFinite(unit)) return "";
  const core = formatCashflowChartUnitInteger(unit, false);
  if (core === "") return "";
  const abs = Math.abs(unit);
  if (abs >= 1000) return `${core} млрд`;
  return `${core} млн`;
}

/** Тултип: «40 ₽» = 40 млн руб. (как прежний formatCashflowTooltipRub для ₽-значений). */
export function formatCashflowChartUnitTooltip(unit: number): string {
  if (!Number.isFinite(unit)) return "";
  return `${formatCashflowChartUnitInteger(unit, false)} ₽`;
}

export function formatCashflowChartCumulativePointLabel(unit: number): string {
  if (!Number.isFinite(unit)) return "";
  return formatCashflowChartUnitInteger(unit, false);
}

/** Ось Y при данных в млн (шаг 25 / 50 млн, не 25e6 ₽). */
export function cashflowChartYAxisScale(
  chartUnits: number[],
  opts?: { headroom?: number; tickStep25Mln?: boolean },
): { domainMax: number; ticks: number[] } {
  const step50 = 50;
  const step25 = 25;
  const headroom = opts?.headroom ?? 1.1;
  const vals = chartUnits
    .map((n) => (Number.isFinite(n) ? Math.max(0, n) : 0))
    .filter((n) => n >= 0);
  const maxVal = vals.length > 0 ? Math.max(...vals) : 0;
  const padded = maxVal * headroom;
  if (padded <= 0 || !Number.isFinite(padded)) {
    const baseTicks = opts?.tickStep25Mln ? [0, step25, step50] : [0, step50];
    return { domainMax: step50, ticks: baseTicks };
  }
  let step = step50;
  let domainMax = Math.ceil(padded / step) * step;
  if (domainMax / step > 10) {
    step = 100;
    domainMax = Math.ceil(padded / step) * step;
  }
  const ticks: number[] = [];
  for (let t = 0; t <= domainMax + 1e-9; t += step) ticks.push(Math.round(t));
  if (!opts?.tickStep25Mln || ticks.length < 2 || step !== step50) {
    return { domainMax, ticks };
  }
  const with25: number[] = [];
  for (let i = 0; i < ticks.length - 1; i++) {
    with25.push(ticks[i]!);
    const next = ticks[i + 1]!;
    const mid = ticks[i]! + step25;
    if (next - ticks[i]! >= step50 - 1e-9 && mid < next - 1e-9) with25.push(mid);
  }
  with25.push(ticks[ticks.length - 1]!);
  return { domainMax, ticks: with25 };
}
