import type {
  ProjectValueCsvParseDiagnostics,
  ProjectValueEntitySummary,
  ProjectValueNormalizedRow,
} from "@/lib/planDataSource/projectValue/types";

export const MARKETING_PROJECT_VALUE_CSV_STORAGE_KEY = "marketingProjectValueCsv";

export type MarketingProjectValueCsvStoredV1 = {
  v: 1;
  updatedAt: string;
  uploadedBy?: string;
  fileName: string;
  rows: ProjectValueNormalizedRow[];
  warnings?: string[];
  diagnostics?: ProjectValueCsvParseDiagnostics;
  apartmentsSummary?: ProjectValueEntitySummary | null;
  parkingSummary?: ProjectValueEntitySummary | null;
  storageSummary?: ProjectValueEntitySummary | null;
  commercialSummary?: ProjectValueEntitySummary | null;
};

function scopedKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_PROJECT_VALUE_CSV_STORAGE_KEY}:v1:${safe}`;
}

export function marketingProjectValueCsvDocIsValid(doc: unknown): doc is MarketingProjectValueCsvStoredV1 {
  if (!doc || typeof doc !== "object") return false;
  const d = doc as MarketingProjectValueCsvStoredV1;
  return (
    d.v === 1 &&
    typeof d.updatedAt === "string" &&
    typeof d.fileName === "string" &&
    Array.isArray(d.rows) &&
    d.rows.every((r) => r && typeof r.segmentNorm === "string")
  );
}

export function readMarketingProjectValueCsvFromLocalStorage(
  projectId: string,
): MarketingProjectValueCsvStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!marketingProjectValueCsvDocIsValid(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMarketingProjectValueCsvToLocalStorage(
  projectId: string,
  doc: MarketingProjectValueCsvStoredV1,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(projectId), JSON.stringify(doc));
  } catch {
    /* quota */
  }
}

export function clearMarketingProjectValueCsvLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(scopedKey(projectId));
  } catch {
    /* ignore */
  }
}
