import type { ApartmentPlanKpiDealFactDebug } from "@/lib/apartmentPlanFactsFromDeals";
import type { ApartmentPlanTypeKpiBreakdown } from "@/lib/apartmentPlanTypeKpi";
import type { ApartmentPlanKpiPlanSlice } from "@/lib/planDataSource/types";

/** Лимит квартир по умолчанию, если в CSV нет total_volume или файл не загружен. */
export const APARTMENT_PROJECT_TOTAL_UNITS = 79;

/** Входные числа для KPI «квартиры» (план/факт месяца, накопит.; totalVolume — знаменатель % от объёма). */
export type ApartmentPlanPeriodKpiInputs = {
  planMonth: number;
  factMonth: number;
  planCumulative: number;
  factCumulative: number;
  totalVolume: number;
};

/** Отладка расчёта плана KPI (стратегия cumulative из CSV). */
export type ApartmentPlanKpiPlanCalcDebug = {
  calculationStrategyLabel: "BI_REPORT_MODE" | "RAW_MONTHLY_MODE";
  cumulativeDebugEn: string;
  cumulativeDebugRu: string;
  kpiEntity?: "Apartments";
  csvSummaryRow?: string;
  selectedMonthLabel?: string;
  planCumulativeSource?: number;
};

/** Данные для UI: план только после загрузки CSV плана; факт всегда из системы. */
export type ApartmentPlanPeriodKpiWithCsv = ApartmentPlanPeriodKpiInputs & {
  hasCsvPlan: true;
  /** Отладка: уникальные квартиры и дубликаты выгрузки (из JSON сделок). */
  dealFactDebug?: ApartmentPlanKpiDealFactDebug | null;
  planCalcDebug?: ApartmentPlanKpiPlanCalcDebug | null;
};
export type ApartmentPlanPeriodKpiFactsOnly = {
  hasCsvPlan: false;
  factMonth: number;
  factCumulative: number;
  dealFactDebug?: ApartmentPlanKpiDealFactDebug | null;
};
export type ApartmentPlanPeriodKpiUiData = (ApartmentPlanPeriodKpiWithCsv | ApartmentPlanPeriodKpiFactsOnly) & {
  /** Разбивка по типам квартир (1–4+ ком.); не дублирует сводные KPI. */
  typeBreakdown?: ApartmentPlanTypeKpiBreakdown;
};

function safeNonNeg(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Ограничение планов сверху величиной объёма проекта (из CSV или дефолт). */
export function capPlanFields(
  raw: Pick<ApartmentPlanPeriodKpiInputs, "planMonth" | "factMonth" | "planCumulative" | "factCumulative">,
  capLimit: number,
): ApartmentPlanPeriodKpiInputs {
  const cap =
    !Number.isFinite(capLimit) || capLimit <= 0 ? APARTMENT_PROJECT_TOTAL_UNITS : Math.min(capLimit, 1_000_000);
  return {
    planMonth: Math.min(safeNonNeg(raw.planMonth), cap),
    factMonth: safeNonNeg(raw.factMonth),
    planCumulative: Math.min(safeNonNeg(raw.planCumulative), cap),
    factCumulative: safeNonNeg(raw.factCumulative),
    totalVolume: cap,
  };
}

/** План из CSV + факт только из отчёта / сделок (JSON/API). Колонки факта в CSV игнорируются. */
export function mergeApartmentPlanCsvWithFacts(
  plan: ApartmentPlanKpiPlanSlice,
  facts: Pick<ApartmentPlanPeriodKpiInputs, "factMonth" | "factCumulative">,
): ApartmentPlanPeriodKpiInputs {
  const baseVol = plan.totalVolume > 0 ? plan.totalVolume : APARTMENT_PROJECT_TOTAL_UNITS;
  /** Потолок для плановых полей: не режем план из‑за заниженного total_volume в одной строке. */
  const capForPlans = Math.max(
    baseVol,
    safeNonNeg(plan.planMonth),
    safeNonNeg(plan.planCumulative),
    APARTMENT_PROJECT_TOTAL_UNITS,
  );
  const capped = capPlanFields(
    {
      planMonth: plan.planMonth,
      planCumulative: plan.planCumulative,
      factMonth: facts.factMonth,
      factCumulative: facts.factCumulative,
    },
    Math.min(capForPlans, 1_000_000),
  );
  /** KPI 3: знаменатель — объём из CSV (total_volume), не «раздутый» cap для планов. */
  const totalVolumeFromCsv =
    plan.totalVolume > 0 ? safeNonNeg(plan.totalVolume) : APARTMENT_PROJECT_TOTAL_UNITS;
  return { ...capped, totalVolume: totalVolumeFromCsv };
}

/** Доля в % к плану; без плана из CSV или при невалидном знаменателе — null (в UI показывать «—», не 0%). */
export function apartmentKpiExecutionPercent(numerator: number, planDenominator: number | null | undefined): number | null {
  if (planDenominator == null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(planDenominator) || planDenominator <= 0) return null;
  return (numerator / planDenominator) * 100;
}

export type ApartmentKpiHue = "green" | "yellow" | "red";

/** Цвет выполнения: зелёный ≥100%, жёлтый/оранжевый 70–99%, красный &lt;70%. */
export function apartmentKpiExecutionHue(pct: number): ApartmentKpiHue {
  if (!Number.isFinite(pct)) return "red";
  if (pct >= 100) return "green";
  if (pct >= 70) return "yellow";
  return "red";
}

/** Ширина полосы прогресса: не более 100%, фактический % для подписи не режем. */
export function apartmentKpiProgressWidthPercent(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}
