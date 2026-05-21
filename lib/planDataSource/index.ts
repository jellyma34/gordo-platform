/**
 * Слой planDataSource: загрузка/разбор CSV плана KPI квартир, валидация, нормализация, выборка по периоду и объекту.
 * Факт продаж не импортируется здесь — берётся из отчёта/API в `SalesPlanPanel`.
 */
export { normalizeEntityLabel, normalizeMatchKey } from "./normalize";
export { findEntityRootSummaryInCsvRows, mergeEntitySummaryWithCsvRow } from "./entitySummaryPlanSlice";
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
export {
  detectApartmentPlanCsvType,
  isRuColumnarPlanCsvType,
  planSourceLabelForCsvType,
  csvTypeLabelRu,
} from "./apartmentPlanCsvPipeline";
export {
  detectLegacyWideTableCsv,
  detectColumnarPlanCsv,
  resolveColumnarPlanHeaders,
  parseLegacyWideTableFromGrid,
  LEGACY_WIDE_COLUMN_ALIASES,
} from "./legacyWideTableCsv";
export {
  quarterKeyToMonthKeys,
  resolveApartmentsPlanProjectVolume,
  selectPlanSliceForKpi,
} from "./selectPlanForKpi";
export type { ApartmentPlanKpiPlanDebugMeta } from "./selectPlanForKpi";
export {
  APARTMENT_KPI_ENTITY,
  isBiApartmentsSummaryRow,
  isBiGrandTotalRow,
} from "./apartmentPlanKpiEntity";
export {
  APARTMENT_ROOT_KEYS,
  COMMERCIAL_ROOT_KEYS,
  PARKING_ROOT_KEYS,
  STORAGE_ROOT_KEYS,
  isApartmentRootSummaryRow,
  isCommercialRootSummaryRow,
  isParkingRootSummaryRow,
  isStorageRootSummaryRow,
  normalizeEntityRowName,
} from "./entityRowMatchers";
export { getPlanCalculationStrategy } from "./apartmentPlanKpiStrategy";
export type { ApartmentPlanKpiCalculationStrategy, ApartmentPlanKpiCalculationStrategyLabel } from "./apartmentPlanKpiStrategy";
