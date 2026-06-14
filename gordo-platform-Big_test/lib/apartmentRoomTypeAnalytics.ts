import { apartmentKpiExecutionPercent } from "@/lib/apartmentsPlanPeriodKpi";
import type {
  ApartmentPlanTypeKpiBreakdown,
  ApartmentPlanTypeKpiSlice,
  ApartmentPlanTypeKey,
} from "@/lib/apartmentPlanTypeKpi";

export type RoomTypeAnalyticsSoldLine = {
  key: ApartmentPlanTypeKey;
  label: string;
  factCumulative: number;
};

export type RoomTypeAnalyticsMissingLine = {
  key: ApartmentPlanTypeKey;
  label: string;
  missing: number;
  deviation: number;
};

export type RoomTypeAnalyticsOverLine = {
  key: ApartmentPlanTypeKey;
  label: string;
  factCumulative: number;
  planCumulative: number;
  surplus: number;
  completionPercent: number | null;
};

export type RoomTypeAnalytics = {
  hasCsvPlan: boolean;
  sold: RoomTypeAnalyticsSoldLine[];
  missing: RoomTypeAnalyticsMissingLine[];
  overperforming: RoomTypeAnalyticsOverLine[];
  completionPercent: Record<ApartmentPlanTypeKey, number | null>;
};

export type RoomTypeChartStatus = "deficit" | "success" | "neutral";

export type RoomTypeChartRow = {
  key: ApartmentPlanTypeKey;
  label: string;
  shortLabel: string;
  plan: number;
  fact: number;
  delta: number;
  status: RoomTypeChartStatus;
};

const SHORT_LABEL: Record<ApartmentPlanTypeKey, string> = {
  "apt-1": "1-ком.",
  "apt-2": "2-ком.",
  "apt-3": "3-ком.",
  "apt-4": "4-ком.+",
};

function lineFromSlice(slice: ApartmentPlanTypeKpiSlice, hasCsvPlan: boolean): {
  sold: RoomTypeAnalyticsSoldLine;
  missing: RoomTypeAnalyticsMissingLine | null;
  over: RoomTypeAnalyticsOverLine | null;
  completionPercent: number | null;
  chart: RoomTypeChartRow;
} {
  const planCumulative = hasCsvPlan ? slice.planCumulative : 0;
  const factCumulative = slice.factCumulative;
  const missingUnits = Math.max(0, planCumulative - factCumulative);
  const deviation = factCumulative - planCumulative;
  const completionPercent = apartmentKpiExecutionPercent(
    factCumulative,
    planCumulative > 0 ? planCumulative : null,
  );

  let status: RoomTypeChartStatus = "neutral";
  if (hasCsvPlan && planCumulative > 0) {
    status = factCumulative < planCumulative ? "deficit" : "success";
  }

  const sold: RoomTypeAnalyticsSoldLine = {
    key: slice.key,
    label: slice.label,
    factCumulative,
  };

  const missing: RoomTypeAnalyticsMissingLine | null =
    missingUnits > 0 ? { key: slice.key, label: slice.label, missing: missingUnits, deviation } : null;

  const over: RoomTypeAnalyticsOverLine | null =
    hasCsvPlan &&
    planCumulative > 0 &&
    (factCumulative >= planCumulative || (completionPercent != null && completionPercent >= 100))
      ? {
          key: slice.key,
          label: slice.label,
          factCumulative,
          planCumulative,
          surplus: Math.max(0, deviation),
          completionPercent,
        }
      : null;

  const chart: RoomTypeChartRow = {
    key: slice.key,
    label: slice.label,
    shortLabel: SHORT_LABEL[slice.key],
    plan: planCumulative,
    fact: factCumulative,
    delta: deviation,
    status,
  };

  return { sold, missing, over, completionPercent, chart };
}

/** BI-инсайты по комнатности: накопительный план (CSV) и факт (JSON). */
export function roomTypeAnalytics(
  breakdown: ApartmentPlanTypeKpiBreakdown | null | undefined,
): RoomTypeAnalytics | null {
  if (!breakdown?.items?.length) return null;

  const sold: RoomTypeAnalyticsSoldLine[] = [];
  const missing: RoomTypeAnalyticsMissingLine[] = [];
  const overperforming: RoomTypeAnalyticsOverLine[] = [];
  const completionPercent = {} as Record<ApartmentPlanTypeKey, number | null>;

  for (const slice of breakdown.items) {
    const row = lineFromSlice(slice, breakdown.hasCsvPlan);
    sold.push(row.sold);
    completionPercent[slice.key] = row.completionPercent;
    if (breakdown.hasCsvPlan && row.missing) missing.push(row.missing);
    if (breakdown.hasCsvPlan && row.over) overperforming.push(row.over);
  }

  return { hasCsvPlan: breakdown.hasCsvPlan, sold, missing, overperforming, completionPercent };
}

/** Данные для grouped horizontal bar chart (plan vs fact cumulative). */
export function buildRoomTypeChartRows(
  breakdown: ApartmentPlanTypeKpiBreakdown | null | undefined,
): RoomTypeChartRow[] {
  if (!breakdown?.items?.length) return [];
  return breakdown.items.map((slice) => lineFromSlice(slice, breakdown.hasCsvPlan).chart);
}

export function roomTypeChartTotalFact(rows: readonly RoomTypeChartRow[]): number {
  return rows.reduce((s, r) => s + (Number.isFinite(r.fact) ? r.fact : 0), 0);
}
