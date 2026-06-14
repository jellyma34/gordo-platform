"use client";

import { ANALYTICS_CSV_KINDS, analyticsCsvRegistryEntry } from "@/lib/analytics/analyticsCsvRegistry";
import { fetchMarketingStorage } from "@/lib/marketingCsvServerClient";
import type { MarketingImportKind } from "@/lib/marketingImportKinds";

export type AnalyticsRegistryLoadResult = {
  statusFiles: Array<{ kind: MarketingImportKind; fileName: string; exists: boolean }>;
  loadedKinds: MarketingImportKind[];
  storageOk: boolean;
};

/** Startup: лог реестра CSV + наличие на сервере и в storage API. */
export async function loadAnalyticsRegistry(projectId: string): Promise<AnalyticsRegistryLoadResult> {
  console.log("Loading analytics CSV registry...");

  const statusFiles: AnalyticsRegistryLoadResult["statusFiles"] = [];
  try {
    const res = await fetch("/api/analytics/status", { cache: "no-store" });
    const j = (await res.json().catch(() => null)) as {
      ok?: boolean;
      files?: Array<{ kind: MarketingImportKind; fileName: string; exists: boolean }>;
    } | null;
    if (j?.ok && Array.isArray(j.files)) {
      for (const f of j.files) {
        statusFiles.push({
          kind: f.kind,
          fileName: f.fileName,
          exists: Boolean(f.exists),
        });
      }
    }
  } catch (e) {
    console.warn("[analytics] registry status fetch failed", e);
  }

  if (!statusFiles.length) {
    for (const kind of ANALYTICS_CSV_KINDS) {
      const entry = analyticsCsvRegistryEntry(kind);
      statusFiles.push({ kind, fileName: entry.fileName, exists: false });
    }
  }

  const storage = await fetchMarketingStorage(projectId);

  const files = statusFiles
    .filter((f) => f.exists)
    .map((f) => f.fileName);
  const loadedKinds = statusFiles.filter((f) => f.exists).map((f) => f.kind);

  console.log("Analytics CSV restored");
  console.log("Loaded analytics files:", files.length ? files : "(none on disk yet)");
  if (!storage.ok) {
    console.warn("[analytics] marketing storage fetch:", storage.error ?? "failed");
  }

  return { statusFiles, loadedKinds, storageOk: storage.ok };
}
