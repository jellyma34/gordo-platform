import { parseApartmentsCsv } from "@/lib/parseApartmentsCsv";

export { parseApartmentsCsv };
export type { ParseApartmentsCsvResult } from "@/lib/parseApartmentsCsv";

/** Префикс ключа данных; полный ключ — {@link marketingApartmentsCsvLocalStorageKey}. */
export const MARKETING_APARTMENTS_CSV_STORAGE_KEY = "marketingApartmentsCsv";

/** Префикс ключа метаданных; полный ключ — {@link marketingApartmentsCsvMetaLocalStorageKey}. */
export const MARKETING_APARTMENTS_CSV_META_STORAGE_KEY = "marketingApartmentsCsvMeta";

export function marketingApartmentsCsvLocalStorageKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_APARTMENTS_CSV_STORAGE_KEY}:v1:${safe}`;
}

export function marketingApartmentsCsvMetaLocalStorageKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_APARTMENTS_CSV_META_STORAGE_KEY}:v1:${safe}`;
}

export type MarketingApartmentsCsvStoredV1 = {
  v: 1;
  updatedAt: string;
  fileName: string;
  uploadedBy?: string;
  headers: string[];
  rows: string[][];
  warnings: string[];
};

export type MarketingApartmentsCsvMetaV1 = {
  v: 1;
  fileName: string;
  uploadedAt: string;
  uploadedBy?: string;
};

export function parseStoredMarketingApartmentsCsv(raw: unknown): MarketingApartmentsCsvStoredV1 | null {
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

export function parseStoredMarketingApartmentsCsvMeta(raw: unknown): MarketingApartmentsCsvMetaV1 | null {
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

export function metaFromApartmentsDoc(doc: MarketingApartmentsCsvStoredV1): MarketingApartmentsCsvMetaV1 {
  return {
    v: 1,
    fileName: doc.fileName,
    uploadedAt: doc.updatedAt,
    uploadedBy: doc.uploadedBy,
  };
}

export function readMarketingApartmentsCsvFromLocalStorage(projectId: string): MarketingApartmentsCsvStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(marketingApartmentsCsvLocalStorageKey(projectId));
    if (!raw) return null;
    return parseStoredMarketingApartmentsCsv(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function readMarketingApartmentsCsvMetaFromLocalStorage(projectId: string): MarketingApartmentsCsvMetaV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(marketingApartmentsCsvMetaLocalStorageKey(projectId));
    if (!raw) return null;
    return parseStoredMarketingApartmentsCsvMeta(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeMarketingApartmentsCsvToLocalStorage(projectId: string, doc: MarketingApartmentsCsvStoredV1): void {
  if (typeof window === "undefined") return;
  const meta = metaFromApartmentsDoc(doc);
  try {
    window.localStorage.setItem(marketingApartmentsCsvLocalStorageKey(projectId), JSON.stringify(doc));
    window.localStorage.setItem(marketingApartmentsCsvMetaLocalStorageKey(projectId), JSON.stringify(meta));
  } catch (e) {
    console.warn("[Apartments CSV] localStorage save failed", e);
  }
}

export function clearMarketingApartmentsCsvLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(marketingApartmentsCsvLocalStorageKey(projectId));
    window.localStorage.removeItem(marketingApartmentsCsvMetaLocalStorageKey(projectId));
  } catch {
    /* ignore */
  }
}

export function apartmentsCsvHasData(doc: MarketingApartmentsCsvStoredV1 | null | undefined): boolean {
  return (doc?.rows?.length ?? 0) > 0 || (doc?.headers?.length ?? 0) > 0;
}
