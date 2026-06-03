import { periodKeyToRuChartLabel } from "@/lib/buildCashflowSeries";
import { rubToCashflowChartUnit } from "@/lib/cashflowChartUnits";
import {
  ensurePlatformTodayMonthOnInstallmentAxis,
  ensureReportingMonthOnInstallmentAxis,
  resolvePlatformCurrentDateYmd,
  resolvePlatformMonthPeriodKey,
} from "@/lib/installmentForecastChartTodayLine";
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
import { quarterKeyToMonthKeys } from "@/lib/planDataSource/selectPlanForKpi";
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
  /** Помесячный факт поступлений, ₽ (null — нет данных за месяц или месяц после отчётной даты). */
  factAmount: number | null;
  /** Накопительный факт поступлений, ₽ (null — после отчётного месяца). */
  factCumulative: number | null;
  /** Помесячный факт, млн ₽. */
  factAmountUnit: number | null;
  /** Накопительный факт, млн ₽ (null — после отчётного месяца). */
  factCumulativeUnit: number | null;
  /** Точка совпадает с отчётным месяцем маркетинга (отсечение факта). */
  isReportingMonth?: boolean;
  /** Точка совпадает с месяцем текущей даты платформы (вертикальная линия). */
  isTodayMonth?: boolean;
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

export type BuildInstallmentForecastChartDataOptions = {
  minPeriodKey?: string;
  /** Помесячный факт поступлений (₽) из CSV фактических платежей по договорам. */
  factByPeriodKey?: Readonly<Record<string, number>> | null;
  /**
   * Отчётный месяц маркетинга (YYYY-MM): факт рисуется только до этого месяца включительно.
   * Не брать системную дату и не последний месяц массива.
   */
  factThroughPeriodKey?: string | null;
};

/** Отчётный месяц (YYYY-MM) из ключа периода маркетинга (месяц или квартал). */
export function resolveInstallmentFactThroughPeriodKey(
  currentPeriodKey: string | null | undefined,
  period: "month" | "quarter" = "month",
): string | null {
  const raw = currentPeriodKey?.trim();
  if (!raw) return null;
  if (period === "quarter") {
    const months = quarterKeyToMonthKeys(raw);
    if (months?.length) return months[months.length - 1]!;
  }
  return normalizeMonthKey(raw);
}

function isAfterFactThroughPeriod(periodKey: string, factThroughPeriodKey: string | null): boolean {
  return factThroughPeriodKey != null && periodKey > factThroughPeriodKey;
}

export function buildInstallmentForecastChartData(
  rows: readonly InstallmentForecastNormalizedRow[],
  options: BuildInstallmentForecastChartDataOptions | string = INSTALLMENT_FORECAST_MIN_PERIOD_KEY,
): { chartPoints: InstallmentForecastChartPoint[]; summary: InstallmentForecastSummary } {
  const minPeriodKey =
    typeof options === "string" ? options : (options.minPeriodKey ?? INSTALLMENT_FORECAST_MIN_PERIOD_KEY);
  const factByPeriodKey = typeof options === "string" ? null : (options.factByPeriodKey ?? null);
  const factThroughPeriodKey =
    typeof options === "string" ? null : (options.factThroughPeriodKey ?? null);
  const currentDateYmd = resolvePlatformCurrentDateYmd();
  const platformMonthKey = resolvePlatformMonthPeriodKey(currentDateYmd);

  const forecastRows = filterInstallmentForecastRows(rows, minPeriodKey);
  const byMonth = new Map<string, number>();

  for (const row of forecastRows) {
    byMonth.set(row.paymentMonth, (byMonth.get(row.paymentMonth) ?? 0) + row.amount);
  }

  const periodKeys = ensurePlatformTodayMonthOnInstallmentAxis(
    ensureReportingMonthOnInstallmentAxis([...byMonth.keys()], factThroughPeriodKey),
    currentDateYmd,
  );
  let cumulative = 0;
  let factCumulative = 0;
  const chartPoints: InstallmentForecastChartPoint[] = periodKeys.map((periodKey) => {
    const amount = byMonth.get(periodKey) ?? 0;
    cumulative += amount;
    const amountUnit = rubToCashflowChartUnit(amount) ?? 0;
    const cumulativeUnit = rubToCashflowChartUnit(cumulative) ?? 0;

    const afterFactCutoff = isAfterFactThroughPeriod(periodKey, factThroughPeriodKey);

    let factAmount: number | null = null;
    if (!afterFactCutoff && factByPeriodKey != null) {
      const factRaw = Object.prototype.hasOwnProperty.call(factByPeriodKey, periodKey)
        ? Number(factByPeriodKey[periodKey])
        : null;
      if (factRaw != null && Number.isFinite(factRaw) && factRaw >= 0) {
        factAmount = factRaw;
        factCumulative += factRaw;
      }
    }

    return {
      periodKey,
      label: periodKeyToRuChartLabel(periodKey),
      amount,
      cumulative,
      amountUnit,
      cumulativeUnit,
      factAmount,
      factCumulative: afterFactCutoff ? null : factCumulative,
      factAmountUnit: factAmount != null ? rubToCashflowChartUnit(factAmount) : null,
      factCumulativeUnit: afterFactCutoff ? null : rubToCashflowChartUnit(factCumulative),
      isReportingMonth: factThroughPeriodKey != null && periodKey === factThroughPeriodKey,
      isTodayMonth: platformMonthKey != null && periodKey === platformMonthKey,
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
