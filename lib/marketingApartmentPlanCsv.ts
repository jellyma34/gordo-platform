import type { ApartmentPlanCsvNormalizedRow, ApartmentPlanCsvParseDiagnostics } from "@/lib/planDataSource/types";

export const MARKETING_APARTMENT_PLAN_CSV_STORAGE_KEY = "marketingApartmentPlanCsv";

export type MarketingApartmentPlanCsvStoredV1 = {
  v: 1;
  updatedAt: string;
  uploadedBy?: string;
  fileName: string;
  rows: ApartmentPlanCsvNormalizedRow[];
  warnings?: string[];
  /** Последний успешный разбор: сопоставление колонок и превью для отладки */
  diagnostics?: ApartmentPlanCsvParseDiagnostics;
  /** Метаданные BI-отчёта (свод «Квартиры», месяц отчёта) */
  biReportMeta?: {
    monthKey: string;
    apartmentsSummary?: {
      planMonth: number;
      planCumulative: number;
      planProject: number;
      rawLabel: string;
    } | null;
    summaryPlanProject?: number | null;
  };
};

function scopedKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_APARTMENT_PLAN_CSV_STORAGE_KEY}:v1:${safe}`;
}

export function marketingApartmentPlanCsvDocIsValid(doc: unknown): doc is MarketingApartmentPlanCsvStoredV1 {
  if (!doc || typeof doc !== "object") return false;
  const d = doc as MarketingApartmentPlanCsvStoredV1;
  if (d.v !== 1) return false;
  if (typeof d.updatedAt !== "string") return false;
  if (typeof d.fileName !== "string") return false;
  return Array.isArray(d.rows);
}

export function readMarketingApartmentPlanCsvFromLocalStorage(projectId: string): MarketingApartmentPlanCsvStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!marketingApartmentPlanCsvDocIsValid(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMarketingApartmentPlanCsvToLocalStorage(
  projectId: string,
  doc: MarketingApartmentPlanCsvStoredV1,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(projectId), JSON.stringify(doc));
  } catch {
    /* quota / private mode */
  }
}

export function clearMarketingApartmentPlanCsvLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(scopedKey(projectId));
  } catch {
    /* ignore */
  }
}
