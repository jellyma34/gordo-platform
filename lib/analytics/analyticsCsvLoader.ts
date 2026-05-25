import {
  ANALYTICS_CSV_KINDS,
  ANALYTICS_CSV_REGISTRY,
  analyticsCsvRegistryEntry,
  type AnalyticsCsvRegistryEntry,
} from "@/lib/analytics/analyticsCsvRegistry";
import type { MarketingImportKind } from "@/lib/marketingImportKinds";

export type LoadAnalyticsCsvResult = {
  kind: MarketingImportKind;
  text: string;
  entry: AnalyticsCsvRegistryEntry;
};

/** Клиентский loader: читает CSV из static assets `/data/analytics/*.csv`. */
export async function loadAnalyticsCsv(kind: MarketingImportKind): Promise<LoadAnalyticsCsvResult | null> {
  const entry = analyticsCsvRegistryEntry(kind);
  try {
    const res = await fetch(entry.publicUrl, { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    return { kind, text, entry };
  } catch {
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
