import { parseStoragesCsv } from "@/lib/parseStoragesCsv";

export { parseStoragesCsv };
export type { ParseStoragesCsvResult } from "@/lib/parseStoragesCsv";

/** Префикс ключа данных; полный ключ — {@link marketingStoragesCsvLocalStorageKey}. */
export const MARKETING_STORAGES_CSV_STORAGE_KEY = "marketingStoragesCsv";

/** Префикс ключа метаданных; полный ключ — {@link marketingStoragesCsvMetaLocalStorageKey}. */
export const MARKETING_STORAGES_CSV_META_STORAGE_KEY = "marketingStoragesCsvMeta";

export function marketingStoragesCsvLocalStorageKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_STORAGES_CSV_STORAGE_KEY}:v1:${safe}`;
}

export function marketingStoragesCsvMetaLocalStorageKey(projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${MARKETING_STORAGES_CSV_META_STORAGE_KEY}:v1:${safe}`;
}

export type MarketingStoragesCsvStoredV1 = {
  v: 1;
  updatedAt: string;
  fileName: string;
  uploadedBy?: string;
  rawText?: string;
  headers: string[];
  rows: string[][];
  warnings: string[];
};

export type MarketingStoragesCsvMetaV1 = {
  v: 1;
  fileName: string;
  uploadedAt: string;
  uploadedBy?: string;
};

export function parseStoredMarketingStoragesCsv(raw: unknown): MarketingStoragesCsvStoredV1 | null {
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

export function parseStoredMarketingStoragesCsvMeta(raw: unknown): MarketingStoragesCsvMetaV1 | null {
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

export function metaFromStoragesDoc(doc: MarketingStoragesCsvStoredV1): MarketingStoragesCsvMetaV1 {
  return {
    v: 1,
    fileName: doc.fileName,
    uploadedAt: doc.updatedAt,
    uploadedBy: doc.uploadedBy,
  };
}

export function readMarketingStoragesCsvFromLocalStorage(projectId: string): MarketingStoragesCsvStoredV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(marketingStoragesCsvLocalStorageKey(projectId));
    if (!raw) return null;
    return parseStoredMarketingStoragesCsv(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function readMarketingStoragesCsvMetaFromLocalStorage(projectId: string): MarketingStoragesCsvMetaV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(marketingStoragesCsvMetaLocalStorageKey(projectId));
    if (!raw) return null;
    return parseStoredMarketingStoragesCsvMeta(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeMarketingStoragesCsvToLocalStorage(projectId: string, doc: MarketingStoragesCsvStoredV1): void {
  if (typeof window === "undefined") return;
  const meta = metaFromStoragesDoc(doc);
  try {
    window.localStorage.setItem(marketingStoragesCsvLocalStorageKey(projectId), JSON.stringify(doc));
    window.localStorage.setItem(marketingStoragesCsvMetaLocalStorageKey(projectId), JSON.stringify(meta));
  } catch (e) {
    console.warn("[Storages CSV] localStorage save failed", e);
  }
}

export function clearMarketingStoragesCsvLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(marketingStoragesCsvLocalStorageKey(projectId));
    window.localStorage.removeItem(marketingStoragesCsvMetaLocalStorageKey(projectId));
  } catch {
    /* ignore */
  }
}

export function storagesCsvHasData(doc: MarketingStoragesCsvStoredV1 | null | undefined): boolean {
  return (doc?.rows?.length ?? 0) > 0 || (doc?.headers?.length ?? 0) > 0;
}
