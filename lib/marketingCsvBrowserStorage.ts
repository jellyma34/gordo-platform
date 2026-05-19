import type { MarketingPaymentPlanFileV2 } from "@/lib/marketingPaymentPlanStore";
import { normalizeMarketingPaymentPlanDoc } from "@/lib/marketingPaymentPlanStore";
import type { MarketingSalesPlanExecutionDocV1 } from "@/lib/marketingSalesPlanExecutionStore";
import { normalizeMarketingSalesPlanExecutionDoc } from "@/lib/marketingSalesPlanExecutionStore";

export const MARKETING_PAYMENT_PLAN_STORAGE_KEY = "marketingPaymentPlan";
export const MARKETING_SALES_PLAN_EXECUTION_STORAGE_KEY = "marketingSalesPlanExecution";

function scopedKey(prefix: string, projectId: string): string {
  const safe = String(projectId || "default").trim().slice(0, 64) || "default";
  return `${prefix}:v1:${safe}`;
}

export function marketingPaymentPlanLocalStorageKey(projectId: string): string {
  return scopedKey(MARKETING_PAYMENT_PLAN_STORAGE_KEY, projectId);
}

export function marketingSalesPlanExecutionLocalStorageKey(projectId: string): string {
  return scopedKey(MARKETING_SALES_PLAN_EXECUTION_STORAGE_KEY, projectId);
}

export function readMarketingPaymentPlanFromLocalStorage(projectId: string): MarketingPaymentPlanFileV2 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(marketingPaymentPlanLocalStorageKey(projectId));
    if (!raw) return null;
    return normalizeMarketingPaymentPlanDoc(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** @deprecated Бизнес-данные только на сервере; запись отключена. */
export function writeMarketingPaymentPlanToLocalStorage(
  _projectId: string,
  _plan: MarketingPaymentPlanFileV2,
): void {
  /* no-op: server is source of truth */
}

export function clearMarketingPaymentPlanLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(marketingPaymentPlanLocalStorageKey(projectId));
  } catch {
    /* ignore */
  }
}

export function readMarketingSalesPlanExecutionFromLocalStorage(
  projectId: string,
): MarketingSalesPlanExecutionDocV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(marketingSalesPlanExecutionLocalStorageKey(projectId));
    if (!raw) return null;
    return normalizeMarketingSalesPlanExecutionDoc(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** @deprecated Бизнес-данные только на сервере; запись отключена. */
export function writeMarketingSalesPlanExecutionToLocalStorage(
  _projectId: string,
  _doc: MarketingSalesPlanExecutionDocV1,
): void {
  /* no-op */
}

export function clearMarketingSalesPlanExecutionLocalStorage(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(marketingSalesPlanExecutionLocalStorageKey(projectId));
  } catch {
    /* ignore */
  }
}

/** Только серверный снимок (localStorage не используется для отображения). */
export function mergeMarketingDataset<T>(
  server: T | null | undefined,
  _local: T | null | undefined,
  isValid: (doc: T) => boolean,
): T | null {
  if (server != null && isValid(server)) return server;
  return null;
}
