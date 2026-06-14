import type { InstallmentForecastNormalizedRow } from "@/lib/planDataSource/installmentForecast/types";
import type { InstallmentForecastCsvParseDiagnostics } from "@/lib/planDataSource/installmentForecast/types";

export const MARKETING_INSTALLMENT_FORECAST_CSV_STORAGE_KEY = "marketingInstallmentForecastCsv";

export type MarketingInstallmentForecastCsvStoredV1 = {
  v: 1;
  updatedAt: string;
  uploadedBy?: string;
  fileName: string;
  rows: InstallmentForecastNormalizedRow[];
  warnings?: string[];
  diagnostics?: InstallmentForecastCsvParseDiagnostics;
};

function scopedKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_INSTALLMENT_FORECAST_CSV_STORAGE_KEY}:v1:${safe}`;
}

export function marketingInstallmentForecastCsvDocIsValid(
  doc: unknown,
): doc is MarketingInstallmentForecastCsvStoredV1 {
  if (!doc || typeof doc !== "object") return false;
  const d = doc as MarketingInstallmentForecastCsvStoredV1;
  return d.v === 1 && typeof d.updatedAt === "string" && typeof d.fileName === "string" && Array.isArray(d.rows);
}

export function readMarketingInstallmentForecastCsvFromLocalStorage(
  projectId: string,
): MarketingInstallmentForecastCsvStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!marketingInstallmentForecastCsvDocIsValid(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMarketingInstallmentForecastCsvToLocalStorage(
  projectId: string,
  doc: MarketingInstallmentForecastCsvStoredV1,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(projectId), JSON.stringify(doc));
  } catch {
    /* quota */
  }
}

export function clearMarketingInstallmentForecastCsvLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(scopedKey(projectId));
  } catch {
    /* ignore */
  }
}
