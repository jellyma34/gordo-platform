import { toLocalYmd } from "@/lib/gprReportDate";

/** Визуальный стиль вертикальной линии текущей даты платформы (как planFactMonthTodayLinePlugin в GPRAnalytics). */
export const INSTALLMENT_FORECAST_TODAY_LINE = {
  stroke: "rgba(163, 179, 199, 0.52)",
  strokeWidth: 1.5,
  strokeDasharray: "4 5",
  labelFontSize: 10,
  labelFontWeight: 600,
} as const;

export function installmentForecastTodayLineLabelFill(presDark: boolean): string {
  return presDark ? "rgba(226, 232, 240, 0.92)" : "rgba(71, 85, 105, 0.95)";
}

function parseLocalDateYmd(ymd: string): Date | null {
  const parts = ymd.trim().split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if ([y, m, d].some((n) => Number.isNaN(n))) return null;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** Текущая календарная дата платформы (локальное YYYY-MM-DD), не отчётный месяц. */
export function resolvePlatformCurrentDateYmd(now: Date = new Date()): string {
  return toLocalYmd(now);
}

/** Полная дата для подписи линии (DD.MM.YYYY). */
export function formatInstallmentPlatformDateLabel(currentDateYmd: string): string {
  const date = parseLocalDateYmd(currentDateYmd);
  if (!date) return currentDateYmd;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Месяц (YYYY-MM) текущей даты платформы. */
export function resolvePlatformMonthPeriodKey(
  currentDateYmd: string | null | undefined,
): string | null {
  if (!currentDateYmd?.trim()) return null;
  const monthKey = currentDateYmd.trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : null;
}

/** Доля месяца (0…1) для позиции линии внутри столбца месяца. */
export function installmentMonthDayFraction(currentDateYmd: string): number {
  const date = parseLocalDateYmd(currentDateYmd);
  if (!date) return 0.5;
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  if (daysInMonth <= 0) return 0.5;
  const day = date.getDate();
  return Math.min(1, Math.max(0, (day - 0.5) / daysInMonth));
}

/** Вставляет отчётный месяц на ось X, если его ещё нет среди прогнозных периодов. */
export function ensureReportingMonthOnInstallmentAxis(
  periodKeys: readonly string[],
  reportingPeriodKey: string | null | undefined,
): string[] {
  if (!reportingPeriodKey || !/^\d{4}-\d{2}$/.test(reportingPeriodKey)) {
    return [...periodKeys].sort((a, b) => a.localeCompare(b));
  }
  const sorted = [...new Set(periodKeys)].sort((a, b) => a.localeCompare(b));
  if (sorted.includes(reportingPeriodKey)) return sorted;
  return [...sorted, reportingPeriodKey].sort((a, b) => a.localeCompare(b));
}

/**
 * Вставляет месяц текущей даты платформы на ось X, если он внутри диапазона графика.
 */
export function ensurePlatformTodayMonthOnInstallmentAxis(
  periodKeys: readonly string[],
  currentDateYmd: string | null | undefined = resolvePlatformCurrentDateYmd(),
): string[] {
  const sorted = [...new Set(periodKeys)].sort((a, b) => a.localeCompare(b));
  if (!sorted.length) return sorted;

  const todayMonth = resolvePlatformMonthPeriodKey(currentDateYmd);
  if (!todayMonth) return sorted;

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (todayMonth < first || todayMonth > last) return sorted;
  if (sorted.includes(todayMonth)) return sorted;

  return [...sorted, todayMonth].sort((a, b) => a.localeCompare(b));
}

export type InstallmentTodayLineModel = {
  xCategoryLabel: string;
  dateLabel: string;
  currentDateYmd: string;
  monthPeriodKey: string;
  dayFractionInMonth: number;
  monthIndex: number;
};

type CategoryXScale = (
  label: string,
  opts?: { position?: "start" | "middle" | "end" },
) => number | undefined;

/** X-пиксель линии внутри месяца (Recharts category scale). */
export function resolveInstallmentTodayLinePixelX(
  todayLine: InstallmentTodayLineModel,
  xScale: CategoryXScale,
  chartPointCount: number,
  plotLeft: number,
  plotWidth: number,
): number | null {
  const label = todayLine.xCategoryLabel;
  const start = xScale(label, { position: "start" });
  const end = xScale(label, { position: "end" });
  if (
    start != null &&
    end != null &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > start
  ) {
    return start + todayLine.dayFractionInMonth * (end - start);
  }

  const mid = xScale(label, { position: "middle" }) ?? xScale(label);
  if (mid != null && Number.isFinite(mid)) return mid;

  return resolveInstallmentTodayLineCategoryPixelX(
    chartPointCount,
    todayLine.monthIndex,
    plotLeft,
    plotWidth,
    todayLine.dayFractionInMonth,
  );
}

/** Fallback: равномерная категориальная шкала (SVG-превью и запасной путь). */
export function resolveInstallmentTodayLineCategoryPixelX(
  chartPointCount: number,
  monthIndex: number,
  plotLeft: number,
  plotWidth: number,
  dayFractionInMonth: number,
): number {
  const n = chartPointCount;
  if (n <= 0) return plotLeft;
  const centerAt = (i: number) =>
    n <= 1 ? plotLeft + plotWidth / 2 : plotLeft + (i / (n - 1)) * plotWidth;
  const idx = Math.max(0, Math.min(n - 1, monthIndex));
  const center = centerAt(idx);
  const bandStart = idx === 0 ? plotLeft : (centerAt(idx - 1) + center) / 2;
  const bandEnd = idx === n - 1 ? plotLeft + plotWidth : (center + centerAt(idx + 1)) / 2;
  return bandStart + dayFractionInMonth * (bandEnd - bandStart);
}

/** Позиция и подпись вертикали: только если месяц текущей даты на шкале графика. */
export function resolveInstallmentTodayLineModel(
  chartPoints: readonly { periodKey: string; label: string }[],
  currentDateYmd: string | null | undefined = resolvePlatformCurrentDateYmd(),
): InstallmentTodayLineModel | null {
  if (!chartPoints.length || !currentDateYmd?.trim()) return null;

  const normalizedYmd = toLocalYmd(parseLocalDateYmd(currentDateYmd.trim()) ?? new Date());
  const monthPeriodKey = normalizedYmd.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(monthPeriodKey)) return null;

  const periodKeys = chartPoints.map((p) => p.periodKey);
  const first = periodKeys[0]!;
  const last = periodKeys[periodKeys.length - 1]!;
  if (monthPeriodKey < first || monthPeriodKey > last) return null;

  const monthIndex = chartPoints.findIndex((p) => p.periodKey === monthPeriodKey);
  if (monthIndex < 0) return null;

  const pt = chartPoints[monthIndex]!;

  return {
    xCategoryLabel: pt.label,
    dateLabel: formatInstallmentPlatformDateLabel(normalizedYmd),
    currentDateYmd: normalizedYmd,
    monthPeriodKey,
    dayFractionInMonth: installmentMonthDayFraction(normalizedYmd),
    monthIndex,
  };
}
