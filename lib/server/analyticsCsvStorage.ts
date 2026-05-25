import { existsSync } from "fs";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

import { getAnalyticsCsvFetchPath, getAnalyticsServerOrigin } from "@/lib/analytics/analyticsCsvPath";
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

let resolvedPublicDir: string | null = null;

/** Директория CSV: учитывает `next start`, custom server и standalone layout. */
export function resolveAnalyticsCsvPublicDir(): string {
  if (resolvedPublicDir && existsSync(resolvedPublicDir)) {
    return resolvedPublicDir;
  }
  const candidates = [
    path.join(process.cwd(), "public", "data", "analytics"),
    path.join(process.cwd(), "..", "public", "data", "analytics"),
    path.join(process.cwd(), "..", "..", "public", "data", "analytics"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) {
      resolvedPublicDir = dir;
      return dir;
    }
  }
  resolvedPublicDir = candidates[0];
  return resolvedPublicDir;
}

export function analyticsCsvAbsolutePath(kind: MarketingImportKind): string {
  return path.join(resolveAnalyticsCsvPublicDir(), ANALYTICS_CSV_REGISTRY[kind].fileName);
}

export function analyticsCsvMetaAbsolutePath(kind: MarketingImportKind): string {
  return path.join(resolveAnalyticsCsvPublicDir(), analyticsCsvMetaFileName(kind));
}

export async function ensureAnalyticsCsvDir(): Promise<string> {
  const dir = resolveAnalyticsCsvPublicDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

async function readAnalyticsCsvFromFs(kind: MarketingImportKind): Promise<string | null> {
  try {
    const text = await readFile(analyticsCsvAbsolutePath(kind), "utf-8");
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

/** HTTP fallback: static asset через тот же origin (Railway production). */
async function readAnalyticsCsvViaHttp(kind: MarketingImportKind): Promise<string | null> {
  const entry = analyticsCsvRegistryEntry(kind);
  const fetchPath = getAnalyticsCsvFetchPath(entry.publicUrl);
  const origin = getAnalyticsServerOrigin();
  const url = `${origin}${fetchPath}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.warn("[analytics] server HTTP CSV fetch failed:", url, res.status);
      return null;
    }
    const text = await res.text();
    return text.trim() ? text : null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[analytics] server HTTP CSV fetch error:", url, msg);
    return null;
  }
}

export async function analyticsCsvExists(kind: MarketingImportKind): Promise<boolean> {
  if (existsSync(analyticsCsvAbsolutePath(kind))) return true;
  const http = await readAnalyticsCsvViaHttp(kind);
  return Boolean(http);
}

export async function readAnalyticsCsvText(kind: MarketingImportKind): Promise<string | null> {
  const fromFs = await readAnalyticsCsvFromFs(kind);
  if (fromFs) return fromFs;
  return readAnalyticsCsvViaHttp(kind);
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
