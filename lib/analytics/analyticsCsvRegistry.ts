import { ANALYTICS_CSV_PUBLIC_BASE } from "@/lib/analytics/analyticsCsvPath";
import type { MarketingImportDatasetKey, MarketingImportKind } from "@/lib/marketingImportKinds";

export type AnalyticsCsvRegistryEntry = {
  kind: MarketingImportKind;
  /** Имя файла в `public/data/analytics/`. */
  fileName: string;
  /** Публичный URL (static asset, попадает в build/deploy). */
  publicUrl: string;
  /** Ключ в ответе GET `/api/projects/.../marketing/storage`. */
  datasetKey: MarketingImportDatasetKey;
  label: string;
};

function entry(
  kind: MarketingImportKind,
  fileName: string,
  datasetKey: MarketingImportDatasetKey,
  label: string,
): AnalyticsCsvRegistryEntry {
  return {
    kind,
    fileName,
    publicUrl: `${ANALYTICS_CSV_PUBLIC_BASE}/${fileName}`,
    datasetKey,
    label,
  };
}

/** Единый реестр analytics CSV — source of truth для git + Railway deploy. */
export const ANALYTICS_CSV_REGISTRY: Record<MarketingImportKind, AnalyticsCsvRegistryEntry> = {
  investors: entry("investors", "investors.csv", "investors", "Инвесторы"),
  segment_execution: entry("segment_execution", "segment-execution.csv", "segmentExecution", "Исполнение по сегментам"),
  units_execution: entry("units_execution", "units-execution.csv", "unitsExecution", "Исполнение в штуках"),
  apartments: entry("apartments", "apartments.csv", "apartments", "Квартиры"),
  parking: entry("parking", "parking.csv", "parking", "Парковки"),
  storages: entry("storages", "storages.csv", "storages", "Кладовые"),
  receipts_plan_fact: entry("receipts_plan_fact", "receipts-plan-fact.csv", "receiptsPlanFact", "Поступления план/факт"),
  marketing_leads: entry("marketing_leads", "marketing-leads.csv", "marketingLeads", "Лиды"),
  revenue_fact: entry("revenue_fact", "revenue-fact.csv", "revenueFact", "Выручка факт"),
  installment_forecast: entry("installment_forecast", "installment-forecast.csv", "installmentForecast", "Прогноз рассрочки"),
  installment_area: entry("installment_area", "installment-area.csv", "installmentArea", "Площадь рассрочки"),
  ddu_revenue: entry("ddu_revenue", "ddu-sales.csv", "dduRevenue", "Продажи по ДДУ"),
  project_value: entry("project_value", "project-value.csv", "projectValue", "Стоимость проекта"),
  apartment_plan: entry("apartment_plan", "apartment-plan.csv", "apartmentPlan", "План квартир"),
  average_price_per_sqm: entry("average_price_per_sqm", "avg-price.csv", "averagePricePerSqm", "Средняя цена м²"),
  total_area: entry("total_area", "total-area.csv", "totalArea", "Общая площадь"),
  reduced_area: entry("reduced_area", "reduced-area.csv", "reducedAreaAnalytics", "Приведенная площадь"),
};

export const ANALYTICS_CSV_KINDS = Object.keys(ANALYTICS_CSV_REGISTRY) as MarketingImportKind[];

export function analyticsCsvRegistryEntry(kind: MarketingImportKind): AnalyticsCsvRegistryEntry {
  return ANALYTICS_CSV_REGISTRY[kind];
}

export function analyticsCsvMetaFileName(kind: MarketingImportKind): string {
  return `${ANALYTICS_CSV_REGISTRY[kind].fileName}.meta.json`;
}
