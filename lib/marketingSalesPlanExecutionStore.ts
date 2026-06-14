import path from "path";

import type { SalesPlanExecutionDataset } from "@/lib/marketingSalesPlanExecutionTable";
import { marketingPaymentPlanProjectIdFromEnv } from "@/lib/marketingPaymentPlanStore";

/** Каталог CSV/JSON «Исполнение плана продаж» (общий для инстанса, как payment-plan). */
export const MARKETING_SALES_PLAN_EXECUTION_DIR = path.join(process.cwd(), "data", "marketing-sales-plan-execution");

export type MarketingSalesPlanExecutionMeta = {
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
};

export type MarketingSalesPlanExecutionDocV1 = {
  v: 1;
  projectId: string;
  updatedAt: string;
  meta: MarketingSalesPlanExecutionMeta;
  dataset: SalesPlanExecutionDataset;
  parseWarnings?: string[];
};

export function normalizeMarketingSalesPlanExecutionDoc(raw: unknown): MarketingSalesPlanExecutionDocV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  const dataset = o.dataset;
  if (!dataset || typeof dataset !== "object") return null;
  const ds = dataset as Record<string, unknown>;
  const summary = ds.summary;
  if (typeof ds.reportDateYmd !== "string" || !Array.isArray(ds.rows) || !summary || typeof summary !== "object") {
    return null;
  }
  const sm = summary as Record<string, unknown>;
  if (
    typeof sm.planCumulativeRub !== "number" ||
    typeof sm.factCumulativeRub !== "number" ||
    (sm.completionPct != null && typeof sm.completionPct !== "number") ||
    typeof sm.deviationRub !== "number"
  ) {
    return null;
  }
  const meta = o.meta as MarketingSalesPlanExecutionMeta | undefined;
  if (!meta || typeof meta.fileName !== "string" || typeof meta.uploadedAt !== "string" || typeof meta.uploadedBy !== "string") {
    return null;
  }
  return {
    v: 1,
    projectId: String(o.projectId ?? "default"),
    updatedAt: String(o.updatedAt ?? new Date().toISOString()),
    meta,
    dataset: dataset as SalesPlanExecutionDataset,
    parseWarnings: Array.isArray(o.parseWarnings) ? (o.parseWarnings as string[]) : undefined,
  };
}

export function sanitizeMarketingSalesPlanExecutionProjectId(id: string): string {
  const s = id.trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(s)) return "default";
  return s;
}

export function marketingSalesPlanExecutionProjectIdFromEnv(): string {
  return marketingPaymentPlanProjectIdFromEnv();
}

export function marketingSalesPlanExecutionJsonPath(projectId: string): string {
  return path.join(MARKETING_SALES_PLAN_EXECUTION_DIR, `${sanitizeMarketingSalesPlanExecutionProjectId(projectId)}.execution.json`);
}

export function marketingSalesPlanExecutionRawCsvPath(projectId: string): string {
  return path.join(MARKETING_SALES_PLAN_EXECUTION_DIR, `${sanitizeMarketingSalesPlanExecutionProjectId(projectId)}.raw.csv`);
}
