import type { UnitsExecutionMonthSlice, UnitsExecutionByMonth } from "@/lib/marketingUnitsExecutionCsv";
import type { UnitsExecutionSegmentRow, UnitsExecutionTotals } from "@/lib/parseSalesUnitsExecutionCsv";
import {
  cumulativePlanByMonth,
  executionMonths,
  isUnitsExecutionMonthKey,
  UNITS_EXECUTION_BASE_MONTH,
  type CumulativeExecutionSegmentCounts,
  type UnitsExecutionMonthKey,
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

function planCumulativeForSegment(monthKey: UnitsExecutionMonthKey, segKey: UnitsExecutionSegmentRow["key"]): number {
  return cumulativePlanByMonth[monthKey][segKey];
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
 * Накопительный факт по месяцам: только CSV / API / dataset.
 * Без привязки к росту плана. Если новых фактов нет — последнее известное значение.
 */
export function resolveCumulativeFactByMonth(
  baseSegments: readonly UnitsExecutionSegmentRow[],
  /** Срезы из загрузок/API с фактом по месяцу (ключ YYYY-MM). */
  explicitFactByMonth?: Partial<Record<string, UnitsExecutionMonthSlice>>,
): Record<UnitsExecutionMonthKey, CumulativeExecutionSegmentCounts> {
  const baseFeb = countsFromSegments(baseSegments);
  let lastKnown: CumulativeExecutionSegmentCounts = hasExplicitFactSnapshot(baseFeb)
    ? { ...baseFeb }
    : emptyCounts();

  const out = {} as Record<UnitsExecutionMonthKey, CumulativeExecutionSegmentCounts>;

  for (const mk of executionMonths) {
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

/**
 * Срез: план — {@link cumulativePlanByMonth}; факт — last known fact для месяца (не planDelta).
 */
export function buildUnitsExecutionSliceForMonth(
  baseSegments: readonly UnitsExecutionSegmentRow[],
  monthKey: string,
  factByMonth: Record<UnitsExecutionMonthKey, CumulativeExecutionSegmentCounts>,
): UnitsExecutionMonthSlice | null {
  if (!isUnitsExecutionMonthKey(monthKey) || baseSegments.length === 0) return null;

  const segments: UnitsExecutionSegmentRow[] = baseSegments.map((base) => {
    const planCumulative = planCumulativeForSegment(monthKey, base.key);
    const factCumulative = factByMonth[monthKey][base.key];
    const deviationCumulative = factCumulative - planCumulative;
    const completionPct = planCumulative > 0 ? (factCumulative / planCumulative) * 100 : 0;

    return {
      ...base,
      planCumulative,
      factCumulative,
      deviationCumulative,
      completionPct: Number.isFinite(completionPct) ? completionPct : 0,
    };
  });

  return {
    segments,
    totals: buildTotalsFromSegments(segments),
  };
}

/** Все месяцы фильтра: plan series + fact series (carry-forward). */
export function buildUnitsExecutionByMonthFromBase(
  baseSegments: readonly UnitsExecutionSegmentRow[],
  explicitFactByMonth?: Partial<Record<string, UnitsExecutionMonthSlice>>,
): UnitsExecutionByMonth {
  const factByMonth = resolveCumulativeFactByMonth(baseSegments, explicitFactByMonth);
  const out: UnitsExecutionByMonth = {};
  for (const mk of executionMonths) {
    const slice = buildUnitsExecutionSliceForMonth(baseSegments, mk, factByMonth);
    if (slice) out[mk] = slice;
  }
  return out;
}
