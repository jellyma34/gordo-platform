import path from "path";

export const MARKETING_PAYMENT_PLAN_DIR = path.join(process.cwd(), "data", "marketing-payment-plan");

/** Текущий проект для общего графика платежей (не привязан к фильтру «объект» в UI). */
export function marketingPaymentPlanProjectIdFromEnv(): string {
  const id = process.env.NEXT_PUBLIC_MARKETING_PAYMENT_PLAN_PROJECT_ID?.trim();
  if (id && /^[a-zA-Z0-9_-]{1,64}$/.test(id)) return id;
  return "default";
}

export function sanitizeMarketingPaymentPlanProjectId(id: string): string {
  const s = id.trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(s)) return "default";
  return s;
}

export function marketingPaymentPlanJsonPath(projectId: string): string {
  return path.join(MARKETING_PAYMENT_PLAN_DIR, `${sanitizeMarketingPaymentPlanProjectId(projectId)}.json`);
}

export function marketingPaymentPlanRawCsvPath(projectId: string): string {
  return path.join(MARKETING_PAYMENT_PLAN_DIR, `${sanitizeMarketingPaymentPlanProjectId(projectId)}.raw.csv`);
}

export type MarketingPaymentPlanMeta = {
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
};

export type MarketingPaymentPlanFileV1 = {
  v: 1;
  projectId: string;
  updatedAt: string;
  byPeriodKey: Record<string, number>;
  meta: MarketingPaymentPlanMeta;
};
