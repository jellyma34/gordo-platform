import type { NormalizedDealRow } from "@/components/marketing/DealsSection";
import {
  DEALS_ANALYTICS_SEGMENT_KEYS,
  type DealsAnalyticsSegmentKey,
} from "@/lib/buildDealsSegmentMonthAnalytics";
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
import type { UnitsExecutionSegmentRow } from "@/lib/parseSalesUnitsExecutionCsv";
import {
  isUnitsExecutionAccumulationMonth,
  UNITS_EXECUTION_START_ACCUMULATION_MONTH,
  type CumulativeExecutionSegmentCounts,
} from "@/lib/unitsExecutionMonths";

const UNITS_SEGMENT_KEYS = ["apartments", "parking", "storage", "commercial"] as const;
type UnitsSegmentKey = (typeof UNITS_SEGMENT_KEYS)[number];

const DEAL_TO_UNITS: Record<DealsAnalyticsSegmentKey, UnitsSegmentKey> = {
  apartment: "apartments",
  parking: "parking",
  storage: "storage",
  commercial: "commercial",
};

function emptyCounts(): CumulativeExecutionSegmentCounts {
  return { apartments: 0, parking: 0, storage: 0, commercial: 0 };
}

function isAnalyticsDealType(d: NormalizedDealRow["dealType"]): d is DealsAnalyticsSegmentKey {
  return (DEALS_ANALYTICS_SEGMENT_KEYS as readonly string[]).includes(d);
}

/** Сделки с месяцем ≥ {@link UNITS_EXECUTION_START_ACCUMULATION_MONTH} (окт–дек 2025 и ранее не входят в накопление). */
export function filterDealsForUnitsExecutionAccumulation(
  rows: readonly NormalizedDealRow[],
): NormalizedDealRow[] {
  return rows.filter((r) => {
    const mk = normalizeMonthKey(r.monthKey) ?? r.monthKey;
    return isUnitsExecutionAccumulationMonth(mk);
  });
}

/** Помесячный факт (шт.) по сегментам из JSON/API сделок (только с января 2026). */
export function aggregateUnitsFactMonthlyFromDeals(
  rows: readonly NormalizedDealRow[],
): Record<string, CumulativeExecutionSegmentCounts> {
  const out: Record<string, CumulativeExecutionSegmentCounts> = {};
  for (const r of filterDealsForUnitsExecutionAccumulation(rows)) {
    if (!isAnalyticsDealType(r.dealType)) continue;
    const mk = normalizeMonthKey(r.monthKey) ?? r.monthKey;
    if (!isUnitsExecutionAccumulationMonth(mk)) continue;
    if (!out[mk]) out[mk] = emptyCounts();
    const seg = DEAL_TO_UNITS[r.dealType];
    out[mk][seg] += 1;
  }
  return out;
}

/** Накопительный факт: сумма всех месяцев с `YYYY-MM` ≤ `throughMonthKey`. */
export function cumulativeUnitsFactThroughMonth(
  monthly: Record<string, CumulativeExecutionSegmentCounts>,
  throughMonthKey: string,
): CumulativeExecutionSegmentCounts {
  const acc = emptyCounts();
  for (const mk of Object.keys(monthly).sort()) {
    if (mk < UNITS_EXECUTION_START_ACCUMULATION_MONTH) continue;
    if (mk > throughMonthKey) break;
    const m = monthly[mk];
    if (!m) continue;
    for (const k of UNITS_SEGMENT_KEYS) {
      const v = m[k];
      acc[k] += Number.isFinite(v) ? v : 0;
    }
  }
  return acc;
}

export function unitsFactMonthlyHasAnyDeals(monthly: Record<string, CumulativeExecutionSegmentCounts>): boolean {
  return Object.values(monthly).some((m) => UNITS_SEGMENT_KEYS.some((k) => (m[k] ?? 0) > 0));
}

export function factCountsToSegmentRows(
  baseSegments: readonly UnitsExecutionSegmentRow[],
  planCounts: CumulativeExecutionSegmentCounts,
  factCounts: CumulativeExecutionSegmentCounts,
): UnitsExecutionSegmentRow[] {
  return baseSegments.map((base) => {
    const planCumulative = Number.isFinite(planCounts[base.key]) ? planCounts[base.key] : 0;
    const factCumulative = Number.isFinite(factCounts[base.key]) ? factCounts[base.key] : 0;
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
}
