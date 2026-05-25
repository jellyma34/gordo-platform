import type {
  AveragePricePerSqmCsvParseDiagnostics,
  AveragePricePerSqmEntitySummary,
  AveragePricePerSqmNormalizedRow,
  AveragePriceProjectColumnKind,
} from "@/lib/planDataSource/averagePricePerSqm/types";

export const MARKETING_AVERAGE_PRICE_PER_SQM_CSV_STORAGE_KEY = "marketingAveragePricePerSqmCsv";

export type MarketingAveragePricePerSqmCsvStoredV1 = {
  v: 1;
  updatedAt: string;
  uploadedBy?: string;
  fileName: string;
  rows: AveragePricePerSqmNormalizedRow[];
  warnings?: string[];
  diagnostics?: AveragePricePerSqmCsvParseDiagnostics;
  apartmentsSummary?: AveragePricePerSqmEntitySummary | null;
  parkingSummary?: AveragePricePerSqmEntitySummary | null;
  storageSummary?: AveragePricePerSqmEntitySummary | null;
  projectColumnKind?: AveragePriceProjectColumnKind;
};

function scopedKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_AVERAGE_PRICE_PER_SQM_CSV_STORAGE_KEY}:v1:${safe}`;
}

export function marketingAveragePricePerSqmCsvDocIsValid(
  doc: unknown,
): doc is MarketingAveragePricePerSqmCsvStoredV1 {
  if (!doc || typeof doc !== "object") return false;
  const d = doc as MarketingAveragePricePerSqmCsvStoredV1;
  return d.v === 1 && typeof d.updatedAt === "string" && typeof d.fileName === "string" && Array.isArray(d.rows);
}

export function readMarketingAveragePricePerSqmCsvFromLocalStorage(
  projectId: string,
): MarketingAveragePricePerSqmCsvStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(scopedKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!marketingAveragePricePerSqmCsvDocIsValid(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMarketingAveragePricePerSqmCsvToLocalStorage(
  projectId: string,
  doc: MarketingAveragePricePerSqmCsvStoredV1,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(projectId), JSON.stringify(doc));
  } catch {
    /* quota */
  }
}

export function clearMarketingAveragePricePerSqmCsvLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(scopedKey(projectId));
  } catch {
    /* ignore */
  }
}
