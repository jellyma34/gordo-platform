import { periodKeyToRuChartLabel } from "@/lib/buildCashflowSeries";
import { rubToCashflowChartUnit } from "@/lib/cashflowChartUnits";
import type { InstallmentForecastNormalizedRow } from "@/lib/planDataSource/installmentForecast/types";

/** Минимальный месяц прогноза (включительно), см. ТЗ блока рассрочки. */
export const INSTALLMENT_FORECAST_MIN_PERIOD_KEY = "2026-05";

export type InstallmentForecastChartPoint = {
  periodKey: string;
  label: string;
  /** Помесячный прогноз, ₽. */
  amount: number;
  /** Накопительный прогноз, ₽. */
  cumulative: number;
  /** Помесячный прогноз, млн ₽ (ось графика). */
  amountUnit: number;
  /** Накопительный прогноз, млн ₽ (вторая серия). */
  cumulativeUnit: number;
};

export type InstallmentForecastSummary = {
  totalForecastRub: number;
  avgMonthlyRub: number;
  lastPeriodKey: string | null;
  lastPeriodLabel: string | null;
};

export function filterInstallmentForecastRows(
  rows: readonly InstallmentForecastNormalizedRow[],
  minPeriodKey = INSTALLMENT_FORECAST_MIN_PERIOD_KEY,
): InstallmentForecastNormalizedRow[] {
  return rows.filter((r) => r.paymentMonth >= minPeriodKey && r.amount > 0);
}

export function buildInstallmentForecastChartData(
  rows: readonly InstallmentForecastNormalizedRow[],
  minPeriodKey = INSTALLMENT_FORECAST_MIN_PERIOD_KEY,
): { chartPoints: InstallmentForecastChartPoint[]; summary: InstallmentForecastSummary } {
  const forecastRows = filterInstallmentForecastRows(rows, minPeriodKey);
  const byMonth = new Map<string, number>();

  for (const row of forecastRows) {
    byMonth.set(row.paymentMonth, (byMonth.get(row.paymentMonth) ?? 0) + row.amount);
  }

  const periodKeys = [...byMonth.keys()].sort((a, b) => a.localeCompare(b));
  let cumulative = 0;
  const chartPoints: InstallmentForecastChartPoint[] = periodKeys.map((periodKey) => {
    const amount = byMonth.get(periodKey) ?? 0;
    cumulative += amount;
    const amountUnit = rubToCashflowChartUnit(amount) ?? 0;
    const cumulativeUnit = rubToCashflowChartUnit(cumulative) ?? 0;
    return {
      periodKey,
      label: periodKeyToRuChartLabel(periodKey),
      amount,
      cumulative,
      amountUnit,
      cumulativeUnit,
    };
  });

  const totalForecastRub = chartPoints.reduce((s, p) => s + p.amount, 0);
  const monthCount = chartPoints.length;
  const lastPeriodKey = monthCount > 0 ? chartPoints[monthCount - 1]!.periodKey : null;

  return {
    chartPoints,
    summary: {
      totalForecastRub,
      avgMonthlyRub: monthCount > 0 ? totalForecastRub / monthCount : 0,
      lastPeriodKey,
      lastPeriodLabel: lastPeriodKey ? periodKeyToRuChartLabel(lastPeriodKey) : null,
    },
  };
}
