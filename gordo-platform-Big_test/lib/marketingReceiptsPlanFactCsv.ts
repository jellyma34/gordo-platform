import type { PlanFactCsvMonthlyRow } from "@/lib/marketingSalesPlanExecutionTable";
import type { PlanVsFactMonthlyRubPoint } from "@/lib/planExecutionPlanVsFactChart";
import { parseReceiptsPlanFactCsv } from "@/lib/parseReceiptsPlanFactCsv";

export const MARKETING_RECEIPTS_PLAN_FACT_CSV_STORAGE_KEY = "marketingReceiptsPlanFactCsv";

export type MarketingReceiptsPlanFactStoredV1 = {
  v: 1;
  updatedAt: string;
  uploadedBy?: string;
  fileName: string;
  rawText?: string;
  monthly: PlanFactCsvMonthlyRow[];
  warnings?: string[];
};

export function receiptsPlanFactDocToChartRows(
  doc: MarketingReceiptsPlanFactStoredV1 | null | undefined,
): PlanVsFactMonthlyRubPoint[] {
  if (!doc?.monthly?.length) return [];
  return doc.monthly.map((r) => ({
    periodKey: r.periodKey,
    planRub: r.planRub,
    factRub: r.factRub,
  }));
}

export function parseStoredMarketingReceiptsPlanFactCsv(raw: unknown): MarketingReceiptsPlanFactStoredV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || !Array.isArray(o.monthly)) return null;
  const monthly: PlanFactCsvMonthlyRow[] = [];
  for (const row of o.monthly) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const periodKey = String(r.periodKey ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(periodKey)) continue;
    const planRub = Number(r.planRub);
    const factRub = Number(r.factRub);
    monthly.push({
      periodKey,
      planRub: Number.isFinite(planRub) ? planRub : 0,
      factRub: Number.isFinite(factRub) ? factRub : 0,
    });
  }
  if (monthly.length === 0) return null;
  return {
    v: 1,
    updatedAt: String(o.updatedAt ?? ""),
    uploadedBy: typeof o.uploadedBy === "string" ? o.uploadedBy : undefined,
    fileName: String(o.fileName ?? "поступления_план_факт.csv"),
    rawText: typeof o.rawText === "string" ? o.rawText : undefined,
    monthly,
    warnings: Array.isArray(o.warnings) ? o.warnings.map(String) : undefined,
  };
}

export function receiptsPlanFactCsvDocIsValid(doc: MarketingReceiptsPlanFactStoredV1): boolean {
  return doc.monthly.length > 0;
}

export { parseReceiptsPlanFactCsv };
