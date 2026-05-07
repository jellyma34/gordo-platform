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

/** Подписи на графике «Динамика поступлений»: до 1 знака после запятой (115 млн ₽, 43,4 млн ₽); ниже 1 млн — обычный формат валюты. */
export function formatCashflowDynamicsChartLabel(n: number): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  const fmt1 = (x: number) => {
    const r = Math.round(x * 10) / 10;
    if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
    return r.toFixed(1).replace(".", ",").replace(/,?0$/, "");
  };
  if (abs >= 1_000_000_000) return `${sign}${fmt1(abs / 1_000_000_000)} млрд ₽`;
  if (abs >= 1_000_000) return `${sign}${fmt1(abs / 1_000_000)} млн ₽`;
  if (abs >= 1_000) return `${sign}${numFmt.format(Math.round(abs / 1_000))} тыс ₽`;
  return rubFmt.format(n);
}

/** Подписи оси Y графика поступлений: «0 ₽», «100 млн ₽», «200 млн ₽». */
export function formatCashflowYAxisMlnRub(v: number): string {
  if (!Number.isFinite(v)) return "";
  if (v === 0) return "0 ₽";
  const mln = v / 1_000_000;
  const rounded = Math.round(mln);
  if (Math.abs(mln - rounded) < 1e-6) return `${rounded} млн ₽`;
  const s = mln.toLocaleString("ru-RU", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
  return `${s} млн ₽`;
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

/** Короткие подписи на линиях «Динамика поступлений» (в SVG, без tooltip). */
export function formatCashShort(value: number): string {
  if (value == null || !Number.isFinite(value)) return "";
  if (value === 0) return "0 ₽";
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000_000) {
    const b = abs / 1_000_000_000;
    const s =
      Math.abs(b - Math.round(b)) < 1e-6 ? String(Math.round(b)) : b.toFixed(1).replace(".", ",");
    return `${sign}${s} млрд ₽`;
  }
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const s =
      Math.abs(m - Math.round(m)) < 1e-6 ? String(Math.round(m)) : m.toFixed(1).replace(".", ",");
    return `${sign}${s} млн ₽`;
  }
  return `${value.toLocaleString("ru-RU")} ₽`;
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
