import { parseParkingCsv } from "@/lib/parseParkingCsv";

export { parseParkingCsv };
export type { ParseParkingCsvResult } from "@/lib/parseParkingCsv";

/** Префикс ключа данных; полный ключ — {@link marketingParkingCsvLocalStorageKey}. */
export const MARKETING_PARKING_CSV_STORAGE_KEY = "marketingParkingCsv";

/** Префикс ключа метаданных; полный ключ — {@link marketingParkingCsvMetaLocalStorageKey}. */
export const MARKETING_PARKING_CSV_META_STORAGE_KEY = "marketingParkingCsvMeta";

export function marketingParkingCsvLocalStorageKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_PARKING_CSV_STORAGE_KEY}:v1:${safe}`;
}

export function marketingParkingCsvMetaLocalStorageKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_PARKING_CSV_META_STORAGE_KEY}:v1:${safe}`;
}

export type MarketingParkingCsvStoredV1 = {
  v: 1;
  updatedAt: string;
  fileName: string;
  uploadedBy?: string;
  rawText?: string;
  headers: string[];
  rows: string[][];
  warnings: string[];
};

export type MarketingParkingCsvMetaV1 = {
  v: 1;
  fileName: string;
  uploadedAt: string;
  uploadedBy?: string;
};

export function parseStoredMarketingParkingCsv(raw: unknown): MarketingParkingCsvStoredV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.updatedAt !== "string" || typeof o.fileName !== "string") return null;
  if (!Array.isArray(o.headers) || !Array.isArray(o.rows)) return null;
  const headers = o.headers.filter((h) => typeof h === "string") as string[];
  const rows = o.rows
    .filter((r) => Array.isArray(r))
    .map((r) => (r as unknown[]).map((c) => String(c ?? "")));
  const warnings = Array.isArray(o.warnings) ? (o.warnings.filter((w) => typeof w === "string") as string[]) : [];
  return {
    v: 1,
    updatedAt: o.updatedAt,
    fileName: o.fileName,
    uploadedBy: typeof o.uploadedBy === "string" ? o.uploadedBy : undefined,
    headers,
    rows,
    warnings,
  };
}

export function parseStoredMarketingParkingCsvMeta(raw: unknown): MarketingParkingCsvMetaV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.fileName !== "string" || typeof o.uploadedAt !== "string") return null;
  return {
    v: 1,
    fileName: o.fileName,
    uploadedAt: o.uploadedAt,
    uploadedBy: typeof o.uploadedBy === "string" ? o.uploadedBy : undefined,
  };
}

export function metaFromParkingDoc(doc: MarketingParkingCsvStoredV1): MarketingParkingCsvMetaV1 {
  return {
    v: 1,
    fileName: doc.fileName,
    uploadedAt: doc.updatedAt,
    uploadedBy: doc.uploadedBy,
  };
}

export function readMarketingParkingCsvFromLocalStorage(projectId: string): MarketingParkingCsvStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(marketingParkingCsvLocalStorageKey(projectId));
    if (!raw) return null;
    return parseStoredMarketingParkingCsv(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function readMarketingParkingCsvMetaFromLocalStorage(projectId: string): MarketingParkingCsvMetaV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(marketingParkingCsvMetaLocalStorageKey(projectId));
    if (!raw) return null;
    return parseStoredMarketingParkingCsvMeta(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeMarketingParkingCsvToLocalStorage(projectId: string, doc: MarketingParkingCsvStoredV1): void {
  if (typeof window === "undefined") return;
  const meta = metaFromParkingDoc(doc);
  try {
    window.localStorage.setItem(marketingParkingCsvLocalStorageKey(projectId), JSON.stringify(doc));
    window.localStorage.setItem(marketingParkingCsvMetaLocalStorageKey(projectId), JSON.stringify(meta));
  } catch (e) {
    console.warn("[Parking CSV] localStorage save failed", e);
  }
}

export function clearMarketingParkingCsvLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(marketingParkingCsvLocalStorageKey(projectId));
    window.localStorage.removeItem(marketingParkingCsvMetaLocalStorageKey(projectId));
  } catch {
    /* ignore */
  }
}

export function parkingCsvHasData(doc: MarketingParkingCsvStoredV1 | null | undefined): boolean {
  return (doc?.rows?.length ?? 0) > 0 || (doc?.headers?.length ?? 0) > 0;
}
