import type {
  TotalAreaCsvParseDiagnostics,
  TotalAreaEntitySummary,
  TotalAreaNormalizedRow,
  TotalAreaProjectColumnKind,
} from "@/lib/planDataSource/totalArea/types";

export const MARKETING_TOTAL_AREA_CSV_STORAGE_KEY = "marketingTotalAreaCsv";

export type MarketingTotalAreaCsvStoredV1 = {
  v: 1;
  updatedAt: string;
  uploadedBy?: string;
  fileName: string;
  rows: TotalAreaNormalizedRow[];
  warnings?: string[];
  diagnostics?: TotalAreaCsvParseDiagnostics;
  apartmentsSummary?: TotalAreaEntitySummary | null;
  parkingSummary?: TotalAreaEntitySummary | null;
  storageSummary?: TotalAreaEntitySummary | null;
  projectColumnKind?: TotalAreaProjectColumnKind;
};

function scopedKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_TOTAL_AREA_CSV_STORAGE_KEY}:v1:${safe}`;
}

export function marketingTotalAreaCsvDocIsValid(doc: unknown): doc is MarketingTotalAreaCsvStoredV1 {
  if (!doc || typeof doc !== "object") return false;
  const d = doc as MarketingTotalAreaCsvStoredV1;
  return d.v === 1 && typeof d.updatedAt === "string" && typeof d.fileName === "string" && Array.isArray(d.rows);
}

export function readMarketingTotalAreaCsvFromLocalStorage(projectId: string): MarketingTotalAreaCsvStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!marketingTotalAreaCsvDocIsValid(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMarketingTotalAreaCsvToLocalStorage(projectId: string, doc: MarketingTotalAreaCsvStoredV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(projectId), JSON.stringify(doc));
  } catch {
    /* quota */
  }
}

export function clearMarketingTotalAreaCsvLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(scopedKey(projectId));
  } catch {
    /* ignore */
  }
}
