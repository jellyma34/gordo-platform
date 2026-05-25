import {
  ANALYTICS_CSV_KINDS,
  ANALYTICS_CSV_REGISTRY,
  analyticsCsvRegistryEntry,
  type AnalyticsCsvRegistryEntry,
} from "@/lib/analytics/analyticsCsvRegistry";
import { getAnalyticsCsvFetchPath } from "@/lib/analytics/analyticsCsvPath";
import type { MarketingImportKind } from "@/lib/marketingImportKinds";

export type LoadAnalyticsCsvResult = {
  kind: MarketingImportKind;
  text: string;
  entry: AnalyticsCsvRegistryEntry;
  fetchPath: string;
};

/** Клиентский loader: `fetch('/data/analytics/*.csv')` — static build assets. */
export async function loadAnalyticsCsv(kind: MarketingImportKind): Promise<LoadAnalyticsCsvResult | null> {
  const entry = analyticsCsvRegistryEntry(kind);
  const fetchPath = getAnalyticsCsvFetchPath(entry.publicUrl);
  console.log("CSV fetch path:", fetchPath);

  try {
    const res = await fetch(fetchPath, { cache: "no-store" });
    if (!res.ok) {
      console.warn("[analytics] CSV fetch failed:", fetchPath, "status:", res.status, res.statusText);
      return null;
    }
    const text = await res.text();
    if (!text.trim()) {
      console.warn("[analytics] CSV empty:", fetchPath);
      return null;
    }
    return { kind, text, entry, fetchPath };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[analytics] CSV fetch error:", fetchPath, msg);
    return null;
  }
}

export async function loadAllAnalyticsCsv(): Promise<Partial<Record<MarketingImportKind, LoadAnalyticsCsvResult>>> {
  const pairs = await Promise.all(
    ANALYTICS_CSV_KINDS.map(async (kind) => {
      const loaded = await loadAnalyticsCsv(kind);
      return [kind, loaded] as const;
    }),
  );
  const out: Partial<Record<MarketingImportKind, LoadAnalyticsCsvResult>> = {};
  for (const [kind, loaded] of pairs) {
    if (loaded) out[kind] = loaded;
  }
  return out;
}

export { ANALYTICS_CSV_REGISTRY, ANALYTICS_CSV_KINDS };
