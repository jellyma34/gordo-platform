"use client";

import { getAnalyticsCsvFetchPath } from "@/lib/analytics/analyticsCsvPath";
import { analyticsCsvRegistryEntry } from "@/lib/analytics/analyticsCsvRegistry";
import { loadAnalyticsCsv } from "@/lib/analytics/analyticsCsvLoader";
import type { MarketingImportKind } from "@/lib/marketingImportKinds";

export type HydrateMarketingDocFromPublicCsvResult<T> =
  | { ok: true; doc: T; source: "public_csv" }
  | { ok: false; reason: "missing" | "fetch_failed" | "parse_failed" | "invalid_doc"; error?: string };

/**
 * Production-first: загрузка CSV из static assets + парсинг через API.
 * Не использует localStorage / FileReader.
 */
export async function hydrateMarketingDocFromPublicCsv<T>(
  importKind: MarketingImportKind,
  validate: (doc: unknown) => doc is T,
  projectId: string,
): Promise<HydrateMarketingDocFromPublicCsvResult<T>> {
  const entry = analyticsCsvRegistryEntry(importKind);
  const fetchPath = getAnalyticsCsvFetchPath(entry.publicUrl);
  console.log("CSV fetch path:", fetchPath);

  const loaded = await loadAnalyticsCsv(importKind);
  if (!loaded?.text?.trim()) {
    console.warn("[analytics] CSV missing or empty:", fetchPath, importKind);
    return { ok: false, reason: "missing" };
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
      console.warn("[analytics] CSV parse API failed:", fetchPath, res.status, j?.error);
      return { ok: false, reason: "parse_failed", error: j?.error ?? `HTTP ${res.status}` };
    }

    if (!validate(j.doc)) {
      console.warn("[analytics] Parsed doc failed validation:", importKind);
      return { ok: false, reason: "invalid_doc" };
    }

    return { ok: true, doc: j.doc, source: "public_csv" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[analytics] CSV hydrate error:", fetchPath, msg);
    return { ok: false, reason: "fetch_failed", error: msg };
  }
}
