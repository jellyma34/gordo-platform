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

/** Подписи на графике «Динамика поступлений»: до 1 знака после запятой (115 млн, 43,4 млн). */
export function formatCashflowDynamicsChartLabel(n: number): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  const fmt1 = (x: number) => {
    const r = Math.round(x * 10) / 10;
    if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
    return r.toFixed(1).replace(".", ",").replace(/,?0$/, "");
  };
  if (abs >= 1_000_000_000) return `${sign}${fmt1(abs / 1_000_000_000)} млрд`;
  if (abs >= 1_000_000) return `${sign}${fmt1(abs / 1_000_000)} млн`;
  if (abs >= 1_000) return `${sign}${numFmt.format(Math.round(abs / 1_000))} тыс`;
  return `${sign}${numFmt.format(Math.round(abs))}`;
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
