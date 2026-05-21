/**
 * Слой planDataSource: загрузка/разбор CSV плана KPI квартир, валидация, нормализация, выборка по периоду и объекту.
 * Факт продаж не импортируется здесь — берётся из отчёта/API в `SalesPlanPanel`.
 */
export { normalizeMatchKey } from "./normalize";
export type {
  ApartmentPlanCsvNormalizedRow,
  ApartmentPlanCsvParseDiagnostics,
  ApartmentPlanCsvParseFail,
  ApartmentPlanCsvParseOk,
  ApartmentPlanCsvParseResult,
  ApartmentPlanKpiPlanSlice,
  ParseApartmentPlanCsvOptions,
  ApartmentPlanKpiCumulativeMode,
} from "./types";
export { APARTMENT_PLAN_CSV_MAX_BYTES, parseApartmentPlanCsvAsync, parseMonthKeyCell } from "./parseApartmentPlanCsv";
export {
  detectApartmentPlanBiReportCsv,
  inferMonthKeyFromFileName,
  parseApartmentPlanBiReportFromGrid,
  resolveBiReportMonthKey,
} from "./parseApartmentPlanBiReportCsv";
export { quarterKeyToMonthKeys, selectPlanSliceForKpi } from "./selectPlanForKpi";
export type { ApartmentPlanKpiPlanDebugMeta } from "./selectPlanForKpi";
export {
  APARTMENT_KPI_ENTITY,
  isBiApartmentsSummaryRow,
  isBiGrandTotalRow,
} from "./apartmentPlanKpiEntity";
export { getPlanCalculationStrategy } from "./apartmentPlanKpiStrategy";
export type { ApartmentPlanKpiCalculationStrategy, ApartmentPlanKpiCalculationStrategyLabel } from "./apartmentPlanKpiStrategy";
