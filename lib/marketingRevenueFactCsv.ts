import {
  buildRevenueFactSummary,
  parseRevenueFactCsv,
  type ParseRevenueFactCsvOk,
  type RevenueFactRow,
  type RevenueFactSummary,
} from "@/lib/parseRevenueFactCsv";

export const MARKETING_REVENUE_FACT_CSV_STORAGE_KEY = "marketingRevenueFactCsv";

export type { RevenueFactRow, RevenueFactSummary };

/** Re-export для единого импорта (API, upload, UI). */
export {
  buildRevenueFactSummary,
  mapRevenueFactNameToSegment,
  parseRevenueFactAmountCell,
  parseRevenueFactCsv,
} from "@/lib/parseRevenueFactCsv";

export type MarketingRevenueFactCsvStoredV1 = {
  v: 1;
  updatedAt: string;
  uploadedBy?: string;
  fileName: string;
  rawText?: string;
  rows: RevenueFactRow[];
  summary: RevenueFactSummary;
  warnings?: string[];
};

export type MarketingRevenueFactCsvMetaV1 = {
  fileName: string;
  uploadedAt: string;
  uploadedBy?: string;
};

export function metaFromRevenueFactDoc(doc: MarketingRevenueFactCsvStoredV1): MarketingRevenueFactCsvMetaV1 {
  return {
    fileName: doc.fileName,
    uploadedAt: doc.updatedAt,
    uploadedBy: doc.uploadedBy,
  };
}

export function emptyRevenueFactSummary(): RevenueFactSummary {
  return buildRevenueFactSummary([]);
}

export function revenueFactCsvDocIsValid(doc: MarketingRevenueFactCsvStoredV1 | null | undefined): boolean {
  if (!doc) return false;
  const s = doc.summary;
  if (!s) return false;
  if (s.rowCount > 0) return true;
  return (
    s.bySegment.apartment > 0 ||
    s.bySegment.parking > 0 ||
    s.bySegment.storage > 0 ||
    s.bySegment.commercial > 0
  );
}

/** Пересборка summary из raw CSV (если менялся парсер). */
export function reconcileMarketingRevenueFactDoc(doc: MarketingRevenueFactCsvStoredV1): MarketingRevenueFactCsvStoredV1 {
  const raw = doc.rawText?.trim();
  if (!raw) return doc;
  try {
    const parsed = parseRevenueFactCsv(raw);
    if (!parsed.ok) return doc;
    return {
      ...doc,
      rows: parsed.rows,
      summary: parsed.summary,
      warnings: [...(doc.warnings ?? []), ...parsed.warnings],
    };
  } catch (e) {
    console.error("[marketingRevenueFactCsv] reconcile failed", e);
    return doc;
  }
}

function parseRows(raw: unknown): RevenueFactRow[] {
  if (!Array.isArray(raw)) return [];
  const out: RevenueFactRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = String(r.name ?? "").trim();
    const factRevenueRub = Number(r.factRevenueRub);
    const seg = r.segment;
    const segment =
      seg === "apartment" || seg === "parking" || seg === "storage" || seg === "commercial" ? seg : null;
    if (!name) continue;
    out.push({
      name,
      factRevenueRub: Number.isFinite(factRevenueRub) ? factRevenueRub : 0,
      segment,
    });
  }
  return out;
}

function parseSummary(raw: unknown, rows: RevenueFactRow[]): RevenueFactSummary {
  if (!raw || typeof raw !== "object") return buildRevenueFactSummary(rows);
  const s = raw as Record<string, unknown>;
  const by = s.bySegment;
  if (!by || typeof by !== "object") return buildRevenueFactSummary(rows);
  const b = by as Record<string, unknown>;
  const apartment = Number(b.apartment);
  const parking = Number(b.parking);
  const storage = Number(b.storage);
  const commercial = Number(b.commercial);
  const rowCount = Number(s.rowCount);
  const skippedCount = Number(s.skippedCount);
  const unmappedRub = Number(s.unmappedRub);
  return {
    rowCount: Number.isFinite(rowCount) ? rowCount : rows.filter((r) => r.segment != null && r.factRevenueRub > 0).length,
    skippedCount: Number.isFinite(skippedCount) ? skippedCount : 0,
    unmappedRub: Number.isFinite(unmappedRub) ? unmappedRub : 0,
    bySegment: {
      apartment: Number.isFinite(apartment) ? apartment : 0,
      parking: Number.isFinite(parking) ? parking : 0,
      storage: Number.isFinite(storage) ? storage : 0,
      commercial: Number.isFinite(commercial) ? commercial : 0,
    },
  };
}

export function parseStoredMarketingRevenueFactCsv(raw: unknown): MarketingRevenueFactCsvStoredV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  const fileName = String(o.fileName ?? "").trim();
  const updatedAt = String(o.updatedAt ?? "").trim();
  if (!fileName || !updatedAt) return null;
  const rows = parseRows(o.rows);
  const summary = parseSummary(o.summary, rows);
  return {
    v: 1,
    updatedAt,
    uploadedBy: typeof o.uploadedBy === "string" ? o.uploadedBy : undefined,
    fileName,
    rawText: typeof o.rawText === "string" ? o.rawText : undefined,
    rows,
    summary,
    warnings: Array.isArray(o.warnings) ? o.warnings.map(String) : undefined,
  };
}

export function buildMarketingRevenueFactDocFromParse(
  file: Pick<File, "name">,
  text: string,
  parsed: ParseRevenueFactCsvOk,
  uploadedBy: string,
): MarketingRevenueFactCsvStoredV1 {
  return {
    v: 1,
    updatedAt: new Date().toISOString(),
    uploadedBy,
    fileName: file.name?.trim() || "upload.csv",
    rawText: text,
    rows: parsed.rows,
    summary: parsed.summary,
    warnings: parsed.warnings,
  };
}
