import { cashflowYAxisScale, numFmt } from "@/lib/salesPlanChartFormat";

const MIL = 1_000_000;

/** Подпись точки расходов: «1,1» (млн, без суффикса). */
export function formatMillionsShort(valueRub: number): string {
  if (!Number.isFinite(valueRub)) return "";
  const sign = valueRub < 0 ? "−" : "";
  return `${sign}${(Math.abs(valueRub) / MIL).toFixed(1).replace(".", ",")}`;
}

/** Ось Y расходов: «0 млн», «0,5 млн», «1 млн» … */
export function formatMarketingAdSpendAxisTick(rub: number): string {
  if (!Number.isFinite(rub)) return "";
  if (rub === 0) return "0 млн";
  const sign = rub < 0 ? "−" : "";
  return `${sign}${(Math.abs(rub) / MIL).toFixed(1).replace(".", ",")} млн`;
}

/** Тултип расходов: полная сумма в ₽. */
export function formatMarketingAdSpendTooltipRub(rub: number): string {
  if (!Number.isFinite(rub)) return "—";
  return `${numFmt.format(rub)} ₽`;
}

/** @deprecated Используйте {@link formatMarketingAdSpendAxisTick}. */
export function formatMarketingLeadsRubAxisTick(rub: number): string {
  return formatMarketingAdSpendAxisTick(rub);
}

/**
 * Автошкала ₽ для блока «Маркетинг»: при малых суммах — шаг 0.5 млн, иначе как у кэшфлоу.
 */
export function marketingLeadsRubYAxisScale(valuesRub: number[]): { domainMax: number; ticks: number[] } {
  const vals = valuesRub.filter((n) => Number.isFinite(n) && n >= 0);
  const max = vals.length > 0 ? Math.max(...vals) : 0;
  const maxMln = max / MIL;

  if (maxMln <= 0) {
    return {
      domainMax: 2 * MIL,
      ticks: [0, 0.5 * MIL, 1 * MIL, 1.5 * MIL, 2 * MIL],
    };
  }

  if (maxMln < 5) {
    const hiMln = Math.max(1.5, Math.ceil(maxMln * 1.12 * 2) / 2);
    const stepMln = 0.5;
    const domainMax = hiMln * MIL;
    const ticks: number[] = [];
    for (let t = 0; t <= hiMln + 1e-9; t += stepMln) {
      ticks.push(t * MIL);
    }
    return { domainMax, ticks };
  }

  return cashflowYAxisScale(vals, { headroom: 1.12 });
}

/** Целочисленная шкала лидов — шаг 20. */
export function marketingLeadsIntegerYAxisScale(values: number[]): { domainMax: number; ticks: number[] } {
  const max = values.length > 0 ? Math.max(0, ...values.filter(Number.isFinite)) : 0;
  if (max <= 0) {
    const ticks: number[] = [];
    for (let t = 0; t <= 100; t += 20) ticks.push(t);
    return { domainMax: 100, ticks };
  }

  const headroom = max * 1.12;
  const domainMax = Math.max(20, Math.ceil(headroom / 20) * 20);
  const ticks: number[] = [];
  for (let t = 0; t <= domainMax; t += 20) ticks.push(t);
  return { domainMax, ticks };
}

/** Подпись стоимости лида (без копеек). */
export function formatMarketingCostPerLeadRub(rub: number): string {
  if (!Number.isFinite(rub)) return "—";
  return `${numFmt.format(Math.round(rub))} ₽`;
}

/** Ось Y: «0 ₽», «5 000 ₽», «10 000 ₽» … */
export function formatMarketingCostPerLeadAxisTick(rub: number): string {
  if (!Number.isFinite(rub)) return "";
  const n = Math.round(rub);
  if (n === 0) return "0 ₽";
  return `${numFmt.format(n)} ₽`;
}

/** Автошкала стоимости лида (₽). */
export function marketingCostPerLeadYAxisScale(valuesRub: number[]): { domainMax: number; ticks: number[] } {
  const vals = valuesRub.filter((n) => Number.isFinite(n) && n >= 0);
  const max = vals.length > 0 ? Math.max(...vals) : 0;
  if (max <= 0) {
    return { domainMax: 30_000, ticks: [0, 10_000, 20_000, 30_000] };
  }

  const padded = max * 1.12;
  let step = 5_000;
  if (padded > 50_000) step = 10_000;
  if (padded > 120_000) step = 20_000;
  const domainMax = Math.max(step, Math.ceil(padded / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= domainMax + 1e-9; t += step) ticks.push(Math.round(t));
  return { domainMax, ticks };
}
