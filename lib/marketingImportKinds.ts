/** Ключи маркетинговых импортов (server-side JSON + raw CSV). */
export const MARKETING_IMPORT_KINDS = [
  "investors",
  "segment_execution",
  "units_execution",
  "apartments",
  "parking",
  "storages",
  "receipts_plan_fact",
  "marketing_leads",
  "revenue_fact",
  "installment_forecast",
  "installment_area",
  "ddu_revenue",
  "project_value",
  "apartment_plan",
] as const;

export type MarketingImportKind = (typeof MARKETING_IMPORT_KINDS)[number];

/** Ключ dataset в GET `/api/projects/.../marketing/storage`. */
export type MarketingImportDatasetKey =
  | "investors"
  | "segmentExecution"
  | "unitsExecution"
  | "apartments"
  | "parking"
  | "storages"
  | "receiptsPlanFact"
  | "marketingLeads"
  | "revenueFact"
  | "installmentForecast"
  | "installmentArea"
  | "dduRevenue"
  | "projectValue"
  | "apartmentPlan";

export const MARKETING_IMPORT_KIND_ALIASES: Record<string, MarketingImportKind> = {
  investors: "investors",
  segment_execution: "segment_execution",
  "segment-execution": "segment_execution",
  execution_segments: "segment_execution",
  units_execution: "units_execution",
  "units-execution": "units_execution",
  units: "units_execution",
  apartments: "apartments",
  apartments_csv: "apartments",
  parking: "parking",
  parking_csv: "parking",
  storages: "storages",
  storages_csv: "storages",
  storage: "storages",
  storage_csv: "storages",
  receipts_plan_fact: "receipts_plan_fact",
  "receipts-plan-fact": "receipts_plan_fact",
  plan_vs_fact: "receipts_plan_fact",
  поступления_план_факт: "receipts_plan_fact",
  marketing_leads: "marketing_leads",
  "marketing-leads": "marketing_leads",
  leads_csv: "marketing_leads",
  лиды: "marketing_leads",
  revenue_fact: "revenue_fact",
  "revenue-fact": "revenue_fact",
  sales_structure_revenue: "revenue_fact",
  structure_revenue_fact: "revenue_fact",
  installment_forecast: "installment_forecast",
  "installment-forecast": "installment_forecast",
  installment_forecast_csv: "installment_forecast",
  installment_area: "installment_area",
  "installment-area": "installment_area",
  project_area_csv: "installment_area",
  ddu_revenue: "ddu_revenue",
  "ddu-revenue": "ddu_revenue",
  sales_plan_csv: "ddu_revenue",
  project_value: "project_value",
  "project-value": "project_value",
  project_value_csv: "project_value",
  apartment_plan: "apartment_plan",
  "apartment-plan": "apartment_plan",
  apartment_plan_csv: "apartment_plan",
};

export function normalizeMarketingImportKind(raw: string | null | undefined): MarketingImportKind | null {
  const k = String(raw ?? "")
    .toLowerCase()
    .trim();
  return MARKETING_IMPORT_KIND_ALIASES[k] ?? null;
}
