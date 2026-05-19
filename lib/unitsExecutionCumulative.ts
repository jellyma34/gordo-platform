import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import {
  aggregateUnitsFactMonthlyFromDeals,
  cumulativeUnitsFactThroughMonth,
  factCountsToSegmentRows,
  unitsFactMonthlyHasAnyDeals,
} from "@/lib/buildUnitsExecutionFactFromDeals";
import type { UnitsExecutionMonthSlice, UnitsExecutionByMonth } from "@/lib/marketingUnitsExecutionCsv";
import type { UnitsExecutionSegmentRow, UnitsExecutionTotals } from "@/lib/parseSalesUnitsExecutionCsv";
import {
  getCumulativePlanForMonth,
  resolveUnitsExecutionMonthKeys,
  UNITS_EXECUTION_BASE_MONTH,
  type CumulativeExecutionSegmentCounts,
} from "@/lib/unitsExecutionMonths";

function emptyCounts(): CumulativeExecutionSegmentCounts {
  return { apartments: 0, parking: 0, storage: 0, commercial: 0 };
}

function countsFromSegments(segments: readonly UnitsExecutionSegmentRow[]): CumulativeExecutionSegmentCounts {
  const out = emptyCounts();
  for (const s of segments) {
    out[s.key] = Number.isFinite(s.factCumulative) ? s.factCumulative : 0;
  }
  return out;
}

function buildTotalsFromSegments(segments: readonly UnitsExecutionSegmentRow[]): UnitsExecutionTotals {
  let planCumulative = 0;
  let factCumulative = 0;
  for (const s of segments) {
    planCumulative += Number.isFinite(s.planCumulative) ? s.planCumulative : 0;
    factCumulative += Number.isFinite(s.factCumulative) ? s.factCumulative : 0;
  }
  const deviationCumulative = factCumulative - planCumulative;
  const completionPct = planCumulative > 0 ? (factCumulative / planCumulative) * 100 : 0;
  return {
    planCumulative,
    factCumulative,
    deviationCumulative,
    completionPct: Number.isFinite(completionPct) ? completionPct : 0,
  };
}

function hasExplicitFactSnapshot(counts: CumulativeExecutionSegmentCounts): boolean {
  return Object.values(counts).some((v) => Number.isFinite(v) && v > 0);
}

function countsDiffer(a: CumulativeExecutionSegmentCounts, b: CumulativeExecutionSegmentCounts): boolean {
  return (
    a.apartments !== b.apartments ||
    a.parking !== b.parking ||
    a.storage !== b.storage ||
    a.commercial !== b.commercial
  );
}

/**
 * Накопительный факт из CSV (carry-forward), если нет сделок в JSON/API.
 */
export function resolveCumulativeFactByMonth(
  baseSegments: readonly UnitsExecutionSegmentRow[],
  explicitFactByMonth?: Partial<Record<string, UnitsExecutionMonthSlice>>,
  monthKeys?: readonly string[],
): Record<string, CumulativeExecutionSegmentCounts> {
  const keys = monthKeys ?? resolveUnitsExecutionMonthKeys();
  const baseFeb = countsFromSegments(baseSegments);
  let lastKnown: CumulativeExecutionSegmentCounts = hasExplicitFactSnapshot(baseFeb)
    ? { ...baseFeb }
    : emptyCounts();

  const out: Record<string, CumulativeExecutionSegmentCounts> = {};

  for (const mk of keys) {
    const explicit = explicitFactByMonth?.[mk];
    if (explicit?.segments?.length) {
      const fromExplicit = countsFromSegments(explicit.segments);
      if (hasExplicitFactSnapshot(fromExplicit) && countsDiffer(fromExplicit, lastKnown)) {
        lastKnown = fromExplicit;
      }
    }

    if (mk === UNITS_EXECUTION_BASE_MONTH && hasExplicitFactSnapshot(baseFeb)) {
      lastKnown = { ...baseFeb };
    }

    out[mk] = { ...lastKnown };
  }

  return out;
}

export function resolveCumulativeFactForMonth(
  monthKey: string,
  baseSegments: readonly UnitsExecutionSegmentRow[],
  dealsRows?: readonly NormalizedDealRow[],
  explicitFactByMonth?: Partial<Record<string, UnitsExecutionMonthSlice>>,
): CumulativeExecutionSegmentCounts {
  const monthlyFromDeals = aggregateUnitsFactMonthlyFromDeals(dealsRows ?? []);
  if (unitsFactMonthlyHasAnyDeals(monthlyFromDeals)) {
    return cumulativeUnitsFactThroughMonth(monthlyFromDeals, monthKey);
  }
  const keys = resolveUnitsExecutionMonthKeys(
    Object.keys(monthlyFromDeals),
  );
  const byMonth = resolveCumulativeFactByMonth(baseSegments, explicitFactByMonth, keys);
  return byMonth[monthKey] ?? emptyCounts();
}

/**
 * Срез: план — снимок на конец месяца; факт — накопление сделок с января или CSV carry-forward.
 */
export function buildUnitsExecutionSliceForMonth(
  baseSegments: readonly UnitsExecutionSegmentRow[],
  monthKey: string,
  options?: {
    dealsRows?: readonly NormalizedDealRow[];
    explicitFactByMonth?: Partial<Record<string, UnitsExecutionMonthSlice>>;
    factByMonth?: Record<string, CumulativeExecutionSegmentCounts>;
  },
): UnitsExecutionMonthSlice | null {
  if (!/^\d{4}-\d{2}$/.test(monthKey) || baseSegments.length === 0) return null;

  const planCounts = getCumulativePlanForMonth(monthKey);
  const factCounts =
    options?.factByMonth?.[monthKey] ??
    resolveCumulativeFactForMonth(monthKey, baseSegments, options?.dealsRows, options?.explicitFactByMonth);

  const segments = factCountsToSegmentRows(baseSegments, planCounts, factCounts);

  return {
    segments,
    totals: buildTotalsFromSegments(segments),
  };
}

/** Все месяцы фильтра: plan + fact (сделки или CSV). */
export function buildUnitsExecutionByMonthFromBase(
  baseSegments: readonly UnitsExecutionSegmentRow[],
  options?: {
    dealsRows?: readonly NormalizedDealRow[];
    explicitFactByMonth?: Partial<Record<string, UnitsExecutionMonthSlice>>;
  },
): UnitsExecutionByMonth {
  const monthlyFromDeals = aggregateUnitsFactMonthlyFromDeals(options?.dealsRows ?? []);
  const monthKeys = resolveUnitsExecutionMonthKeys(Object.keys(monthlyFromDeals));
  const factByMonth = unitsFactMonthlyHasAnyDeals(monthlyFromDeals)
    ? Object.fromEntries(
        monthKeys.map((mk) => [mk, cumulativeUnitsFactThroughMonth(monthlyFromDeals, mk)]),
      )
    : resolveCumulativeFactByMonth(baseSegments, options?.explicitFactByMonth, monthKeys);

  const out: UnitsExecutionByMonth = {};
  for (const mk of monthKeys) {
    const slice = buildUnitsExecutionSliceForMonth(baseSegments, mk, {
      dealsRows: options?.dealsRows,
      explicitFactByMonth: options?.explicitFactByMonth,
      factByMonth,
    });
    if (slice) out[mk] = slice;
  }
  return out;
}
