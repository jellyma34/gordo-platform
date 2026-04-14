export type MonthlyPlanVelocityInput = {
  periodKey: string;
  label: string;
  plan: number;
  fact: number;
};

export type SalesVelocityLineRow = {
  periodKey: string;
  label: string;
  plannedRate: number;
  actualRate: number;
  rateDelta: number;
  rateDeltaPct: number;
};

export type MonthlyVelocityBarRow = {
  periodKey: string;
  label: string;
  fact: number;
  plan: number;
  deviation: number;
  /** Для explain: связка со строкой интерактива */
  pointId?: string;
};

export function buildVelocityLineRows(monthly: MonthlyPlanVelocityInput[]): SalesVelocityLineRow[] {
  const totalPlan = monthly.reduce((sum, r) => sum + r.plan, 0);
  const totalMonths = Math.max(1, monthly.length);
  const plannedRate = totalPlan / totalMonths;
  let factRun = 0;
  return monthly.map((r, idx) => {
    factRun += r.fact;
    const passed = idx + 1;
    const actualRate = factRun / passed;
    const rateDelta = actualRate - plannedRate;
    const rateDeltaPct = plannedRate > 0 ? (rateDelta / plannedRate) * 100 : 0;
    return {
      periodKey: r.periodKey,
      label: r.label,
      plannedRate,
      actualRate,
      rateDelta,
      rateDeltaPct,
    };
  });
}

export function buildVelocityMonthlyBars(monthly: MonthlyPlanVelocityInput[]): MonthlyVelocityBarRow[] {
  return monthly.map((r) => ({
    periodKey: r.periodKey,
    label: r.label,
    fact: r.fact,
    plan: r.plan,
    deviation: r.fact - r.plan,
    pointId: r.periodKey,
  }));
}

export function velocityFactPlanBarFillId(uid: string, entry: { fact: number; plan: number }): string {
  const { fact, plan } = entry;
  if (plan <= 0) {
    return fact >= 0 ? `url(#${uid}-barGreen)` : `url(#${uid}-barRed)`;
  }
  if (fact >= plan) return `url(#${uid}-barGreen)`;
  if (fact >= plan * 0.9) return `url(#${uid}-barYellow)`;
  return `url(#${uid}-barRed)`;
}

export function velocityFactPlanWorstIndex(rows: Pick<MonthlyVelocityBarRow, "deviation">[]): number {
  if (rows.length === 0) return -1;
  let worst = 0;
  let minDev = rows[0]!.deviation;
  rows.forEach((row, i) => {
    if (row.deviation < minDev) {
      minDev = row.deviation;
      worst = i;
    }
  });
  return worst;
}

export function barLastDeviationPct(rows: MonthlyVelocityBarRow[]): number {
  const last = rows[rows.length - 1];
  if (!last) return 0;
  if (last.plan <= 0) return 0;
  return Math.round(((last.fact - last.plan) / last.plan) * 100);
}

export function lineLastDeviationPct(rows: SalesVelocityLineRow[]): number {
  const last = rows[rows.length - 1];
  if (!last) return 0;
  if (last.plannedRate <= 0) return 0;
  return Math.round(((last.actualRate - last.plannedRate) / last.plannedRate) * 100);
}

/** Текущий календарный месяц в формате periodKey (как в marketingMockData). */
export function salesPlanPeriodKeyThisMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function velocityFooterFromMonthly(
  monthly: { plan: number; fact: number }[],
  periodKeys: string[],
  todayPeriodKey: string,
): { actualPerMonth: number; velocityCompletionPct: number } {
  const totalMonths = Math.max(1, monthly.length);
  let idx = periodKeys.indexOf(todayPeriodKey);
  if (idx < 0) idx = Math.max(0, periodKeys.length - 1);
  const monthsPassed = Math.max(1, Math.min(totalMonths, idx + 1));
  const totalPlan = monthly.reduce((s, r) => s + r.plan, 0);
  const planPerMonth = totalPlan / totalMonths;
  const currentFact = monthly.slice(0, monthsPassed).reduce((s, r) => s + r.fact, 0);
  const actualPerMonth = currentFact / monthsPassed;
  const velocityCompletionPct = planPerMonth > 0 ? Math.round((actualPerMonth / planPerMonth) * 100) : 0;
  return { actualPerMonth, velocityCompletionPct };
}
