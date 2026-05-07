import type { SalesReportPayload } from "@/lib/marketingSalesReportData";

/**
 * Поступления (эскроу) из CRM (`cashFlowDiagnostic`) + план из CSV графика платежей.
 * Месячный факт — прирост накопительного эскроу по полному ряду CRM (включая месяцы до старта продаж),
 * но на график попадают только периоды ≥ `salesStartPeriodKey`.
 */
export type CashflowSeriesRow = {
  periodKey: string;
  label: string;
  /** План поступлений за месяц, ₽ (из CSV графика платежей). */
  planMonth: number;
  /** Факт поступлений за месяц (прирост эскроу по CRM), ₽. После отчётного месяца — `null` (нет данных). */
  factMonth: number | null;
};

const RU_MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"] as const;

export function periodKeyToRuChartLabel(periodKey: string): string {
  const y = periodKey.slice(0, 4);
  const m = periodKey.slice(5, 7);
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m)) return periodKey;
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return periodKey;
  const yy = y.slice(2);
  return `${RU_MONTH_SHORT[mi]}. ${yy}`;
}

function crmFactMonthByKey(monthSeries: SalesReportPayload["cashFlowDiagnostic"]["month"]): Map<string, number> {
  const sorted = [...monthSeries].sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  const out = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    const prev = i > 0 ? sorted[i - 1]!.escrowCumulative : 0;
    const cur = sorted[i]!;
    out.set(cur.periodKey, cur.escrowCumulative - prev);
  }
  return out;
}

export type BuildCashflowSeriesOptions = {
  /**
   * Первый отображаемый месяц (YYYY-MM): «официальный» старт продаж по проекту.
   * Раньше — точки CRM не выводятся; помесячный факт для первого показанного месяца всё равно считается
   * от предыдущего месяца в полном массиве CRM (накопительный эскроу).
   */
  salesStartPeriodKey?: string | null;
  /**
   * Последний месяц, для которого на графике cashflow показывается факт (YYYY-MM, включительно).
   * Для более поздних месяцев `factMonth` = `null` (без интерполяции и без «заморозки» кумулятива).
   */
  factThroughPeriodKey?: string | null;
};

export function buildCashflowSeries(
  data: SalesReportPayload,
  planByPeriodKey?: Readonly<Record<string, number>> | null,
  options?: BuildCashflowSeriesOptions,
): CashflowSeriesRow[] {
  const salesStartRaw = options?.salesStartPeriodKey?.trim();
  const salesStart =
    salesStartRaw && /^\d{4}-\d{2}$/.test(salesStartRaw) ? salesStartRaw : null;
  const factThroughRaw = options?.factThroughPeriodKey?.trim();
  const factThrough =
    factThroughRaw && /^\d{4}-\d{2}$/.test(factThroughRaw) ? factThroughRaw : null;

  const cf = [...data.cashFlowDiagnostic.month].sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  const factByKey = crmFactMonthByKey(cf);
  const labelByKey = new Map(cf.map((p) => [p.periodKey, p.label] as const));

  const keys = new Set<string>();
  for (const p of cf) {
    if (salesStart && p.periodKey < salesStart) continue;
    keys.add(p.periodKey);
  }
  if (planByPeriodKey) {
    for (const k of Object.keys(planByPeriodKey)) {
      if (salesStart && k < salesStart) continue;
      keys.add(k);
    }
  }

  const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b));

  const rows = sortedKeys.map((periodKey) => {
    const planMonth =
      planByPeriodKey && planByPeriodKey[periodKey] != null ? Math.round(planByPeriodKey[periodKey]!) : 0;
    const rawFact = factByKey.get(periodKey) ?? 0;
    const factMonth =
      factThrough && periodKey > factThrough ? null : rawFact;
    const label = labelByKey.get(periodKey) ?? periodKeyToRuChartLabel(periodKey);
    return { periodKey, label, planMonth, factMonth };
  });

  while (rows.length > 1) {
    const last = rows[rows.length - 1]!;
    const factNonZero = last.factMonth != null && last.factMonth !== 0;
    if (last.planMonth !== 0 || factNonZero) break;
    rows.pop();
  }

  return rows;
}

export type CashflowChartMode = "monthly" | "cumulative";

export type CashflowChartRow = {
  periodKey: string;
  label: string;
  plan: number;
  fact: number | null;
  deviation: number | null;
};

/**
 * Помесячные точки для графика: `plan` / `fact` — только величины **за месяц**.
 * В режиме «Нарастающим итогом» кумулятив считается здесь **один раз** (сумма помесячных).
 */
export function cashflowRowsForChart(
  rows: CashflowSeriesRow[],
  mode: CashflowChartMode,
  planScale: number,
): CashflowChartRow[] {
  const scale = Number.isFinite(planScale) && planScale > 0 ? planScale : 1;
  const scaled = rows.map((r) => ({
    ...r,
    planMonthScaled: Math.round(r.planMonth * scale),
  }));

  if (mode === "monthly") {
    return scaled.map((r) => ({
      periodKey: r.periodKey,
      label: r.label,
      plan: r.planMonthScaled,
      fact: r.factMonth,
      deviation: r.factMonth == null ? null : r.factMonth - r.planMonthScaled,
    }));
  }

  let accPlan = 0;
  let accFact = 0;
  return scaled.map((r) => {
    accPlan += r.planMonthScaled;
    if (r.factMonth != null) accFact += r.factMonth;
    return {
      periodKey: r.periodKey,
      label: r.label,
      plan: accPlan,
      fact: r.factMonth == null ? null : accFact,
      deviation: r.factMonth == null ? null : accFact - accPlan,
    };
  });
}
