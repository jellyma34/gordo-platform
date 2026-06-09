import { getGprProjectId } from "@/lib/gprImportPersistence";
import { mergeTmcSnapshotWithSeed, normalizeTmcRowLoose, type TMCItem } from "@/lib/tmcData";

export { getGprProjectId };

export function tmcImportStorageKey(projectId: string): string {
  return `tmc_${projectId}`;
}

function parseStoredItemsJson(raw: string): TMCItem[] | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return null;
    const out: TMCItem[] = [];
    for (const item of data) {
      const n = normalizeTmcRowLoose(item);
      if (n) out.push(n);
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function loadTmcItemsFromLocalStorage(projectId: string): TMCItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(tmcImportStorageKey(projectId));
    if (!raw) return null;
    return parseStoredItemsJson(raw);
  } catch {
    return null;
  }
}

export function saveTmcTasksToLocalStorage(projectId: string, items: TMCItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tmcImportStorageKey(projectId), JSON.stringify(items));
  } catch (e) {
    console.warn("[TMC] Не удалось сохранить в localStorage:", e);
  }
}

export type TmcImportApiPayload = {
  items: TMCItem[];
  updatedAt?: string;
};

/** Серверный снимок (GET /api/tmc/import). */
export async function fetchTmcImportFromApi(projectId: string): Promise<TMCItem[] | null> {
  try {
    const q = encodeURIComponent(projectId);
    const res = await fetch(`/api/tmc/import?projectId=${q}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as TmcImportApiPayload | TMCItem[];
    if (Array.isArray(body)) {
      return body.length > 0 ? body : null;
    }
    if (body && Array.isArray(body.items) && body.items.length > 0) {
      return body.items;
    }
    return null;
  } catch {
    return null;
  }
}

/** Полная выгрузка на сервер после импорта CSV / сохранения. */
export async function postTmcImportToApi(projectId: string, items: TMCItem[]): Promise<boolean> {
  try {
    const res = await fetch("/api/tmc/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        items,
        updatedAt: new Date().toISOString(),
      } satisfies TmcImportApiPayload & { projectId: string }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type BootstrapTmcItemsResult = {
  items: TMCItem[];
  bootstrapJson: string;
};

function cloneFallback(fallback: TMCItem[]): TMCItem[] {
  return fallback.map((t) => ({ ...t }));
}

function seedFallback(): TMCItem[] {
  return mergeTmcSnapshotWithSeed(undefined);
}

/**
 * Цепочка при старте: localStorage → GET Next API (JSON snapshot) → seed (TMC_DATA).
 */
export async function loadPersistedTmcItems(
  projectId: string,
  fallback?: TMCItem[],
): Promise<BootstrapTmcItemsResult> {
  const fb = cloneFallback(fallback ?? seedFallback());

  const ls = loadTmcItemsFromLocalStorage(projectId);
  if (ls && ls.length > 0) {
    const items = cloneFallback(ls);
    return { items, bootstrapJson: JSON.stringify(items) };
  }

  const apiItems = await fetchTmcImportFromApi(projectId);
  if (apiItems && apiItems.length > 0) {
    const items = cloneFallback(apiItems);
    return { items, bootstrapJson: JSON.stringify(items) };
  }

  return { items: fb, bootstrapJson: JSON.stringify(fb) };
}
