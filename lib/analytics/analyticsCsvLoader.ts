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

/** Единственный источник данных: `fetch('/data/analytics/<file>.csv')`. */
export async function loadAnalyticsCsv(kind: MarketingImportKind): Promise<LoadAnalyticsCsvResult | null> {
  const entry = analyticsCsvRegistryEntry(kind);
  const fetchPath = getAnalyticsCsvFetchPath(entry.publicUrl);
  console.log("Analytics CSV fetch:", fetchPath);

  try {
    const res = await fetch(fetchPath, { cache: "no-store" });
    if (!res.ok) {
      console.error("Analytics CSV failed:", fetchPath, `HTTP ${res.status} ${res.statusText}`);
      return null;
    }
    const text = await res.text();
    if (!text.trim()) {
      console.error("Analytics CSV failed:", fetchPath, "empty body");
      return null;
    }
    console.log("Analytics CSV loaded:", text.length);
    return { kind, text, entry, fetchPath };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("Analytics CSV failed:", fetchPath, err);
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
