import type {
  ReducedAreaCsvParseDiagnostics,
  ReducedAreaEntitySummary,
  ReducedAreaNormalizedRow,
  ReducedAreaProjectColumnKind,
} from "@/lib/planDataSource/reducedArea/types";

export const MARKETING_REDUCED_AREA_CSV_STORAGE_KEY = "marketingReducedAreaCsv";

export type MarketingReducedAreaCsvStoredV1 = {
  v: 1;
  updatedAt: string;
  uploadedBy?: string;
  fileName: string;
  rows: ReducedAreaNormalizedRow[];
  warnings?: string[];
  diagnostics?: ReducedAreaCsvParseDiagnostics;
  apartmentsSummary?: ReducedAreaEntitySummary | null;
  parkingSummary?: ReducedAreaEntitySummary | null;
  storageSummary?: ReducedAreaEntitySummary | null;
  projectColumnKind?: ReducedAreaProjectColumnKind;
};

function scopedKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_REDUCED_AREA_CSV_STORAGE_KEY}:v1:${safe}`;
}

export function marketingReducedAreaCsvDocIsValid(doc: unknown): doc is MarketingReducedAreaCsvStoredV1 {
  if (!doc || typeof doc !== "object") return false;
  const d = doc as MarketingReducedAreaCsvStoredV1;
  return d.v === 1 && typeof d.updatedAt === "string" && typeof d.fileName === "string" && Array.isArray(d.rows);
}

export function readMarketingReducedAreaCsvFromLocalStorage(projectId: string): MarketingReducedAreaCsvStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!marketingReducedAreaCsvDocIsValid(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMarketingReducedAreaCsvToLocalStorage(projectId: string, doc: MarketingReducedAreaCsvStoredV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(projectId), JSON.stringify(doc));
  } catch {
    /* quota */
  }
}

export function clearMarketingReducedAreaCsvLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(scopedKey(projectId));
  } catch {
    /* ignore */
  }
}
