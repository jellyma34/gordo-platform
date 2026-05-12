export const rubFmt = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});
export const numFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
export const dec1Fmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function compactRub(n: number): string {
  return Math.abs(n) >= 1_000_000
    ? `${n < 0 ? "−" : ""}${numFmt.format(Math.round(Math.abs(n) / 1_000_000))} \u043c\u043b\u043d \u20bd`
    : rubFmt.format(n);
}

/** Короткие подписи на графиках cashflow: «1 млн», «350 млн» (без «₽» в строке). */
export function formatCompactCashflowRub(n: number): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(Math.round(n));
  if (abs >= 1_000_000_000) {
    const b = abs / 1_000_000_000;
    const s = b % 1 === 0 ? String(Math.round(b)) : b.toFixed(1).replace(/\.0$/, "");
    return `${sign}${s} млрд`;
  }
  if (abs >= 1_000_000) return `${sign}${Math.round(abs / 1_000_000)} млн`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)} тыс`;
  return `${sign}${abs}`;
}

/** Денежные значения на графике «Динамика поступлений»: всегда в млн ₽ (или млрд при необходимости). */
export function formatCashflowMillionsLabel(n: number, withRubSuffix = false): string {
  if (!Number.isFinite(n)) return "";
  const rub = withRubSuffix ? " ₽" : "";
  if (n === 0) return withRubSuffix ? `0${rub}` : "0";

  const sign = n < 0 ? "−" : "";
  const absRub = Math.abs(n);

  if (absRub >= 1_000_000_000) {
    const b = absRub / 1_000_000_000;
    const opts: Intl.NumberFormatOptions =
      b >= 1
        ? { maximumFractionDigits: 1, minimumFractionDigits: 0 }
        : { maximumFractionDigits: 2, minimumFractionDigits: 0 };
    return `${sign}${b.toLocaleString("ru-RU", opts)} млрд${rub}`;
  }

  const mln = absRub / 1_000_000;
  const opts: Intl.NumberFormatOptions =
    mln >= 1
      ? { maximumFractionDigits: 1, minimumFractionDigits: 0 }
      : { maximumFractionDigits: 2, minimumFractionDigits: 0 };
  return `${sign}${mln.toLocaleString("ru-RU", opts)} млн${rub}`;
}

/** Подписи на графике «Динамика поступлений» (tooltip, отклонение): всегда млн/млрд ₽. */
export function formatCashflowDynamicsChartLabel(n: number): string {
  return formatCashflowMillionsLabel(n, true);
}

/**
 * Тултип поступлений: &lt; 1 млн — полная сумма в ₽ (без дробных «млн»);
 * от 1 млн — те же правила, что {@link formatCashflowDynamicsChartLabel}.
 */
export function formatCashflowTooltipRub(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n) < 1_000_000) {
    return rubFmt.format(Math.round(n));
  }
  return formatCashflowDynamicsChartLabel(n);
}

/**
 * @deprecated Используйте {@link formatCashflowMillionsLabel}; оставлено как алиас для подписей точек.
 * Короткая форма без «₽» в конце (единицы в заголовке графика).
 */
export function formatCashShort(value: number): string {
  if (value == null || !Number.isFinite(value)) return "";
  return formatCashflowMillionsLabel(value, false);
}

/**
 * Ось и тултип мини-графика выручки: те же правила, что у «Динамика поступлений» (всегда млн/млрд), без «₽» в строке.
 */
export function formatSegmentMiniRevenueChartNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  return formatCashflowMillionsLabel(n, false);
}

/** Подписи оси Y графика поступлений: в млн ₽ (те же правила дробной части, что у подписей точек). */
export function formatCashflowYAxisMlnRub(v: number): string {
  if (!Number.isFinite(v)) return "";
  if (v === 0) return "0";
  return formatCashflowMillionsLabel(v, true);
}

/** Ось Y: min 0, max = округление вверх(max(данные)×1.1) с шагом 50 или 100 млн. */
export function cashflowYAxisScale(chartPlanFactValues: number[]): { domainMax: number; ticks: number[] } {
  const mil = 1_000_000;
  const step50 = 50 * mil;
  const step100 = 100 * mil;
  const vals = chartPlanFactValues
    .map((n) => (Number.isFinite(n) ? Math.max(0, n) : 0))
    .filter((n) => n >= 0);
  const maxVal = vals.length > 0 ? Math.max(...vals) : 0;
  const padded = maxVal * 1.1;
  if (padded <= 0 || !Number.isFinite(padded)) {
    const step = step50;
    return { domainMax: step, ticks: [0, step] };
  }
  let step = step50;
  let domainMax = Math.ceil(padded / step) * step;
  if (domainMax / step > 10) {
    step = step100;
    domainMax = Math.ceil(padded / step) * step;
  }
  const ticks: number[] = [];
  for (let t = 0; t <= domainMax + 1e-9; t += step) ticks.push(Math.round(t));
  return { domainMax, ticks };
}


/** Одна строка для подписи на баре баланса структуры: «-2,8% · -56M». */
export function structureBalanceBarLabelLine(deltaShare: number, deltaRub: number): string {
  const sPct = deltaShare >= 0 ? "+" : "−";
  const pct = `${sPct}${dec1Fmt.format(Math.abs(deltaShare))}%`;
  const absR = Math.abs(deltaRub);
  const sRub = deltaRub >= 0 ? "+" : "−";
  let rub: string;
  if (absR >= 1_000_000) rub = `${sRub}${numFmt.format(Math.round(absR / 1_000_000))}M`;
  else if (absR >= 1_000) rub = `${sRub}${numFmt.format(Math.round(absR / 1_000))}K`;
  else rub = `${sRub}${numFmt.format(Math.round(absR))}`;
  return `${pct} · ${rub}`;
}
