import { rubToCashflowChartUnit } from "@/lib/cashflowChartUnits";
import { cumulativeDealCountThroughMonthMap } from "@/lib/marketingDealMonthCumulative";

const RU_MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"] as const;

export type CashflowSeriesRow = {
  periodKey: string;
  label: string;
  /** План поступлений за месяц, ₽ (из CSV: колонки «План …»). */
  planMonth: number;
  /** Факт поступлений за месяц, ₽ — только из отдельного CSV факта (колонки «зайдет …»); иначе `null`. */
  factMonth: number | null;
};

/**
 * Поступления: **план** только из CSV графика платежей; **факт** — только из отдельного CSV притока
 * (колонки «зайдет …», нижняя строка итогов). Источники не смешиваются.
 */

export function periodKeyToRuChartLabel(periodKey: string): string {
  const y = periodKey.slice(0, 4);
  const m = periodKey.slice(5, 7);
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m)) return periodKey;
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return periodKey;
  const yy = y.slice(2);
  return `${RU_MONTH_SHORT[mi]}. ${yy}`;
}

/** Текущий календарный месяц `YYYY-MM` (локальное время). */
export function cashflowCalendarNowPeriodKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * Последний месяц **включительно**, для которого на графике рисуется **план** (оранжевая серия):
 * не позже текущего календарного месяца; при явном `planDisplayThroughPeriodKey` в прошлом — не позже этой границы.
 * Серия **факта** (синяя) по горизонту не ограничивается этой функцией.
 */
export function cashflowPlanDisplayEndPeriodKey(
  planDisplayThroughPeriodKey?: string | null,
  now: Date = new Date(),
): string {
  const nowKey = cashflowCalendarNowPeriodKey(now);
  const raw = planDisplayThroughPeriodKey?.trim();
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    return raw < nowKey ? raw : nowKey;
  }
  return nowKey;
}

export type BuildCashflowSeriesOptions = {
  salesStartPeriodKey?: string | null;
  /**
   * Зарезервировано (совместимость с вызовами): граница отображения **плана** задаётся
   * в {@link cashflowRowsForChart}, не здесь.
   */
  factThroughPeriodKey?: string | null;
  /**
   * Сделки из помесячного JSON (`dealDateMs`): если к концу месяца **накопленное** число сделок
   * совпадает с предыдущим календарным месяцем в ряду — новых продаж не было, `factMonth` для этого месяца = 0
   * (не дублируем факт поступлений из CSV и не тянем значение «Нарастающим» через forward-fill).
   */
  dealDatesForStagnantMonthCheck?: readonly { dealDateMs: number }[] | null;
};

/**
 * Если `dealsCount` на конец месяца не вырос к предыдущему месяцу ряда — в этом месяце не было новых продаж: `factMonth = 0`.
 * Соответствует правилу: `currentMonth.dealsCount === previousMonth.dealsCount` → продажи за месяц 0.
 */
function applyStagnantDealCountZeroFactMonth(
  rows: CashflowSeriesRow[],
  dealRows: readonly { dealDateMs: number }[] | null | undefined,
): CashflowSeriesRow[] {
  if (!dealRows?.length || rows.length < 2) return rows;
  const keys = rows.map((r) => r.periodKey);
  const cum = cumulativeDealCountThroughMonthMap(dealRows, keys);
  return rows.map((row, i) => {
    if (i === 0) return row;
    const prevPk = rows[i - 1]!.periodKey;
    const curC = cum[row.periodKey];
    const prevC = cum[prevPk];
    if (curC === undefined || prevC === undefined) return row;
    if (curC === prevC) {
      return { ...row, factMonth: 0 };
    }
    return row;
  });
}

