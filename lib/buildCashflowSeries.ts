import type { SalesReportPayload } from "@/lib/marketingSalesReportData";

/**
 * Поступления (эскроу) vs план поступлений из ряда «План продаж».
 * Не использует сделки (deals) — только `series` + `cashFlowDiagnostic` отчёта.
 *
 * План поступлений по месяцам: Δ плана выручки × коэффициент (как в salesPlanWorkModel для эскроу).
 * Факт: прирост накопительного эскроу по месяцам.
 */
export const CASHFLOW_PLAN_FROM_REVENUE_RATIO = 0.88;

export type CashflowSeriesRow = {
  periodKey: string;
  label: string;
  /** План поступлений за месяц, ₽ */
  planMonth: number;
  /** Факт поступлений за месяц (прирост эскроу), ₽ */
  factMonth: number;
};

export function buildCashflowSeries(data: SalesReportPayload): CashflowSeriesRow[] {
  const cf = [...data.cashFlowDiagnostic.month].sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  const seriesByKey = new Map(data.series.month.map((p) => [p.periodKey, p] as const));

  const rows: CashflowSeriesRow[] = [];
  for (let i = 0; i < cf.length; i++) {
    const cur = cf[i]!;
    const sp = seriesByKey.get(cur.periodKey);
    if (!sp) continue;

    const prevEsc = i > 0 ? cf[i - 1]!.escrowCumulative : 0;
    const factMonth = cur.escrowCumulative - prevEsc;

    const prevPlanCum = i > 0 ? seriesByKey.get(cf[i - 1]!.periodKey)?.revenue.planCumulative ?? 0 : 0;
    const planMonth = Math.round((sp.revenue.planCumulative - prevPlanCum) * CASHFLOW_PLAN_FROM_REVENUE_RATIO);

    rows.push({
      periodKey: cur.periodKey,
      label: cur.label,
      planMonth,
      factMonth,
    });
  }
  return rows;
}

export type CashflowChartMode = "monthly" | "cumulative";

export type CashflowChartRow = {
  periodKey: string;
  label: string;
  plan: number;
  fact: number;
  deviation: number;
};

/**
 * @param planScale — масштаб плана (сценарий плана продаж: effective / base).
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
      deviation: r.factMonth - r.planMonthScaled,
    }));
  }

  let accPlan = 0;
  let accFact = 0;
  return scaled.map((r) => {
    accPlan += r.planMonthScaled;
    accFact += r.factMonth;
    return {
      periodKey: r.periodKey,
      label: r.label,
      plan: accPlan,
      fact: accFact,
      deviation: accFact - accPlan,
    };
  });
}
