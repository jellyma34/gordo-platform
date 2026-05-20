/** Месяцы фильтра по умолчанию (если в данных/API ещё нет других ключей). */
export const UNITS_EXECUTION_DEFAULT_MONTH_KEYS = [
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
] as const;

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

const SEGMENT_KEYS = ["apartments", "parking", "storage", "commercial"] as const;

/**
 * Помесячный план (шт.) — только значения за отчётный месяц (Excel).
 * Накопительный план в коде: {@link getCumulativePlanForMonth}.
 */
export const monthlyPlanByMonth: Record<string, CumulativeExecutionSegmentCounts> = {
  "2026-01": {
    apartments: 3,
    parking: 1,
    storage: 1,
    commercial: 0,
  },
  "2026-02": {
    apartments: 3,
    parking: 2,
    storage: 0,
    commercial: 0,
  },
  "2026-03": {
    apartments: 2,
    parking: 1,
    storage: 1,
    commercial: 0,
  },
  "2026-04": {
    apartments: 2,
    parking: 1,
    storage: 1,
    commercial: 0,
  },
};

function emptyCounts(): CumulativeExecutionSegmentCounts {
  return { apartments: 0, parking: 0, storage: 0, commercial: 0 };
}

/** Месяц участвует в накопительном исполнении (≥ январь 2026). */
export function isUnitsExecutionAccumulationMonth(monthKey: string): boolean {
  return /^\d{4}-\d{2}$/.test(monthKey) && monthKey >= UNITS_EXECUTION_START_ACCUMULATION_MONTH;
}

/** План за один отчётный месяц (0, если месяца нет в Excel). */
export function getMonthlyPlanForMonth(monthKey: string): CumulativeExecutionSegmentCounts {
  const m = monthlyPlanByMonth[monthKey];
  return m ? { ...m } : emptyCounts();
}

/** Накопительный план: сумма помесячных планов с января 2026 по `throughMonthKey` включительно. */
export function sumMonthlyPlanThroughMonth(throughMonthKey: string): CumulativeExecutionSegmentCounts {
  const acc = emptyCounts();
  for (const mk of Object.keys(monthlyPlanByMonth).sort()) {
    if (mk < UNITS_EXECUTION_START_ACCUMULATION_MONTH) continue;
    if (mk > throughMonthKey) break;
    const m = monthlyPlanByMonth[mk];
    if (!m) continue;
    for (const k of SEGMENT_KEYS) {
      acc[k] += Number.isFinite(m[k]) ? m[k] : 0;
    }
  }
  return acc;
}

/** Накопительный план на конец месяца (строится из {@link monthlyPlanByMonth}, не из CSV). */
export function getCumulativePlanForMonth(monthKey: string): CumulativeExecutionSegmentCounts {
  if (monthKey < UNITS_EXECUTION_START_ACCUMULATION_MONTH) return emptyCounts();
  return sumMonthlyPlanThroughMonth(monthKey);
}

/** Сумма помесячных планов (шт.) по всем месяцам горизонта — для графика «Период = Все». */
export function sumAllMonthlyPlanUnits(): CumulativeExecutionSegmentCounts {
  const acc = emptyCounts();
  for (const mk of Object.keys(monthlyPlanByMonth).sort()) {
    if (mk < UNITS_EXECUTION_START_ACCUMULATION_MONTH) continue;
    const m = getMonthlyPlanForMonth(mk);
    for (const k of SEGMENT_KEYS) {
      acc[k] += Number.isFinite(m[k]) ? m[k] : 0;
    }
  }
  return acc;
}

/** @deprecated Используйте {@link monthlyPlanByMonth} + {@link getCumulativePlanForMonth}. */
export const cumulativePlanByMonth: Record<string, CumulativeExecutionSegmentCounts> = (() => {
  const out: Record<string, CumulativeExecutionSegmentCounts> = {};
  for (const mk of Object.keys(monthlyPlanByMonth).sort()) {
    out[mk] = getCumulativePlanForMonth(mk);
  }
  return out;
})();

/** @deprecated Используйте {@link monthlyPlanByMonth}. */
export const cumulativeExecutionByMonth = cumulativePlanByMonth;

/**
 * Ключи месяцев для dropdown: дефолт + план + месяцы из сделок (JSON/API).
 */
export function resolveUnitsExecutionMonthKeys(dealsMonthKeys?: readonly string[]): string[] {
  const keys = new Set<string>(UNITS_EXECUTION_DEFAULT_MONTH_KEYS);
  for (const k of Object.keys(monthlyPlanByMonth)) keys.add(k);
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
