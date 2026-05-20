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
  costPerLead: PlanFactCsvMonthlyRow[];
  warnings?: string[];
};

export type MarketingLeadsCsvChartBundle = {
  /** Уникальные YYYY-MM из CSV (все секции), без автодобавления месяцев. */
  monthKeys: string[];
  adSpend: PlanVsFactMonthlyRubPoint[];
  leads: PlanVsFactMonthlyRubPoint[];
  /** Секция «Стоимость лида» из CSV (не расчёт расходы/лиды). */
  costPerLead: PlanVsFactMonthlyRubPoint[];
};

function collectSortedMonthKeys(...series: readonly PlanVsFactMonthlyRubPoint[][]): string[] {
  const keys = new Set<string>();
  for (const rows of series) {
    for (const r of rows) {
      if (/^\d{4}-\d{2}$/.test(r.periodKey)) keys.add(r.periodKey);
    }
  }
  return [...keys].sort((a, b) => a.localeCompare(b));
}

function rowsToChartPoints(rows: PlanFactCsvMonthlyRow[]): PlanVsFactMonthlyRubPoint[] {
  return rows.map((r) => ({
    periodKey: r.periodKey,
    planRub: r.planRub,
    factRub: r.factRub,
  }));
}

/** Пересобрать месяцы из raw CSV (исправляет устаревшие periodKey в JSON). */
export function reconcileMarketingLeadsDoc(doc: MarketingLeadsCsvStoredV1): MarketingLeadsCsvStoredV1 {
  const raw = doc.rawText?.trim();
  if (!raw) return doc;
  const parsed = parseMarketingLeadsCsv(raw);
  if (!parsed.ok) return doc;
  return {
    ...doc,
    adSpend: parsed.tables.adSpend,
    leads: parsed.tables.leads,
    costPerLead: parsed.tables.costPerLead,
    warnings: [...(doc.warnings ?? []), ...parsed.warnings],
  };
}

export function marketingLeadsDocToChartBundle(
  doc: MarketingLeadsCsvStoredV1 | null | undefined,
): MarketingLeadsCsvChartBundle {
  if (!doc) {
    return { monthKeys: [], adSpend: [], leads: [], costPerLead: [] };
  }
  const reconciled = reconcileMarketingLeadsDoc(doc);
  const adSpend = rowsToChartPoints(reconciled.adSpend ?? []);
  const leads = rowsToChartPoints(reconciled.leads ?? []);
  const costPerLead = rowsToChartPoints(reconciled.costPerLead ?? []);
  const monthKeys = collectSortedMonthKeys(adSpend, leads, costPerLead);
  return {
    monthKeys,
    adSpend,
    leads,
    costPerLead,
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
  const costPerLead = parseMonthlyRows(o.costPerLead);
  if (adSpend.length === 0 && leads.length === 0 && costPerLead.length === 0) return null;

  return {
    v: 1,
    updatedAt: String(o.updatedAt ?? ""),
    uploadedBy: typeof o.uploadedBy === "string" ? o.uploadedBy : undefined,
    fileName: String(o.fileName ?? "лиды.csv"),
    rawText: typeof o.rawText === "string" ? o.rawText : undefined,
    adSpend,
    leads,
    costPerLead,
    warnings: Array.isArray(o.warnings) ? o.warnings.map(String) : undefined,
  };
}

export function marketingLeadsCsvDocIsValid(doc: MarketingLeadsCsvStoredV1): boolean {
  return doc.adSpend.length > 0 || doc.leads.length > 0 || doc.costPerLead.length > 0;
}

export { parseMarketingLeadsCsv };
