import type { PlanFactCsvMonthlyRow } from "@/lib/marketingSalesPlanExecutionTable";
import type { PlanVsFactMonthlyRubPoint } from "@/lib/planExecutionPlanVsFactChart";
import { parseMarketingLeadsCsv } from "@/lib/parseMarketingLeadsCsv";

export const MARKETING_LEADS_CSV_STORAGE_KEY = "marketingLeadsCsv";

export type MarketingLeadsCsvStoredV1 = {
  v: 1;
  updatedAt: string;
  uploadedBy?: string;
  fileName: string;
  rawText?: string;
  adSpend: PlanFactCsvMonthlyRow[];
  leads: PlanFactCsvMonthlyRow[];
  deals: PlanFactCsvMonthlyRow[];
  warnings?: string[];
};

export type MarketingLeadsCsvChartBundle = {
  adSpend: PlanVsFactMonthlyRubPoint[];
  leads: PlanVsFactMonthlyRubPoint[];
  deals: PlanVsFactMonthlyRubPoint[];
};

function rowsToChartPoints(rows: PlanFactCsvMonthlyRow[]): PlanVsFactMonthlyRubPoint[] {
  return rows.map((r) => ({
    periodKey: r.periodKey,
    planRub: r.planRub,
    factRub: r.factRub,
  }));
}

export function marketingLeadsDocToChartBundle(
  doc: MarketingLeadsCsvStoredV1 | null | undefined,
): MarketingLeadsCsvChartBundle {
  if (!doc) {
    return { adSpend: [], leads: [], deals: [] };
  }
  return {
    adSpend: rowsToChartPoints(doc.adSpend ?? []),
    leads: rowsToChartPoints(doc.leads ?? []),
    deals: rowsToChartPoints(doc.deals ?? []),
  };
}

function parseMonthlyRows(raw: unknown): PlanFactCsvMonthlyRow[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanFactCsvMonthlyRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const periodKey = String(r.periodKey ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(periodKey)) continue;
    const planRub = Number(r.planRub);
    const factRub = Number(r.factRub);
    out.push({
      periodKey,
      planRub: Number.isFinite(planRub) ? planRub : 0,
      factRub: Number.isFinite(factRub) ? factRub : 0,
    });
  }
  return out;
}

export function parseStoredMarketingLeadsCsv(raw: unknown): MarketingLeadsCsvStoredV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;

  const adSpend = parseMonthlyRows(o.adSpend);
  const leads = parseMonthlyRows(o.leads);
  const deals = parseMonthlyRows(o.deals);
  if (adSpend.length === 0 && leads.length === 0 && deals.length === 0) return null;

  return {
    v: 1,
    updatedAt: String(o.updatedAt ?? ""),
    uploadedBy: typeof o.uploadedBy === "string" ? o.uploadedBy : undefined,
    fileName: String(o.fileName ?? "лиды.csv"),
    rawText: typeof o.rawText === "string" ? o.rawText : undefined,
    adSpend,
    leads,
    deals,
    warnings: Array.isArray(o.warnings) ? o.warnings.map(String) : undefined,
  };
}

export function marketingLeadsCsvDocIsValid(doc: MarketingLeadsCsvStoredV1): boolean {
  return doc.adSpend.length > 0 || doc.leads.length > 0 || doc.deals.length > 0;
}

export { parseMarketingLeadsCsv };