export function buildCashflowSeries(
  planByPeriodKey: Readonly<Record<string, number>> | null | undefined,
  factByPeriodKey: Readonly<Record<string, number>> | null | undefined,
  options?: BuildCashflowSeriesOptions,
): CashflowSeriesRow[] {
  const salesStartRaw = options?.salesStartPeriodKey?.trim();
  const salesStart =
    salesStartRaw && /^\d{4}-\d{2}$/.test(salesStartRaw) ? salesStartRaw : null;
  const plan = planByPeriodKey ?? {};
  const fact = factByPeriodKey ?? null;
  const hasFactSeries = fact != null && Object.keys(fact).length > 0;

  const keys = new Set<string>();
  for (const k of Object.keys(plan)) {
    if (!/^\d{4}-\d{2}$/.test(k)) continue;
    if (salesStart && k < salesStart) continue;
    keys.add(k);
  }
  if (hasFactSeries) {
    for (const k of Object.keys(fact!)) {
      if (!/^\d{4}-\d{2}$/.test(k)) continue;
      if (salesStart && k < salesStart) continue;
      keys.add(k);
    }
  }

  const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b));

  let rows: CashflowSeriesRow[] = sortedKeys.map((periodKey) => {
    const planRaw = plan[periodKey];
    const planMonth = planRaw != null && Number.isFinite(Number(planRaw)) ? Number(planRaw) : 0;
    let factMonth: number | null = null;
    if (hasFactSeries) {
      if (Object.prototype.hasOwnProperty.call(fact!, periodKey)) {
        const fv = fact![periodKey];
        factMonth = fv != null && Number.isFinite(Number(fv)) ? Number(fv) : null;
      } else {
        factMonth = null;
      }
    }
    const label = periodKeyToRuChartLabel(periodKey);
    return { periodKey, label, planMonth, factMonth };
  });

  rows = hasFactSeries
    ? applyStagnantDealCountZeroFactMonth(rows, options?.dealDatesForStagnantMonthCheck ?? null)
    : rows;

  while (rows.length > 1) {
    const last = rows[rows.length - 1]!;
    const planNonZero = last.planMonth !== 0;
    const factNonZero = last.factMonth != null && last.factMonth !== 0;
    if (planNonZero || factNonZero) break;
    rows.pop();
  }

  return rows;
}

export type CashflowChartMode = "monthly" | "cumulative";

/**
 * Строка для Recharts: `fact` — синяя «Факт» (полный горизонт из CSV);
 * `plan` — оранжевая «План» (после {@link cashflowPlanDisplayEndPeriodKey} — `null`, линия не рисуется).
 * Значения `plan` / `fact` / `deviation` — в **единицах графика** (1 = 1 млн ₽), см. {@link rubToCashflowChartUnit}.
 */
export type CashflowChartRow = {
  periodKey: string;
  label: string;
  /** Оранжевая серия (план); после границы отображения — `null`. */
  plan: number | null;
  /** Синяя серия (факт). */
  fact: number | null;
  deviation: number | null;
};

export type CashflowRowsForChartOptions = {
  /**
   * Граница включительно для **плана** (YYYY-MM): позже — `plan: null` на графике.
   * `null`/не задано — текущий календарный месяц. На **факт** не влияет.
   */
  factThroughPeriodKey?: string | null;
  /** false — нет CSV плана поступлений: оранжевая серия и подписи плана скрыты. */
  includePlanSeries?: boolean;
};

function displayedPlanOrFactNonZero(row: CashflowChartRow): boolean {
  const p = row.plan;
  if (p != null && Number.isFinite(p) && Math.abs(p) > 1e-9) return true;
  const f = row.fact;
  if (f != null && Number.isFinite(f) && Math.abs(f) > 1e-9) return true;
  return false;
}

/**
 * Обрезка по **финальным** значениям серий на графике (после merge/null плана и forward-fill факта).
 * Убирает только хвост, где и отображаемый план, и отображаемый факт нулевые/отсутствуют.
 */
