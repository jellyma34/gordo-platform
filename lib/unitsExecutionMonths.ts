/** Месяцы фильтра по умолчанию (если в данных/API ещё нет других ключей). */
export const UNITS_EXECUTION_DEFAULT_MONTH_KEYS = ["2026-01", "2026-02", "2026-04", "2026-05"] as const;

/** @deprecated Используйте {@link resolveUnitsExecutionMonthKeys}. */
export const executionMonths = UNITS_EXECUTION_DEFAULT_MONTH_KEYS;

export type UnitsExecutionMonthKey = string;

/** Накопление плана/факта в штуках — только с этой даты (включительно). */
export const UNITS_EXECUTION_START_ACCUMULATION_YMD = "2026-01-01";

/** Канонический ключ месяца старта накопления (`YYYY-MM`). */
export const UNITS_EXECUTION_START_ACCUMULATION_MONTH = "2026-01";

/** Базовый месяц накопительного CSV (февраль 2026). */
export const UNITS_EXECUTION_BASE_MONTH = "2026-02";

export const DEFAULT_UNITS_EXECUTION_MONTH = UNITS_EXECUTION_BASE_MONTH;

export type CumulativeExecutionSegmentCounts = {
  apartments: number;
  parking: number;
  storage: number;
  commercial: number;
};

/**
 * Накопительный план (шт.) на конец отчётного месяца — по Excel.
 */
export const cumulativePlanByMonth: Record<string, CumulativeExecutionSegmentCounts> = {
  "2026-01": {
    apartments: 13,
    parking: 7,
    storage: 4,
    commercial: 0,
  },
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

function emptyCounts(): CumulativeExecutionSegmentCounts {
  return { apartments: 0, parking: 0, storage: 0, commercial: 0 };
}

/** Месяц участвует в накопительном исполнении (≥ январь 2026). */
export function isUnitsExecutionAccumulationMonth(monthKey: string): boolean {
  return /^\d{4}-\d{2}$/.test(monthKey) && monthKey >= UNITS_EXECUTION_START_ACCUMULATION_MONTH;
}

/** План на конец месяца: последний известный снимок с ключом ≤ `monthKey` (с января 2026). */
export function getCumulativePlanForMonth(monthKey: string): CumulativeExecutionSegmentCounts {
  if (monthKey < UNITS_EXECUTION_START_ACCUMULATION_MONTH) return emptyCounts();
  const keys = Object.keys(cumulativePlanByMonth)
    .filter((k) => k >= UNITS_EXECUTION_START_ACCUMULATION_MONTH)
    .sort();
  let last = emptyCounts();
  for (const k of keys) {
    if (k > monthKey) break;
    last = { ...cumulativePlanByMonth[k]! };
  }
  return last;
}

/**
 * Ключи месяцев для dropdown: дефолт + план + месяцы из сделок (JSON/API).
 */
export function resolveUnitsExecutionMonthKeys(dealsMonthKeys?: readonly string[]): string[] {
  const keys = new Set<string>(UNITS_EXECUTION_DEFAULT_MONTH_KEYS);
  for (const k of Object.keys(cumulativePlanByMonth)) keys.add(k);
  for (const mk of dealsMonthKeys ?? []) {
    const n = mk.trim();
    if (isUnitsExecutionAccumulationMonth(n)) keys.add(n);
  }
  return [...keys].sort();
}

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
  return /^\d{4}-\d{2}$/.test(monthKey);
}
