/**
 * Marketing import persistence → FastAPI → PostgreSQL.
 * Filesystem больше не является Source of Truth.
 */
import type { MarketingImportKind } from "@/lib/marketingImportKinds";
import { MARKETING_IMPORT_KINDS } from "@/lib/marketingImportKinds";
import { analyticsCsvRegistryEntry } from "@/lib/analytics/analyticsCsvRegistry";
import { normalizeProjectId } from "@/lib/projectIds";
import { persistAnalyticsCsv, deleteAnalyticsCsv } from "@/lib/server/analyticsCsvStorage";

export type MarketingImportMeta = {
  kind: MarketingImportKind;
  updatedAt: string | null;
  uploadedBy: string | null;
  fileName: string | null;
  hasData: boolean;
};

function backendBaseUrl(): string {
  const raw =
    process.env.BACKEND_API_URL?.trim() ||
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://127.0.0.1:8000";
  return raw.replace(/\/$/, "");
}

function authHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const key = process.env.INTERNAL_API_KEY?.trim() || process.env.MARKETING_INTERNAL_API_KEY?.trim();
  if (key) headers["X-Internal-Key"] = key;
  return headers;
}

function safeProjectId(projectId: string): string {
  return normalizeProjectId(projectId);
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(`${backendBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...authHeaders(),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: text || res.statusText };
    }
    if (res.status === 204) {
      return { ok: true, data: null as T };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "network error" };
  }
}

type BackendImportRow = {
  projectId: string;
  kind: string;
  payload: unknown;
  rawCsv?: string | null;
  fileName?: string | null;
  uploadedBy?: string | null;
  updatedAt?: string | null;
};

type BackendMetaRow = {
  kind: string;
  updatedAt?: string | null;
  uploadedBy?: string | null;
  fileName?: string | null;
  hasData?: boolean;
};

export async function ensureMarketingProjectDir(projectId: string): Promise<string> {
  return safeProjectId(projectId);
}

export async function saveImport(
  projectId: string,
  kind: MarketingImportKind,
  doc: unknown,
  rawCsvText?: string | null,
): Promise<void> {
  const id = safeProjectId(projectId);
  const d = doc && typeof doc === "object" ? (doc as Record<string, unknown>) : {};
  const result = await apiJson<BackendImportRow>("/marketing/imports", {
    method: "PUT",
    body: JSON.stringify({
      projectId: id,
      kind,
      payload: doc,
      rawCsv: rawCsvText ?? null,
      fileName: typeof d.fileName === "string" ? d.fileName : null,
      uploadedBy: typeof d.uploadedBy === "string" ? d.uploadedBy : null,
    }),
  });
  if (!result.ok) {
    throw new Error(
      `Не удалось сохранить marketing import в PostgreSQL (${kind}): ${result.error || result.status}`,
    );
  }

  // Опциональный публичный analytics mirror (не SoT) — только если CSV передан.
  if (rawCsvText != null && rawCsvText.length > 0) {
    try {
      const entry = analyticsCsvRegistryEntry(kind);
      await persistAnalyticsCsv(kind, rawCsvText, {
        uploadedAt: typeof d.updatedAt === "string" ? d.updatedAt : new Date().toISOString(),
        uploadedBy: typeof d.uploadedBy === "string" ? d.uploadedBy : "—",
        sourceFile: typeof d.fileName === "string" ? d.fileName : entry.fileName,
      });
    } catch {
      /* analytics mirror optional */
    }
  }
}

export async function loadImport<T = unknown>(projectId: string, kind: MarketingImportKind): Promise<T | null> {
  const id = safeProjectId(projectId);
  const result = await apiJson<BackendImportRow>(
    `/marketing/imports/${encodeURIComponent(kind)}?projectId=${encodeURIComponent(id)}`,
  );
  if (!result.ok) {
    if (result.status === 404) return null;
    console.error("[marketingStorage] loadImport failed:", result.error);
    return null;
  }
  return (result.data.payload as T) ?? null;
}

export async function deleteImport(projectId: string, kind: MarketingImportKind): Promise<void> {
  const id = safeProjectId(projectId);
  const result = await apiJson<{ ok: boolean }>(
    `/marketing/imports/${encodeURIComponent(kind)}?projectId=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!result.ok) {
    throw new Error(`Не удалось удалить marketing import (${kind}): ${result.error}`);
  }
  try {
    await deleteAnalyticsCsv(kind);
  } catch {
    /* ignore */
  }
}

function metaFromDoc(kind: MarketingImportKind, doc: unknown): MarketingImportMeta {
  if (!doc || typeof doc !== "object") {
    return { kind, updatedAt: null, uploadedBy: null, fileName: null, hasData: false };
  }
  const d = doc as Record<string, unknown>;
  const updatedAt = typeof d.updatedAt === "string" ? d.updatedAt : null;
  const uploadedBy = typeof d.uploadedBy === "string" ? d.uploadedBy : null;
  const fileName = typeof d.fileName === "string" ? d.fileName : null;
  const rows = Array.isArray(d.rows) ? d.rows.length : 0;
  const monthly = Array.isArray(d.monthly) ? d.monthly.length : 0;
  const segments = Array.isArray(d.segments) ? d.segments.length : 0;
  const hasData = rows > 0 || monthly > 0 || segments > 0 || Boolean(fileName);
  return { kind, updatedAt, uploadedBy, fileName, hasData };
}

export async function listImports(projectId: string): Promise<MarketingImportMeta[]> {
  const id = safeProjectId(projectId);
  const result = await apiJson<BackendMetaRow[]>(
    `/marketing/imports?projectId=${encodeURIComponent(id)}`,
  );
  if (result.ok && Array.isArray(result.data)) {
    const byKind = new Map(result.data.map((r) => [r.kind, r]));
    return MARKETING_IMPORT_KINDS.map((kind) => {
      const row = byKind.get(kind);
      if (!row) return { kind, updatedAt: null, uploadedBy: null, fileName: null, hasData: false };
      return {
        kind,
        updatedAt: row.updatedAt ?? null,
        uploadedBy: row.uploadedBy ?? null,
        fileName: row.fileName ?? null,
        hasData: Boolean(row.hasData),
      };
    });
  }
  // Fallback: per-kind GET
  const out: MarketingImportMeta[] = [];
  for (const kind of MARKETING_IMPORT_KINDS) {
    const doc = await loadImport(id, kind);
    out.push(metaFromDoc(kind, doc));
  }
  return out;
}

/** @deprecated FS paths — оставлены для совместимости импортов; не использовать как SoT. */
export function importPathsForKind(projectId: string, kind: MarketingImportKind): {
  jsonPath: string;
  rawCsvPath: string;
} {
  const id = safeProjectId(projectId);
  return {
    jsonPath: `postgres://marketing_imports/${id}/${kind}.json`,
    rawCsvPath: `postgres://marketing_imports/${id}/${kind}.csv`,
  };
}