export function trimTrailingEmptyCashflowDisplayedRows(chartRows: CashflowChartRow[]): {
  rows: CashflowChartRow[];
  lastVisibleIndex: number;
} {
  let lastVisibleIndex = -1;
  for (let i = 0; i < chartRows.length; i++) {
    if (displayedPlanOrFactNonZero(chartRows[i]!)) lastVisibleIndex = i;
  }
  if (lastVisibleIndex < 0) return { rows: chartRows, lastVisibleIndex: -1 };
  return {
    rows: chartRows.slice(0, lastVisibleIndex + 1),
    lastVisibleIndex,
  };
}

function planOrFactNonZeroInSource(s: CashflowSeriesRow): boolean {
  const p = s.planMonth;
  if (Number.isFinite(p) && Math.abs(p) > 1e-9) return true;
  const f = s.factMonth;
  if (f != null && Number.isFinite(f) && Math.abs(f) > 1e-9) return true;
  return false;
}

type ScaledCashflowSeriesRow = CashflowSeriesRow & { planMonthScaled: number };

function buildMonthlyCashflowChartRows(
  scaled: readonly ScaledCashflowSeriesRow[],
  planDisplayEnd: string,
  includePlanSeries: boolean,
): CashflowChartRow[] {
  let lastSourceFactIndex = -1;
  for (let i = 0; i < scaled.length; i++) {
    if (scaled[i]!.factMonth != null) lastSourceFactIndex = i;
  }
  let lastRawMonthly: number | null = null;
  return scaled.map((r, i) => {
    const planFull = r.planMonthScaled;
    const afterPlanEnd = r.periodKey > planDisplayEnd;
    const raw = r.factMonth;
    if (raw != null) lastRawMonthly = raw;
    let factDisplayed =
      raw != null ? raw : lastRawMonthly != null ? lastRawMonthly : null;
    if (lastSourceFactIndex >= 0 && i > lastSourceFactIndex && raw == null) {
      factDisplayed = null;
    }
    const planDisplayed = !includePlanSeries || afterPlanEnd ? null : planFull;
    const planUnit =
      planDisplayed != null && Math.abs(planDisplayed) > 1e-9
        ? rubToCashflowChartUnit(planDisplayed)
        : null;
    const factUnit = factDisplayed != null ? rubToCashflowChartUnit(factDisplayed) : null;
    const deviation =
      afterPlanEnd || raw == null || planUnit == null || factUnit == null ? null : factUnit - planUnit;
    return {
      periodKey: r.periodKey,
      label: r.label,
      plan: planUnit,
      fact: factUnit,
      deviation,
    };
  });
}

/**
 * Последний месяц с **помесячными** поступлениями (не кумулятивом): ненулевой факт в CSV
 * или ненулевой план в пределах границы отображения плана.
 * Кумулятив после конца данных повторяет последнее Σ — по нему обрезку не делаем.
 */
export function lastCashflowVisibleMonthIndex(
  scaled: readonly ScaledCashflowSeriesRow[],
  planDisplayEnd: string,
): number {
  const monthly = buildMonthlyCashflowChartRows(scaled, planDisplayEnd, true);
  return trimTrailingEmptyCashflowDisplayedRows(monthly).lastVisibleIndex;
}

/**
 * Обрезка кумулятивного ряда по индексу последнего месяца с реальными помесячными данными.
 */
export function trimCashflowChartRowsToVisibleMonth(
  chartRows: CashflowChartRow[],
  lastVisibleIndex: number,
): CashflowChartRow[] {
  if (chartRows.length === 0 || lastVisibleIndex < 0) return chartRows;
  if (lastVisibleIndex >= chartRows.length - 1) return chartRows;
  return chartRows.slice(0, lastVisibleIndex + 1);
}

/**
 * Убирает хвост по **исходным** помесячным planMonth / factMonth (без кумулятива).
 * @deprecated Prefer {@link lastCashflowVisibleMonthIndex} + {@link trimCashflowChartRowsToVisibleMonth}.
 */
