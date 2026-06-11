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

function seedFallback(): Tender[] {
  return mergeTenderSnapshotWithSeed(undefined);
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
