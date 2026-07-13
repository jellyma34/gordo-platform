import { getGprProjectId } from "@/lib/gprImportPersistence";
import {
  coerceTender,
  mergeTenderSnapshotWithSeed,
  readTenderSnapshotFromStorage,
  tendersStorageKey,
  writeTenderSnapshotToStorage,
  type Tender,
} from "@/lib/tenderData";

export { getGprProjectId };
export { tendersStorageKey };

function parseStoredTendersJson(raw: string): Tender[] | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return null;
    const out: Tender[] = [];
    for (const item of data) {
      if (typeof item !== "object" || item === null) continue;
      const n = coerceTender(item as Record<string, unknown>);
      if (n) out.push(n);
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function loadTendersFromLocalStorage(projectId: string): Tender[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(tendersStorageKey(projectId));
    if (raw) {
      const parsed = parseStoredTendersJson(raw);
      if (parsed && parsed.length > 0) return parsed;
    }
    const legacy = readTenderSnapshotFromStorage(projectId);
    if (legacy !== undefined) {
      const merged = mergeTenderSnapshotWithSeed(legacy);
      return merged.length > 0 ? merged : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveTendersToLocalStorage(projectId: string, tenders: Tender[]): void {
  writeTenderSnapshotToStorage(projectId, tenders);
}

export type TenderImportApiPayload = {
  tenders: Tender[];
  updatedAt?: string;
};

/** Серверный снимок (GET /api/tender/import). */
export async function fetchTenderImportFromApi(projectId: string): Promise<Tender[] | null> {
  try {
    const q = encodeURIComponent(projectId);
    const res = await fetch(`/api/tender/import?projectId=${q}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as TenderImportApiPayload | Tender[];
    if (Array.isArray(body)) {
      return body.length > 0 ? body : null;
    }
    if (body && Array.isArray(body.tenders) && body.tenders.length > 0) {
      return body.tenders;
    }
    return null;
  } catch {
    return null;
  }
}

/** Полная выгрузка на сервер после импорта CSV / сохранения. */
export async function postTenderImportToApi(projectId: string, tenders: Tender[]): Promise<boolean> {
  try {
    const res = await fetch("/api/tender/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        tenders,
        updatedAt: new Date().toISOString(),
      } satisfies TenderImportApiPayload & { projectId: string }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type BootstrapTenderItemsResult = {
  tenders: Tender[];
  bootstrapJson: string;
};

function cloneFallback(fallback: Tender[]): Tender[] {
  return fallback.map((t) => ({ ...t }));
}

function coerceTenderList(raw: unknown): Tender[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) =>
      typeof item === "object" && item !== null
        ? coerceTender(item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is Tender => item !== null);
}

function seedFallback(): Tender[] {
  return mergeTenderSnapshotWithSeed(undefined);
}

export type TenderAnalyticsSource = "localStorage" | "apiSnapshot" | "database" | "seed";

export type TenderAnalyticsLoadResult = {
  tenders: Tender[];
  source: TenderAnalyticsSource;
};

const tenderImportCountStorageKey = (projectId: string): string =>
  `gordo_tender_import_count_${projectId}`;

/** Запоминает размер последнего успешного импорта/сохранения реестра (для диагностики презентации). */
export function markTenderImportSnapshotCount(projectId: string, count: number): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(tenderImportCountStorageKey(projectId), String(count));
  } catch {
    /* ignore */
  }
}

export function readTenderImportSnapshotCount(projectId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(tenderImportCountStorageKey(projectId));
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Сохраняет полный снимок тендеров после импорта (localStorage + API JSON). */
export function persistTenderImportSnapshot(projectId: string, tenders: Tender[]): void {
  saveTendersToLocalStorage(projectId, tenders);
  markTenderImportSnapshotCount(projectId, tenders.length);
  void postTenderImportToApi(projectId, tenders);
}

/**
 * Источник для KPI/диаграмм презентации: полный Tender[] без mock/seed,
 * если есть снимок после импорта.
 */
export async function loadTenderRecordsForAnalytics(
  projectId: string,
  options?: { token?: string | null },
): Promise<TenderAnalyticsLoadResult> {
  const ls = loadTendersFromLocalStorage(projectId);
  if (ls && ls.length > 0) {
    return { tenders: cloneFallback(ls), source: "localStorage" };
  }

  const apiTenders = await fetchTenderImportFromApi(projectId);
  if (apiTenders && apiTenders.length > 0) {
    const coerced = coerceTenderList(apiTenders);
    if (coerced.length > 0) {
      return { tenders: cloneFallback(coerced), source: "apiSnapshot" };
    }
  }

  if (options?.token) {
    const { listTendersFromDb } = await import("@/lib/constructionApi");
    const dbRows = await listTendersFromDb(options.token);
    if (dbRows.length > 0) {
      return { tenders: dbRows, source: "database" };
    }
  }

  return { tenders: seedFallback(), source: "seed" };
}

/**
 * Цепочка при старте: localStorage → GET Next API (JSON snapshot) → seed (TENDER_DATA).
 */
export async function loadPersistedTenderItems(
  projectId: string,
  fallback?: Tender[],
): Promise<BootstrapTenderItemsResult> {
  const fb = cloneFallback(fallback ?? seedFallback());

  const ls = loadTendersFromLocalStorage(projectId);
  if (ls && ls.length > 0) {
    const tenders = cloneFallback(ls);
    return { tenders, bootstrapJson: JSON.stringify(tenders) };
  }

  const apiTenders = await fetchTenderImportFromApi(projectId);
  if (apiTenders && apiTenders.length > 0) {
    const tenders = cloneFallback(apiTenders);
    return { tenders, bootstrapJson: JSON.stringify(tenders) };
  }

  return { tenders: fb, bootstrapJson: JSON.stringify(fb) };
}
