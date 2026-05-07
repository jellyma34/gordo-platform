import type { GPRTask } from "@/lib/gprUtils";

/** Идентификатор проекта для ключей хранилища (переопределить через NEXT_PUBLIC_GPR_PROJECT_ID). */
export function getGprProjectId(): string {
  const v =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_GPR_PROJECT_ID != null
      ? String(process.env.NEXT_PUBLIC_GPR_PROJECT_ID).trim()
      : "";
  return v.length > 0 ? v : "default";
}

export function gprImportStorageKey(projectId: string): string {
  return `gpr_import_${projectId}`;
}

function parseStoredTasksJson(raw: string): GPRTask[] | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return null;
    const out: GPRTask[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      if (typeof o.code !== "string" || typeof o.name !== "string") continue;
      out.push(item as GPRTask);
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function loadGprTasksFromLocalStorage(projectId: string): GPRTask[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(gprImportStorageKey(projectId));
    if (!raw) return null;
    return parseStoredTasksJson(raw);
  } catch {
    return null;
  }
}

export function saveGprTasksToLocalStorage(projectId: string, tasks: GPRTask[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(gprImportStorageKey(projectId), JSON.stringify(tasks));
  } catch (e) {
    console.warn("[GPR] Не удалось сохранить в localStorage:", e);
  }
}

export type GprImportApiPayload = {
  tasks: GPRTask[];
  updatedAt?: string;
};

/** Серверный снимок (GET /api/gpr/import). */
export async function fetchGprImportFromApi(projectId: string): Promise<GPRTask[] | null> {
  try {
    const q = encodeURIComponent(projectId);
    const res = await fetch(`/api/gpr/import?projectId=${q}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as GprImportApiPayload | GPRTask[];
    if (Array.isArray(body)) {
      return body.length > 0 ? body : null;
    }
    if (body && Array.isArray(body.tasks) && body.tasks.length > 0) {
      return body.tasks as GPRTask[];
    }
    return null;
  } catch {
    return null;
  }
}

/** Полная выгрузка на сервер после импорта CSV / массовой замены. */
export async function postGprImportToApi(projectId: string, tasks: GPRTask[]): Promise<boolean> {
  try {
    const res = await fetch("/api/gpr/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        tasks,
        updatedAt: new Date().toISOString(),
      } satisfies GprImportApiPayload & { projectId: string }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type BootstrapGprTasksResult = {
  tasks: GPRTask[];
  /** Не запрашивать список GPR с основного API — уже есть офлайн/серверный снимок. */
  skipRemoteListFetch: boolean;
  /** Строка для дедупликации автосохранения в LS (canonical JSON). */
  bootstrapJson: string;
};

function cloneFallback(fallback: GPRTask[]): GPRTask[] {
  return fallback.map((t) => ({ ...t }));
}

/**
 * Цепочка при старте: GET MVP API → localStorage → переданный fallback (обычно mock).
 */
export async function loadPersistedGprTasks(
  projectId: string,
  fallback: GPRTask[],
): Promise<BootstrapGprTasksResult> {
  const apiTasks = await fetchGprImportFromApi(projectId);
  if (apiTasks && apiTasks.length > 0) {
    const tasks = cloneFallback(apiTasks);
    return {
      tasks,
      skipRemoteListFetch: true,
      bootstrapJson: JSON.stringify(tasks),
    };
  }

  const ls = loadGprTasksFromLocalStorage(projectId);
  if (ls && ls.length > 0) {
    const tasks = cloneFallback(ls);
    return {
      tasks,
      skipRemoteListFetch: true,
      bootstrapJson: JSON.stringify(tasks),
    };
  }

  const fb = cloneFallback(fallback);
  return {
    tasks: fb,
    skipRemoteListFetch: false,
    bootstrapJson: JSON.stringify(fb),
  };
}
