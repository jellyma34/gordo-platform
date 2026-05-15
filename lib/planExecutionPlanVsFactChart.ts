import type { SalesPlanExecutionDataset } from "@/lib/marketingSalesPlanExecutionTable";

/**
 * Помесячные точки для графика «План vs факт» после merge:
 * план — только из CSV исполнения; факт — только из CSV поступлений (`factByPeriodKey`).
 */
export type PlanVsFactMonthlyRubPoint = {
  periodKey: string;
  planRub: number | null;
  factRub: number | null;
};

function finiteNonNegRub(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x) || x === Infinity || x === -Infinity) return 0;
  return Math.max(0, x);
}

function isPeriodKey(pk: string): boolean {
  return /^\d{4}-\d{2}$/.test(pk.trim());
}

/**
 * Селектор: помесячный план (₽) только из датасета CSV «Исполнение плана продаж».
 * Поле `factRub` в `monthlyPlanFact` игнорируется — факт берётся из другого источника.
 */
export function getExecutionPlanSeries(
  dataset: SalesPlanExecutionDataset,
): ReadonlyArray<{ periodKey: string; planRub: number }> {
  const raw = dataset.monthlyPlanFact ?? [];
  const byPk = new Map<string, number>();
  for (const p of raw) {
    const pk = String(p.periodKey ?? "").trim();
    if (!isPeriodKey(pk)) continue;
    const planRub = finiteNonNegRub(p.planRub);
    byPk.set(pk, (byPk.get(pk) ?? 0) + planRub);
  }
  return [...byPk.entries()]
    .map(([periodKey, planRub]) => ({ periodKey, planRub }))
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));
}

/**
 * Селектор: помесячный факт поступлений (₽) из JSON графика платежей (`factByPeriodKey`).
 */
export function getFactSalesSeries(
  factByPeriodKey: Record<string, number> | null | undefined,
): ReadonlyArray<{ periodKey: string; factRub: number }> {
  if (!factByPeriodKey || typeof factByPeriodKey !== "object") return [];
  const byPk = new Map<string, number>();
  for (const [k, v] of Object.entries(factByPeriodKey)) {
    const pk = k.trim();
    if (!isPeriodKey(pk)) continue;
    const factRub = finiteNonNegRub(v);
    byPk.set(pk, (byPk.get(pk) ?? 0) + factRub);
  }
  return [...byPk.entries()]
    .map(([periodKey, factRub]) => ({ periodKey, factRub }))
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));
}

/**
 * Объединение по `YYYY-MM` (сортировка хронологическая через `localeCompare`).
 * Месяц есть на шкале, если он встречается хотя бы в одном ряду.
 */
export function mergePlanVsFactMonthly(
  plan: ReadonlyArray<{ periodKey: string; planRub: number }>,
  fact: ReadonlyArray<{ periodKey: string; factRub: number }>,
): PlanVsFactMonthlyRubPoint[] {
  const planMap = new Map(plan.map((p) => [p.periodKey.trim(), p.planRub]));
  const factMap = new Map(fact.map((p) => [p.periodKey.trim(), p.factRub]));
  const keys = new Set<string>([...planMap.keys(), ...factMap.keys()]);
  return [...keys]
    .filter(isPeriodKey)
    .sort((a, b) => a.localeCompare(b))
    .map((periodKey) => ({
      periodKey,
      planRub: planMap.has(periodKey) ? finiteNonNegRub(planMap.get(periodKey)) : null,
      factRub: factMap.has(periodKey) ? finiteNonNegRub(factMap.get(periodKey)) : null,
    }));
}

/**
 * Диапазон месяцев по ряду плана из CSV исполнения (`YYYY-MM`), без опоры на текущую дату.
 */
export function getExecutionPlanMonthSpan(
  plan: ReadonlyArray<{ periodKey: string; planRub: number }>,
): { minPlanMonth: string; maxPlanMonth: string } | null {
  const keys = [...new Set(plan.map((p) => p.periodKey.trim()))].filter(isPeriodKey).sort((a, b) => a.localeCompare(b));
  if (keys.length === 0) return null;
  return { minPlanMonth: keys[0]!, maxPlanMonth: keys[keys.length - 1]! };
}

/** Обрезка merged-ряда по окну плана: факт вне диапазона плана для этого блока не показывается. */
export function clipPlanVsFactToPlanMonthWindow(
  rows: readonly PlanVsFactMonthlyRubPoint[],
  span: { minPlanMonth: string; maxPlanMonth: string },
): PlanVsFactMonthlyRubPoint[] {
  return rows.filter((r) => {
    const pk = r.periodKey.trim();
    return pk >= span.minPlanMonth && pk <= span.maxPlanMonth;
  });
}

/**
 * Merge план + факт, затем обрезка по [minPlanMonth, maxPlanMonth] из серии плана.
 * Если плана нет — возвращает полный merge (только факт и т.д.).
 */
export function mergePlanVsFactMonthlyForExecutionChart(
  plan: ReadonlyArray<{ periodKey: string; planRub: number }>,
  fact: ReadonlyArray<{ periodKey: string; factRub: number }>,
): PlanVsFactMonthlyRubPoint[] {
  const merged = mergePlanVsFactMonthly(plan, fact);
  const span = getExecutionPlanMonthSpan(plan);
  if (span == null) return merged;
  return clipPlanVsFactToPlanMonthWindow(merged, span);
}
