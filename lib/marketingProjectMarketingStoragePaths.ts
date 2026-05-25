import path from "path";

import { sanitizeMarketingPaymentPlanProjectId } from "@/lib/marketingPaymentPlanStore";

/** Общее проектное хранилище доп. CSV маркетинга (инвесторы, штуки) под `data/projects/<id>/marketing/`. */
export function marketingProjectMarketingDir(projectId: string): string {
  const safe = sanitizeMarketingPaymentPlanProjectId(projectId);
  return path.join(process.cwd(), "data", "projects", safe, "marketing");
}

export function marketingProjectInvestorsJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "investors.json");
}

export function marketingProjectInvestorsRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "investors.raw.csv");
}

export function marketingProjectUnitsExecutionJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "units-execution.json");
}

export function marketingProjectUnitsExecutionRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "units-execution.raw.csv");
}

export function marketingProjectSegmentExecutionJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "segment-execution.json");
}

export function marketingProjectSegmentExecutionRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "segment-execution.raw.csv");
}

export function marketingProjectApartmentsJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "apartments.json");
}

export function marketingProjectApartmentsRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "apartments.raw.csv");
}

export function marketingProjectParkingJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "parking.json");
}

export function marketingProjectParkingRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "parking.raw.csv");
}

export function marketingProjectStoragesJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "storages.json");
}

export function marketingProjectStoragesRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "storages.raw.csv");
}

export function marketingProjectReceiptsPlanFactJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "receipts-plan-fact.json");
}

export function marketingProjectReceiptsPlanFactRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "поступления_план_факт.raw.csv");
}

export function marketingProjectLeadsCsvJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "marketing-leads.json");
}

export function marketingProjectLeadsCsvRawPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "лиды.raw.csv");
}

export function marketingProjectRevenueFactJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "revenue-fact.json");
}

export function marketingProjectRevenueFactRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "revenue-fact.raw.csv");
}

export function marketingProjectInstallmentForecastJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "installment-forecast.json");
}

export function marketingProjectInstallmentForecastRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "installment-forecast.raw.csv");
}

export function marketingProjectInstallmentAreaJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "installment-area.json");
}

export function marketingProjectInstallmentAreaRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "installment-area.raw.csv");
}

export function marketingProjectDduRevenueJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "ddu-revenue.json");
}

export function marketingProjectDduRevenueRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "ddu-revenue.raw.csv");
}

export function marketingProjectProjectValueJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "project-value.json");
}

export function marketingProjectProjectValueRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "project-value.raw.csv");
}

export function marketingProjectApartmentPlanJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "apartment-plan.json");
}

export function marketingProjectApartmentPlanRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "apartment-plan.raw.csv");
}

export function marketingProjectAveragePricePerSqmJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "average-price-per-sqm.json");
}

export function marketingProjectAveragePricePerSqmRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "average-price-per-sqm.raw.csv");
}

export function marketingProjectTotalAreaJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "total-area.json");
}

export function marketingProjectTotalAreaRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "total-area.raw.csv");
}

export function marketingProjectReducedAreaJsonPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "reduced-area.json");
}

export function marketingProjectReducedAreaRawCsvPath(projectId: string): string {
  return path.join(marketingProjectMarketingDir(projectId), "reduced-area.raw.csv");
}
