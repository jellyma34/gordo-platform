/** Доступные месяцы фильтра «Исполнение плана продаж (штуки)». */
export const executionMonths = ["2026-02", "2026-04", "2026-05"] as const;

export type UnitsExecutionMonthKey = (typeof executionMonths)[number];

/** Базовый месяц накопительного CSV (февраль 2026). */
export const UNITS_EXECUTION_BASE_MONTH: UnitsExecutionMonthKey = "2026-02";

export const DEFAULT_UNITS_EXECUTION_MONTH: UnitsExecutionMonthKey = UNITS_EXECUTION_BASE_MONTH;

export type CumulativeExecutionSegmentCounts = {
  apartments: number;
  parking: number;
  storage: number;
  commercial: number;
};

/**
 * Накопительный план (шт.) по месяцам — строго по Excel.
 * Февраль = база CSV; апрель/май = база + доначисления из отчёта.
 */
export const cumulativePlanByMonth: Record<UnitsExecutionMonthKey, CumulativeExecutionSegmentCounts> = {
  "2026-02": {
    apartments: 19,
    parking: 7,
    storage: 5,
    commercial: 3,
  },
  "2026-04": {
    apartments: 21,
    parking: 8,
    storage: 6,
    commercial: 3,
  },
  "2026-05": {
    apartments: 21,
    parking: 8,
    storage: 6,
    commercial: 3,
  },
};

/** @deprecated Используйте {@link cumulativePlanByMonth}. */
export const cumulativeExecutionByMonth = cumulativePlanByMonth;

/** Подпись в dropdown: «февраль 2026 г.» */
export function unitsExecutionMonthLabelRu(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
    const month = new Date(y, m - 1, 1).toLocaleDateString("ru-RU", { month: "long" });
    return `${month} ${y} г.`;
  }
  return monthKey;
}

export function isUnitsExecutionMonthKey(monthKey: string): monthKey is UnitsExecutionMonthKey {
  return (executionMonths as readonly string[]).includes(monthKey);
}
