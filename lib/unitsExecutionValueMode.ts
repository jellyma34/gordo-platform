import type { UnitsExecutionMonthSlice } from "@/lib/marketingUnitsExecutionCsv";
import type { UnitsExecutionSegmentRow } from "@/lib/parseSalesUnitsExecutionCsv";
import { factCountsToSegmentRows } from "@/lib/buildUnitsExecutionFactFromDeals";
import {
  isUnitsExecutionAccumulationMonth,
  type CumulativeExecutionSegmentCounts,
} from "@/lib/unitsExecutionMonths";

export type UnitsExecutionValueMode = "monthly" | "cumulative";

const SEGMENT_KEYS = ["apartments", "parking", "storage", "commercial"] as const;

function emptyCounts(): CumulativeExecutionSegmentCounts {
  return { apartments: 0, parking: 0, storage: 0, commercial: 0 };
}

/** Предыдущий календарный месяц `YYYY-MM` или `null` (январь → декабрь прошлого года). */
export function previousUnitsExecutionMonthKey(monthKey: string): string | null {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Помесячные значения: текущий накопительный минус предыдущий; без предыдущего — как накопительный. */
export function deriveMonthlyCountsFromCumulative(
  current: CumulativeExecutionSegmentCounts,
  previous: CumulativeExecutionSegmentCounts | null,
): CumulativeExecutionSegmentCounts {
  if (!previous) return { ...current };
  const out = emptyCounts();
  for (const k of SEGMENT_KEYS) {
    const cur = Number.isFinite(current[k]) ? current[k] : 0;
    const prev = Number.isFinite(previous[k]) ? previous[k] : 0;
    out[k] = Math.max(0, cur - prev);
  }
  return out;
}

function buildTotalsFromSegments(segments: readonly UnitsExecutionSegmentRow[]) {
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

/** Пересчёт среза: в режиме «Месяц» plan/fact/KPI — за отчётный месяц, не накопительно. */
export function applyUnitsExecutionValueMode(
  slice: UnitsExecutionMonthSlice,
  monthKey: string,
  mode: UnitsExecutionValueMode,
  planCumulativeForMonth: (mk: string) => CumulativeExecutionSegmentCounts,
  factCumulativeForMonth: (mk: string) => CumulativeExecutionSegmentCounts,
): UnitsExecutionMonthSlice {
  if (mode === "cumulative") return slice;

  const prevKeyRaw = previousUnitsExecutionMonthKey(monthKey);
  const prevKey =
    prevKeyRaw && isUnitsExecutionAccumulationMonth(prevKeyRaw) ? prevKeyRaw : null;
  const curPlan = planCumulativeForMonth(monthKey);
  const curFact = factCumulativeForMonth(monthKey);
  const prevPlan = prevKey ? planCumulativeForMonth(prevKey) : null;
  const prevFact = prevKey ? factCumulativeForMonth(prevKey) : null;

  const monthlyPlan = deriveMonthlyCountsFromCumulative(curPlan, prevPlan);
  const monthlyFact = deriveMonthlyCountsFromCumulative(curFact, prevFact);

  const segments = factCountsToSegmentRows(slice.segments, monthlyPlan, monthlyFact);
  return {
    segments,
    totals: buildTotalsFromSegments(segments),
  };
}