export function trimTrailingEmptyCashflowChartRows(
  chartRows: CashflowChartRow[],
  sourceRows: readonly CashflowSeriesRow[],
): CashflowChartRow[] {
  if (chartRows.length === 0) return chartRows;
  if (chartRows.length !== sourceRows.length) return chartRows;
  let last = -1;
  for (let i = 0; i < sourceRows.length; i++) {
    if (planOrFactNonZeroInSource(sourceRows[i]!)) last = i;
  }
  if (last < 0) return chartRows;
  return chartRows.slice(0, last + 1);
}

function logCashflowFinalTimeline(
  mode: CashflowChartMode,
  rows: CashflowChartRow[],
  lastVisibleIndex: number,
): void {
  if (rows.length === 0) return;
  const planData = rows.map((r) => r.plan);
  const factData = rows.map((r) => r.fact);
  const li = lastVisibleIndex >= 0 ? lastVisibleIndex : rows.length - 1;
  console.log("[cashflow chart timeline]", {
    mode,
    labelsLen: rows.length,
    factLen: factData.length,
    planLen: planData.length,
    lastVisibleIndex: li,
    lastLabel: rows[li]?.label,
  });
}

/**
 * Помесячные точки для графика: `plan` / `fact` — только величины **за месяц**.
 * В режиме «Нарастающим итогом» кумулятив считается здесь **один раз** (сумма помесячных).
 * Факт — полный горизонт `rows`; план для `periodKey` строго после границы отображения — `null`.
 * Хвост обоих режимов: последний месяц с ненулевыми **помесячными** plan/fact (не по плато кумулятива).
 */
export function cashflowRowsForChart(
  rows: CashflowSeriesRow[],
  mode: CashflowChartMode,
  planScale: number,
  options?: CashflowRowsForChartOptions,
): CashflowChartRow[] {
  const planDisplayEnd = cashflowPlanDisplayEndPeriodKey(options?.factThroughPeriodKey ?? null);
  const includePlanSeries = options?.includePlanSeries === true;
  const scale = Number.isFinite(planScale) && planScale > 0 ? planScale : 1;
  const scaled = rows.map((r) => ({
    ...r,
    planMonthScaled: Math.round(r.planMonth * scale),
  }));

  const lastVisibleIndex = lastCashflowVisibleMonthIndex(scaled, planDisplayEnd);

  if (mode === "monthly") {
    const monthly = buildMonthlyCashflowChartRows(scaled, planDisplayEnd, includePlanSeries);
    const trimmedMonthly = trimCashflowChartRowsToVisibleMonth(monthly, lastVisibleIndex);
    logCashflowFinalTimeline(
      mode,
      trimmedMonthly,
      lastVisibleIndex >= 0 ? lastVisibleIndex : -1,
    );
    return trimmedMonthly;
  }

  let accPlan = 0;
  let accFact = 0;
  let hadCsvFact = false;
  const cumulative = scaled.map((r) => {
    accPlan += r.planMonthScaled;
    const raw = r.factMonth;
    if (raw != null) {
      accFact += raw;
      hadCsvFact = true;
    }
    const afterPlanEnd = r.periodKey > planDisplayEnd;
    const planDisplayed = !includePlanSeries || afterPlanEnd ? null : accPlan;
    const factDisplayed = hadCsvFact ? accFact : null;
    const planUnit =
      planDisplayed != null && Math.abs(planDisplayed) > 1e-9
        ? rubToCashflowChartUnit(planDisplayed)
        : null;
    const factUnit = factDisplayed != null ? rubToCashflowChartUnit(factDisplayed) : null;
    return {
      periodKey: r.periodKey,
      label: r.label,
      plan: planUnit,
      fact: factUnit,
      deviation:
        afterPlanEnd || planUnit == null || factUnit == null ? null : factUnit - planUnit,
    };
  });
  const trimmedCum = trimCashflowChartRowsToVisibleMonth(cumulative, lastVisibleIndex);
  logCashflowFinalTimeline(
    mode,
    trimmedCum,
    lastVisibleIndex >= 0 ? lastVisibleIndex : trimmedCum.length > 0 ? trimmedCum.length - 1 : -1,
  );
  return trimmedCum;
}
