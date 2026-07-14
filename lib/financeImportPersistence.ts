import { getGprProjectId } from "@/lib/gprImportPersistence";
import {
  cloneFinanceBudgetLines,
  normalizeFinanceBudgetRowLoose,
  type FinanceBudgetImportMeta,
  type FinanceBudgetLine,
  type FinanceBudgetSnapshot,
} from "@/lib/financeBudgetData";

export { getGprProjectId };

export const FINANCE_BUDGET_SAVED_EVENT = "gordo-finance-budget-saved";

export function financeBudgetStorageKey(projectId: string): string {
  return `finance_budget_${projectId}`;
}

function parseStoredSnapshot(raw: string): FinanceBudgetSnapshot | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;

    const body = data as Record<string, unknown>;
    const linesRaw = body.lines ?? body.items;
    if (!Array.isArray(linesRaw)) return null;

    const lines: FinanceBudgetLine[] = [];
    for (const item of linesRaw) {
      const n = normalizeFinanceBudgetRowLoose(item);
      if (n) lines.push(n);
    }

    if (lines.length === 0) return null;

    const importMeta =
      body.importMeta && typeof body.importMeta === "object"
        ? (body.importMeta as FinanceBudgetImportMeta)
        : undefined;

    return {
      lines,
      updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : undefined,
      importMeta,
    };
  } catch {
    return null;
  }
}

export function loadFinanceBudgetFromLocalStorage(projectId: string): FinanceBudgetSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(financeBudgetStorageKey(projectId));
    if (!raw) return null;
    return parseStoredSnapshot(raw);
  } catch {
    return null;
  }
}

export function saveFinanceBudgetToLocalStorage(
  projectId: string,
  snapshot: FinanceBudgetSnapshot,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(financeBudgetStorageKey(projectId), JSON.stringify(snapshot));
    window.dispatchEvent(new CustomEvent(FINANCE_BUDGET_SAVED_EVENT));
  } catch (e) {
    console.warn("[finance] Не удалось сохранить бюджет в localStorage:", e);
  }
}

export type FinanceBudgetImportApiPayload = {
  lines: FinanceBudgetLine[];
  updatedAt?: string;
  importMeta?: FinanceBudgetImportMeta;
};

export async function fetchFinanceBudgetImportFromApi(
  projectId: string,
): Promise<FinanceBudgetSnapshot | null> {
  try {
    const q = encodeURIComponent(projectId);
    const res = await fetch(`/api/finance/import?projectId=${q}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as FinanceBudgetImportApiPayload & { items?: FinanceBudgetLine[] };
    const lines = Array.isArray(body.lines) ? body.lines : Array.isArray(body.items) ? body.items : null;
    if (!lines || lines.length === 0) return null;
    return {
      lines: cloneFinanceBudgetLines(lines),
      updatedAt: body.updatedAt,
      importMeta: body.importMeta,
    };
  } catch {
    return null;
  }
}

export async function postFinanceBudgetImportToApi(
  projectId: string,
  snapshot: FinanceBudgetSnapshot,
): Promise<boolean> {
  try {
    const res = await fetch("/api/finance/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        lines: snapshot.lines,
        updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
        importMeta: snapshot.importMeta,
      } satisfies FinanceBudgetImportApiPayload & { projectId: string }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type BootstrapFinanceBudgetResult = {
  snapshot: FinanceBudgetSnapshot;
  bootstrapJson: string;
};

function emptySnapshot(): FinanceBudgetSnapshot {
  return { lines: [], updatedAt: undefined, importMeta: undefined };
}

/**
 * Цепочка при старте: localStorage → GET Next API (JSON snapshot) → пустой снимок.
 */
export async function loadPersistedFinanceBudget(
  projectId: string,
): Promise<BootstrapFinanceBudgetResult> {
  const ls = loadFinanceBudgetFromLocalStorage(projectId);
  if (ls && ls.lines.length > 0) {
    const snapshot = {
      lines: cloneFinanceBudgetLines(ls.lines),
      updatedAt: ls.updatedAt,
      importMeta: ls.importMeta,
    };
    return { snapshot, bootstrapJson: JSON.stringify(snapshot) };
  }

  const api = await fetchFinanceBudgetImportFromApi(projectId);
  if (api && api.lines.length > 0) {
    const snapshot = {
      lines: cloneFinanceBudgetLines(api.lines),
      updatedAt: api.updatedAt,
      importMeta: api.importMeta,
    };
    return { snapshot, bootstrapJson: JSON.stringify(snapshot) };
  }

  const snapshot = emptySnapshot();
  return { snapshot, bootstrapJson: JSON.stringify(snapshot) };
}

export async function persistFinanceBudgetSnapshot(
  projectId: string,
  snapshot: FinanceBudgetSnapshot,
): Promise<void> {
  const payload: FinanceBudgetSnapshot = {
    lines: cloneFinanceBudgetLines(snapshot.lines),
    updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
    importMeta: snapshot.importMeta,
  };
  saveFinanceBudgetToLocalStorage(projectId, payload);
  await postFinanceBudgetImportToApi(projectId, payload);
}
