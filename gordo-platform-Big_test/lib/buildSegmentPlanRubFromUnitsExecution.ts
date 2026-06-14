import type { SegmentChartPeriodMode } from "@/lib/filterDealsForSegmentChartPeriod";
import {
  resolveUnitsExecutionMonthSlice,
  type UnitsExecutionChartsPayload,
} from "@/lib/marketingUnitsExecutionCsv";
import { normalizeMonthKey } from "@/lib/normalizeMonthKey";
import type { SegmentExecutionSegmentKey } from "@/lib/parseSegmentExecutionCsv";
import type { UnitsExecutionSegmentRow } from "@/lib/parseSalesUnitsExecutionCsv";
import {
  getCumulativePlanForMonth,
  getMonthlyPlanForMonth,
  resolveUnitsExecutionMonthKeys,
  type CumulativeExecutionSegmentCounts,
} from "@/lib/unitsExecutionMonths";

/** Фиксированная средняя стоимость сегмента для перевода плана (шт.) → план (₽). */
export const SEGMENT_PLAN_AVG_PRICE_RUB: Record<SegmentExecutionSegmentKey, number> = {
  apartments: 10_000_000,
  parking: 3_000_000,
  storage: 1_000_000,
  commercial: 0,
};

export type SegmentPlanRubFromUnitsOpts = {
  periodMode: SegmentChartPeriodMode;
  monthKey?: string | null;
  quarterId?: string | null;
  fallbackAsOfYmd?: string | null;
};

function parseQuarterId(id: string): { year: number; quarter: number } | null {
  const m = /^(\d{4})-([0-3])$/.exec(id);
  if (!m) return null;
  const year = Number(m[1]);
  const quarter = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(quarter)) return null;
  return { year, quarter };
}

function monthKeysInQuarter(year: number, quarter: number): string[] {
  const startMonth = quarter * 3 + 1;
  return [0, 1, 2].map((i) => `${year}-${String(startMonth + i).padStart(2, "0")}`);
}

function sortedMonthKeys(monthKeys: readonly string[]): string[] {
  return [...monthKeys].filter((k) => /^\d{4}-\d{2}$/.test(k)).sort((a, b) => a.localeCompare(b));
}

const PLAN_SEGMENT_KEYS: (keyof CumulativeExecutionSegmentCounts)[] = [
  "apartments",
  "parking",
  "storage",
  "commercial",
];

function emptyPlanCounts(): CumulativeExecutionSegmentCounts {
  return { apartments: 0, parking: 0, storage: 0, commercial: 0 };
}

function planCountsHaveUnits(counts: CumulativeExecutionSegmentCounts): boolean {
  return PLAN_SEGMENT_KEYS.some((k) => Number.isFinite(counts[k]) && counts[k] > 0);
}

/** Итоговая накопительная колонка «План накопительно» из загруженного CSV (снимок segments). */
function planCountsFromCsvSegments(
  segments: readonly UnitsExecutionSegmentRow[],
): CumulativeExecutionSegmentCounts {
  const out = emptyPlanCounts();
  for (const s of segments) {
    const v = Number.isFinite(s.planCumulative) ? s.planCumulative : 0;
    out[s.key] = v;
  }
  return out;
}

/**
 * Сумма помесячных планов (шт.) по горизонту: для каждого месяца — приращение
 * накопительного плана (не срез последнего месяца).
 */
function sumMonthlyPlanUnitsAcrossTimeline(dealsMonthKeys: readonly string[]): CumulativeExecutionSegmentCounts {
  const monthKeys = sortedMonthKeys(resolveUnitsExecutionMonthKeys(dealsMonthKeys));
  const acc = emptyPlanCounts();
  let prev = emptyPlanCounts();
  for (const mk of monthKeys) {
    const cum = getCumulativePlanForMonth(mk);
    for (const k of PLAN_SEGMENT_KEYS) {
      const delta = Math.max(0, (Number.isFinite(cum[k]) ? cum[k] : 0) - (prev[k] ?? 0));
      acc[k] += delta;
    }
    prev = cum;
  }
  if (planCountsHaveUnits(acc)) return acc;

  const monthlyAcc = emptyPlanCounts();
  for (const mk of monthKeys) {
    const m = getMonthlyPlanForMonth(mk);
    for (const k of PLAN_SEGMENT_KEYS) {
      monthlyAcc[k] += Number.isFinite(m[k]) ? m[k] : 0;
    }
  }
  return monthlyAcc;
}

