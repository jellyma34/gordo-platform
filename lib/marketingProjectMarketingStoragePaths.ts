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
