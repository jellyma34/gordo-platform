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

function nextMonthPeriodKey(periodKey: string): string {
  const [ys, ms] = periodKey.split("-").map(Number);
  let y = ys!;
  let mo = ms!;
  mo += 1;
  if (mo > 12) {
    mo = 1;
    y += 1;
  }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/**
 * Последний месяц, для которого на графике допускается «факт»: не позже сегодняшнего месяца;
 * при явном `factThroughPeriodKey` в прошлом — не позже этой границы.
 */
export function cashflowFactDisplayEndPeriodKey(
  factThroughPeriodKey?: string | null,
  now: Date = new Date(),
): string {
  const nowKey = cashflowCalendarNowPeriodKey(now);
  const raw = factThroughPeriodKey?.trim();
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    return raw < nowKey ? raw : nowKey;
  }
  return nowKey;
}

export type BuildCashflowSeriesOptions = {
  salesStartPeriodKey?: string | null;
  factThroughPeriodKey?: string | null;
};

export function buildCashflowSeries(
  planByPeriodKey: Readonly<Record<string, number>> | null | undefined,
  factByPeriodKey: Readonly<Record<string, number>> | null | undefined,
  options?: BuildCashflowSeriesOptions,
): CashflowSeriesRow[] {
  const salesStartRaw = options?.salesStartPeriodKey?.trim();
  const salesStart =
    salesStartRaw && /^\d{4}-\d{2}$/.test(salesStartRaw) ? salesStartRaw : null;
  const factThroughRaw = options?.factThroughPeriodKey?.trim();
  const factThrough =
    factThroughRaw && /^\d{4}-\d{2}$/.test(factThroughRaw) ? factThroughRaw : null;
  const displayEnd = cashflowFactDisplayEndPeriodKey(factThrough);

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

  const rows = sortedKeys.map((periodKey) => {
    const planRaw = plan[periodKey];
    const planMonth = planRaw != null && Number.isFinite(Number(planRaw)) ? Number(planRaw) : 0;
    let factMonth: number | null = null;
    if (hasFactSeries) {
      if (periodKey > displayEnd) {
        factMonth = null;
      } else if (Object.prototype.hasOwnProperty.call(fact!, periodKey)) {
        const fv = fact![periodKey];
        factMonth = fv != null && Number.isFinite(Number(fv)) ? Number(fv) : null;
      } else {
        factMonth = null;
      }
    }
    const label = periodKeyToRuChartLabel(periodKey);
    return { periodKey, label, planMonth, factMonth };
  });

  while (rows.length > 1) {
    const last = rows[rows.length - 1]!;
    const planNonZero = last.planMonth !== 0;
    const factNonZero = last.factMonth != null && last.factMonth !== 0;
    if (planNonZero || factNonZero) break;
    rows.pop();
  }

  if (rows.length > 0 && hasFactSeries) {
    let lastPk = rows[rows.length - 1]!.periodKey;
    while (lastPk < displayEnd) {
      lastPk = nextMonthPeriodKey(lastPk);
      rows.push({
        periodKey: lastPk,
        label: periodKeyToRuChartLabel(lastPk),
        planMonth: 0,
        factMonth: null,
      });
    }
  }

  return rows;
}

export type CashflowChartMode = "monthly" | "cumulative";

/**
 * Строка для Recharts: `plan` — оранжевая линия «План»; `fact` — синяя «Факт».
 * `fact` после границы отображения (сегодня или `factThroughPeriodKey` в прошлом) — `null`;
 * до границы пустые месяцы в CSV для кумулятива заполняются последним накопленным фактом, для помесячного — последним известным фактом месяца.
 */
export type CashflowChartRow = {
  periodKey: string;
  label: string;
  /** Оранжевая серия (план). */
  plan: number;
  /** Синяя серия (факт). */
  fact: number | null;
  deviation: number | null;
};

export type CashflowRowsForChartOptions = {
  /** Как в `buildCashflowSeries`: граница «факт не позже» (иначе берётся текущий месяц). */
  factThroughPeriodKey?: string | null;
};

/**
 * Помесячные точки для графика: `plan` / `fact` — только величины **за месяц**.
 * В режиме «Нарастающим итогом» кумулятив считается здесь **один раз** (сумма помесячных).
 */
export function cashflowRowsForChart(
  rows: CashflowSeriesRow[],
  mode: CashflowChartMode,
  planScale: number,
  options?: CashflowRowsForChartOptions,
): CashflowChartRow[] {
  const displayEnd = cashflowFactDisplayEndPeriodKey(options?.factThroughPeriodKey ?? null);
  const scale = Number.isFinite(planScale) && planScale > 0 ? planScale : 1;
  const scaled = rows.map((r) => ({
    ...r,
    planMonthScaled: Math.round(r.planMonth * scale),
  }));

  if (mode === "monthly") {
    let lastRawMonthly: number | null = null;
    return scaled.map((r) => {
      const planFull = r.planMonthScaled;
      const afterEnd = r.periodKey > displayEnd;
      const raw = afterEnd ? null : r.factMonth;
      if (raw != null) lastRawMonthly = raw;
      const factDisplayed =
        afterEnd ? null : raw != null ? raw : lastRawMonthly != null ? lastRawMonthly : null;
      const deviation = raw == null ? null : raw - planFull;
      return {
        periodKey: r.periodKey,
        label: r.label,
        plan: planFull,
        fact: factDisplayed,
        deviation,
      };
    });
  }

  let accPlan = 0;
  let accFact = 0;
  let hadCsvFact = false;
  return scaled.map((r) => {
    accPlan += r.planMonthScaled;
    const afterEnd = r.periodKey > displayEnd;
    const raw = afterEnd ? null : r.factMonth;
    if (raw != null) {
      accFact += raw;
      hadCsvFact = true;
    }
    const factDisplayed = afterEnd ? null : hadCsvFact ? accFact : null;
    return {
      periodKey: r.periodKey,
      label: r.label,
      plan: accPlan,
      fact: factDisplayed,
      deviation: factDisplayed == null ? null : factDisplayed - accPlan,
    };
  });
}
