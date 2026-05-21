import type { ApartmentPlanCsvParseDiagnostics } from "@/lib/planDataSource/types";
import type { ApartmentPlanKpiCumulativeMode } from "@/lib/planDataSource/types";

/** Метки для отладки KPI (как в продуктовой спецификации). */
export type ApartmentPlanKpiCalculationStrategyLabel = "BI_REPORT_MODE" | "RAW_MONTHLY_MODE";

export type ApartmentPlanKpiCalculationStrategy = {
  cumulativeMode: ApartmentPlanKpiCumulativeMode;
  calculationStrategyLabel: ApartmentPlanKpiCalculationStrategyLabel;
  /** Англ. подписи для debug-панели */
  cumulativeDebugEn: string;
  cumulativeDebugRu: string;
};

/**
 * Стратегия расчёта накопительного плана KPI по типу CSV.
 * BI — доверяем колонке «План накопит. итогом»; wide — только сумма plan_month по месяцам.
 */
export function getPlanCalculationStrategy(
  csvType: ApartmentPlanCsvParseDiagnostics["csvType"],
): ApartmentPlanKpiCalculationStrategy {
  if (csvType === "bi_report") {
    return {
      cumulativeMode: "bi_report_ready_column",
      calculationStrategyLabel: "BI_REPORT_MODE",
      cumulativeDebugEn: 'Using cumulative value from CSV column: "План накопит. итогом"',
      cumulativeDebugRu: "Накопительный план — из колонки «План накопит. итогом» (пересчёту не подлежит).",
    };
  }
  return {
    cumulativeMode: "wide_table_sum_plan_month",
    calculationStrategyLabel: "RAW_MONTHLY_MODE",
    cumulativeDebugEn: "Cumulative plan = sum(plan_month) for all months ≤ selected period (inclusive).",
    cumulativeDebugRu: "План накопительно = сумма plan_month по всем месяцам до выбранного периода включительно.",
  };
}
