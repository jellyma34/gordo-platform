"use client";

import { getAnalyticsCsvFetchPath } from "@/lib/analytics/analyticsCsvPath";
import { analyticsCsvRegistryEntry } from "@/lib/analytics/analyticsCsvRegistry";
import { loadAnalyticsCsv } from "@/lib/analytics/analyticsCsvLoader";
import type { MarketingImportKind } from "@/lib/marketingImportKinds";

export type HydrateMarketingDocFromPublicCsvResult<T> =
  | { ok: true; doc: T; source: "public_csv"; fetchPath: string }
  | { ok: false; reason: "missing" | "fetch_failed" | "parse_failed" | "invalid_doc"; error?: string; fetchPath: string };

/**
 * Production-only: static CSV из `public/data/analytics/` + parse API.
 * Без localStorage, FileReader, blob URL, runtime upload cache.
 */
export async function hydrateMarketingDocFromPublicCsv<T>(
  importKind: MarketingImportKind,
  validate: (doc: unknown) => doc is T,
  projectId: string,
): Promise<HydrateMarketingDocFromPublicCsvResult<T>> {
  const entry = analyticsCsvRegistryEntry(importKind);
  const fetchPath = getAnalyticsCsvFetchPath(entry.publicUrl);

  const loaded = await loadAnalyticsCsv(importKind);
  if (!loaded?.text?.trim()) {
    return { ok: false, reason: "missing", fetchPath };
  }

  try {
    const res = await fetch("/api/analytics/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: importKind,
        text: loaded.text,
        fileName: entry.fileName,
        projectId,
      }),
      cache: "no-store",
    });
    const j = (await res.json().catch(() => null)) as {
      ok?: boolean;
      doc?: unknown;
      error?: string;
    } | null;

    if (!res.ok || !j?.ok) {
      console.error("Analytics CSV failed:", fetchPath, j?.error ?? `HTTP ${res.status}`);
      return {
        ok: false,
        reason: "parse_failed",
        error: j?.error ?? `HTTP ${res.status}`,
        fetchPath,
      };
    }

    if (!validate(j.doc)) {
      console.error("Analytics CSV failed:", fetchPath, "invalid_doc after parse");
      return { ok: false, reason: "invalid_doc", fetchPath };
    }

    return { ok: true, doc: j.doc, source: "public_csv", fetchPath };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("Analytics CSV failed:", fetchPath, err);
    return { ok: false, reason: "fetch_failed", error: err.message, fetchPath };
  }
}

/** Упрощённый helper: doc или null. */
export async function loadMarketingDocFromPublicCsv<T>(
  importKind: MarketingImportKind,
  validate: (doc: unknown) => doc is T,
  projectId: string,
): Promise<T | null> {
  const r = await hydrateMarketingDocFromPublicCsv(importKind, validate, projectId);
  return r.ok ? r.doc : null;
}
