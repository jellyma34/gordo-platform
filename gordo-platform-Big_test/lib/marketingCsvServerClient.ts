import type { MarketingImportKind } from "@/lib/marketingImportKinds";

export type MarketingStorageGetResponse = {
  ok: boolean;
  projectId?: string;
  presence?: Record<string, boolean>;
  datasets?: Record<string, unknown>;
  error?: string;
};

export async function fetchMarketingStorage(projectId: string): Promise<MarketingStorageGetResponse> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/marketing/storage`, {
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as MarketingStorageGetResponse | null;
  if (!res.ok || !j?.ok) {
    return { ok: false, error: typeof j?.error === "string" ? j.error : "Не удалось загрузить данные." };
  }
  return j;
}

export async function uploadMarketingImportFile(
  projectId: string,
  kind: MarketingImportKind | string,
  file: File,
  uploadedBy: string,
): Promise<{ ok: true; doc: unknown } | { ok: false; error: string; diagnostics?: unknown }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  fd.append("uploadedBy", uploadedBy);

  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/marketing/storage`, {
    method: "POST",
    body: fd,
  });
  const j = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    doc?: unknown;
    diagnostics?: unknown;
  } | null;

  if (!res.ok || !j?.ok || j.doc == null) {
    return {
      ok: false,
      error: typeof j?.error === "string" ? j.error : "Не удалось сохранить файл на сервере.",
      diagnostics: j?.diagnostics,
    };
  }
  return { ok: true, doc: j.doc };
}

export async function migrateMarketingImportDoc(
  projectId: string,
  kind: MarketingImportKind,
  doc: unknown,
  uploadedBy: string,
): Promise<{ ok: true; doc: unknown } | { ok: false; error: string }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/marketing/storage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, migrateFromBrowser: true, doc, uploadedBy }),
  });
  const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; doc?: unknown } | null;
  if (!res.ok || !j?.ok || j.doc == null) {
    return {
      ok: false,
      error: typeof j?.error === "string" ? j.error : "Не удалось перенести данные на сервер.",
    };
  }
  return { ok: true, doc: j.doc };
}

export async function deleteMarketingImport(
  projectId: string,
  kind: MarketingImportKind | string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/marketing/storage?kind=${encodeURIComponent(kind)}`,
    { method: "DELETE" },
  );
  const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !j?.ok) {
    return { ok: false, error: typeof j?.error === "string" ? j.error : "Не удалось удалить импорт." };
  }
  return { ok: true };
}

export async function fetchMarketingImportsList(projectId: string): Promise<{
  ok: boolean;
  imports?: Array<{ kind: string; updatedAt: string | null; uploadedBy: string | null; fileName: string | null; hasData: boolean }>;
  error?: string;
}> {
  const res = await fetch(`/api/marketing/imports?projectId=${encodeURIComponent(projectId)}`, {
    cache: "no-store",
  });
  const j = (await res.json().catch(() => null)) as {
    ok?: boolean;
    imports?: Array<{ kind: string; updatedAt: string | null; uploadedBy: string | null; fileName: string | null; hasData: boolean }>;
    error?: string;
  } | null;
  if (!res.ok || !j?.ok) {
    return { ok: false, error: typeof j?.error === "string" ? j.error : "Не удалось получить список импортов." };
  }
  return { ok: true, imports: j.imports ?? [] };
}