/**
 * План в штуках для периода «Все»:
 * 1) накопительная колонка из CSV (итог на дату отчёта);
 * 2) иначе сумма помесячных планов по горизонту (Excel / monthlyPlanByMonth).
 */
export function resolveAllPeriodPlanUnits(
  payload: UnitsExecutionChartsPayload,
  dealsMonthKeys: readonly string[] = [],
): CumulativeExecutionSegmentCounts {
  const fromCsv = planCountsFromCsvSegments(payload.segments);
  if (planCountsHaveUnits(fromCsv)) {
    return fromCsv;
  }
  return sumMonthlyPlanUnitsAcrossTimeline(dealsMonthKeys);
}

/** Отчётный месяц для плана в штуках (накопительно на конец периода). */
export function resolveSegmentPlanUnitsMonthKey(
  dealsMonthKeys: readonly string[],
  opts: SegmentPlanRubFromUnitsOpts,
): string | null {
  const keys = sortedMonthKeys(resolveUnitsExecutionMonthKeys(dealsMonthKeys));
  if (keys.length === 0) {
    if (opts.fallbackAsOfYmd && /^\d{4}-\d{2}/.test(opts.fallbackAsOfYmd)) {
      return normalizeMonthKey(opts.fallbackAsOfYmd) ?? opts.fallbackAsOfYmd.slice(0, 7);
    }
    return null;
  }

  if (opts.periodMode === "all") {
    return keys[keys.length - 1]!;
  }

  if (opts.periodMode === "month") {
    const canon = opts.monthKey ? normalizeMonthKey(opts.monthKey) ?? opts.monthKey : null;
    if (canon && /^\d{4}-\d{2}$/.test(canon)) {
      if (keys.includes(canon)) return canon;
      const upTo = keys.filter((k) => k <= canon);
      if (upTo.length > 0) return upTo[upTo.length - 1]!;
    }
    return keys[keys.length - 1]!;
  }

  const q = opts.quarterId ? parseQuarterId(opts.quarterId) : null;
  if (q) {
    const qKeys = monthKeysInQuarter(q.year, q.quarter);
    const inQ = qKeys.filter((k) => keys.includes(k));
    if (inQ.length > 0) return inQ[inQ.length - 1]!;
    const lastQMonth = qKeys[qKeys.length - 1]!;
    const upTo = keys.filter((k) => k <= lastQMonth);
    if (upTo.length > 0) return upTo[upTo.length - 1]!;
  }

  return keys[keys.length - 1]!;
}

/**
 * План (₽) по сегментам: накопительный план в штуках (блок «Исполнение плана продаж (штуки)»)
 * × фиксированная средняя стоимость сегмента.
 */
export function buildSegmentPlanRubByExecKeyFromUnits(
  payload: UnitsExecutionChartsPayload | null | undefined,
  opts: SegmentPlanRubFromUnitsOpts,
  /** Ключи месяцев из сделок — только для выбора отчётного месяца, не для сумм. */
  dealsMonthKeys?: readonly string[],
): Map<SegmentExecutionSegmentKey, number> | null {
  if (!payload?.segments?.length) return null;

  /** «Все»: итоговый накопительный план из CSV или сумма помесячных планов × средняя цена. */
  if (opts.periodMode === "all") {
    const totals = resolveAllPeriodPlanUnits(payload, dealsMonthKeys ?? []);
    const out = new Map<SegmentExecutionSegmentKey, number>();
    for (const key of Object.keys(SEGMENT_PLAN_AVG_PRICE_RUB) as SegmentExecutionSegmentKey[]) {
      const units = Number.isFinite(totals[key]) ? totals[key] : 0;
      out.set(key, units * (SEGMENT_PLAN_AVG_PRICE_RUB[key] ?? 0));
    }
    return out;
  }

  const monthKey = resolveSegmentPlanUnitsMonthKey(dealsMonthKeys ?? [], opts);
  if (!monthKey) return null;

  /** Месяц / квартал: накопительный план в штуках на конец периода × средняя цена. */
  const slice = resolveUnitsExecutionMonthSlice(payload, monthKey, undefined, "cumulative");
  if (!slice?.segments?.length) return null;

  const out = new Map<SegmentExecutionSegmentKey, number>();
  for (const s of slice.segments) {
    const units = Number.isFinite(s.planCumulative) ? s.planCumulative : 0;
    const avg = SEGMENT_PLAN_AVG_PRICE_RUB[s.key] ?? 0;
    out.set(s.key, units * avg);
  }
  return out;
}
