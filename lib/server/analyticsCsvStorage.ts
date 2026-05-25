import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

import {
  ANALYTICS_CSV_REGISTRY,
  analyticsCsvMetaFileName,
  analyticsCsvRegistryEntry,
} from "@/lib/analytics/analyticsCsvRegistry";
import type { MarketingImportKind } from "@/lib/marketingImportKinds";

export type AnalyticsCsvMetaV1 = {
  v: 1;
  kind: MarketingImportKind;
  uploadedAt: string;
  uploadedBy: string;
  sourceFile: string;
  publicUrl: string;
};

export function analyticsCsvPublicDir(): string {
  return path.join(process.cwd(), "public", "data", "analytics");
}

export function analyticsCsvAbsolutePath(kind: MarketingImportKind): string {
  return path.join(analyticsCsvPublicDir(), ANALYTICS_CSV_REGISTRY[kind].fileName);
}

export function analyticsCsvMetaAbsolutePath(kind: MarketingImportKind): string {
  return path.join(analyticsCsvPublicDir(), analyticsCsvMetaFileName(kind));
}

export async function ensureAnalyticsCsvDir(): Promise<string> {
  const dir = analyticsCsvPublicDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function analyticsCsvExists(kind: MarketingImportKind): Promise<boolean> {
  try {
    await readFile(analyticsCsvAbsolutePath(kind), "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function readAnalyticsCsvText(kind: MarketingImportKind): Promise<string | null> {
  try {
    const text = await readFile(analyticsCsvAbsolutePath(kind), "utf-8");
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

export async function readAnalyticsCsvMeta(kind: MarketingImportKind): Promise<AnalyticsCsvMetaV1 | null> {
  try {
    const raw = await readFile(analyticsCsvMetaAbsolutePath(kind), "utf-8");
    const parsed = JSON.parse(raw) as AnalyticsCsvMetaV1;
    if (parsed?.v !== 1 || parsed.kind !== kind) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Сохраняет CSV в `public/data/analytics/` (git-tracked, deploy-safe). */
export async function persistAnalyticsCsv(
  kind: MarketingImportKind,
  csvText: string,
  meta: { uploadedAt: string; uploadedBy: string; sourceFile: string },
): Promise<AnalyticsCsvMetaV1> {
  await ensureAnalyticsCsvDir();
  const entry = analyticsCsvRegistryEntry(kind);
  await writeFile(analyticsCsvAbsolutePath(kind), csvText, "utf-8");
  const doc: AnalyticsCsvMetaV1 = {
    v: 1,
    kind,
    uploadedAt: meta.uploadedAt,
    uploadedBy: meta.uploadedBy,
    sourceFile: meta.sourceFile,
    publicUrl: entry.publicUrl,
  };
  await writeFile(analyticsCsvMetaAbsolutePath(kind), JSON.stringify(doc, null, 2), "utf-8");
  return doc;
}

export async function deleteAnalyticsCsv(kind: MarketingImportKind): Promise<void> {
  for (const p of [analyticsCsvAbsolutePath(kind), analyticsCsvMetaAbsolutePath(kind)]) {
    try {
      await unlink(p);
    } catch {
      /* ignore */
    }
  }
}
