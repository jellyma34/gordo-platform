import type { MarketingImportKind } from "@/lib/marketingImportKinds";
import { loadImport } from "@/lib/server/marketingStorage";
import {
  analyticsCsvExists,
  readAnalyticsCsvMeta,
  readAnalyticsCsvText,
} from "@/lib/server/analyticsCsvStorage";
import { buildMarketingDocFromCsv } from "@/lib/server/buildMarketingDocFromCsv";
import { analyticsCsvRegistryEntry } from "@/lib/analytics/analyticsCsvRegistry";

/**
 * Загружает dataset: приоритет PostgreSQL (marketing_imports),
 * fallback — `public/data/analytics/*.csv` (seed из git, не SoT).
 */
export async function loadMarketingDatasetDoc(
  kind: MarketingImportKind,
  projectId: string,
): Promise<unknown | null> {
  const fromDb = await loadImport(projectId, kind);
  if (fromDb != null) return fromDb;

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
    console.warn("[analytics] loadMarketingDatasetDoc parse failed:", kind, built.error);
  }

  return null;
}

export async function marketingDatasetHasPublicCsv(kind: MarketingImportKind): Promise<boolean> {
  return analyticsCsvExists(kind);
}

/** @deprecated legacy FS sync — no-op (SoT = PostgreSQL). */
export async function syncLegacyRawCsvToPublic(
  _kind: MarketingImportKind,
  _projectId: string,
): Promise<void> {
  /* no-op */
}
