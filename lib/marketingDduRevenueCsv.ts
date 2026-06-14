import type {
  DduRevenueCsvParseDiagnostics,
  DduRevenueEntitySummary,
  DduRevenueNormalizedRow,
} from "@/lib/planDataSource/dduRevenue/types";

export const MARKETING_DDU_REVENUE_CSV_STORAGE_KEY = "marketingDduRevenueCsv";

export type MarketingDduRevenueCsvStoredV1 = {
  v: 1;
  updatedAt: string;
  uploadedBy?: string;
  fileName: string;
  rows: DduRevenueNormalizedRow[];
  warnings?: string[];
  diagnostics?: DduRevenueCsvParseDiagnostics;
  apartmentsSummary?: DduRevenueEntitySummary | null;
  parkingSummary?: DduRevenueEntitySummary | null;
  storageSummary?: DduRevenueEntitySummary | null;
};

function scopedKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_DDU_REVENUE_CSV_STORAGE_KEY}:v1:${safe}`;
}

export function marketingDduRevenueCsvDocIsValid(doc: unknown): doc is MarketingDduRevenueCsvStoredV1 {
  if (!doc || typeof doc !== "object") return false;
  const d = doc as MarketingDduRevenueCsvStoredV1;
  return d.v === 1 && typeof d.updatedAt === "string" && typeof d.fileName === "string" && Array.isArray(d.rows);
}

export function readMarketingDduRevenueCsvFromLocalStorage(
  projectId: string,
): MarketingDduRevenueCsvStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!marketingDduRevenueCsvDocIsValid(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMarketingDduRevenueCsvToLocalStorage(
  projectId: string,
  doc: MarketingDduRevenueCsvStoredV1,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(projectId), JSON.stringify(doc));
  } catch {
    /* quota */
  }
}

export function clearMarketingDduRevenueCsvLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(scopedKey(projectId));
  } catch {
    /* ignore */
  }
}
