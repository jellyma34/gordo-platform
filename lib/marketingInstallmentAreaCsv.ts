import type {
  InstallmentAreaApartmentsSummary,
  InstallmentAreaEntitySummary,
} from "@/lib/planDataSource/installmentArea/types";
import type { InstallmentAreaCsvNormalizedRow } from "@/lib/planDataSource/installmentArea/types";
import type { InstallmentAreaCsvParseDiagnostics } from "@/lib/planDataSource/installmentArea/types";

export const MARKETING_INSTALLMENT_AREA_CSV_STORAGE_KEY = "marketingInstallmentAreaCsv";

export type MarketingInstallmentAreaCsvStoredV1 = {
  v: 1;
  updatedAt: string;
  uploadedBy?: string;
  fileName: string;
  rows: InstallmentAreaCsvNormalizedRow[];
  warnings?: string[];
  diagnostics?: InstallmentAreaCsvParseDiagnostics;
  apartmentsSummary?: InstallmentAreaApartmentsSummary | null;
  parkingSummary?: InstallmentAreaEntitySummary | null;
  storageSummary?: InstallmentAreaEntitySummary | null;
};

function scopedKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_INSTALLMENT_AREA_CSV_STORAGE_KEY}:v1:${safe}`;
}

export function marketingInstallmentAreaCsvDocIsValid(doc: unknown): doc is MarketingInstallmentAreaCsvStoredV1 {
  if (!doc || typeof doc !== "object") return false;
  const d = doc as MarketingInstallmentAreaCsvStoredV1;
  return d.v === 1 && typeof d.updatedAt === "string" && typeof d.fileName === "string" && Array.isArray(d.rows);
}

export function readMarketingInstallmentAreaCsvFromLocalStorage(
  projectId: string,
): MarketingInstallmentAreaCsvStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!marketingInstallmentAreaCsvDocIsValid(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMarketingInstallmentAreaCsvToLocalStorage(
  projectId: string,
  doc: MarketingInstallmentAreaCsvStoredV1,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(projectId), JSON.stringify(doc));
  } catch {
    /* quota */
  }
}

export function clearMarketingInstallmentAreaCsvLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(scopedKey(projectId));
  } catch {
    /* ignore */
  }
}
