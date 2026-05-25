import { readFile } from "fs/promises";

import type { MarketingImportKind } from "@/lib/marketingImportKinds";
import { importPathsForKind, loadImport } from "@/lib/server/marketingStorage";
import {
  analyticsCsvExists,
  persistAnalyticsCsv,
  readAnalyticsCsvMeta,
  readAnalyticsCsvText,
} from "@/lib/server/analyticsCsvStorage";
import { buildMarketingDocFromCsv } from "@/lib/server/buildMarketingDocFromCsv";
import { analyticsCsvRegistryEntry } from "@/lib/analytics/analyticsCsvRegistry";

/** Однократно копирует legacy raw CSV из `data/projects/...` в `public/data/analytics/`. */
export async function syncLegacyRawCsvToPublic(kind: MarketingImportKind, projectId: string): Promise<void> {
  if (await analyticsCsvExists(kind)) return;
  const paths = importPathsForKind(projectId, kind);
  try {
    const text = (await readFile(paths.rawCsvPath, "utf-8")).trim();
    if (!text) return;
    let meta = { uploadedAt: new Date().toISOString(), uploadedBy: "legacy-sync", sourceFile: paths.rawCsvPath };
    try {
      const json = await loadImport<Record<string, unknown>>(projectId, kind);
      if (json && typeof json.updatedAt === "string") {
        meta = {
          uploadedAt: json.updatedAt,
          uploadedBy: typeof json.uploadedBy === "string" ? json.uploadedBy : meta.uploadedBy,
          sourceFile: typeof json.fileName === "string" ? json.fileName : analyticsCsvRegistryEntry(kind).fileName,
        };
      }
    } catch {
      /* ignore */
    }
    await persistAnalyticsCsv(kind, text, meta);
  } catch {
    /* no legacy file */
  }
}

/**
 * Загружает dataset: приоритет `public/data/analytics/*.csv` (git/deploy),
 * затем legacy JSON в `data/projects/...` (локальный cache).
 */
export async function loadMarketingDatasetDoc(
  kind: MarketingImportKind,
  projectId: string,
): Promise<unknown | null> {
  await syncLegacyRawCsvToPublic(kind, projectId);

  const csvText = await readAnalyticsCsvText(kind);
  if (csvText) {
    const meta = await readAnalyticsCsvMeta(kind);
    const entry = analyticsCsvRegistryEntry(kind);
    const built = await buildMarketingDocFromCsv(
      kind,
      csvText,
      {
        updatedAt: meta?.uploadedAt ?? new Date().toISOString(),
        uploadedBy: meta?.uploadedBy ?? "—",
        fileName: meta?.sourceFile ?? entry.fileName,
      },
      projectId,
    );
    if (built.ok) return built.doc;
  }

  return loadImport(projectId, kind);
}

export async function marketingDatasetHasPublicCsv(kind: MarketingImportKind): Promise<boolean> {
  return analyticsCsvExists(kind);
}
