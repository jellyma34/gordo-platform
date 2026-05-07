import path from "path";

import { PAYMENT_CSV_FACT_MAPPING_REQUIRED_RU, type MarketingPaymentZaydetColumnDebugRow, type MarketingPaymentZaydetMonthVerifyRow } from "@/lib/paymentScheduleCsv";

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

/** Актуальная версия: план и факт поступлений раздельно (факт только из явных колонок CSV). */
export type MarketingPaymentPlanFileV2 = {
  v: 2;
  projectId: string;
  updatedAt: string;
  planByPeriodKey: Record<string, number>;
  factByPeriodKey: Record<string, number> | null;
  factUnavailableReason: string | null;
  columnPeriodKeysPlan: string[];
  columnPeriodKeysFact: string[];
  /** Отладка по колонкам «зайдет» (сервер). */
  zaydetColumnDebug?: MarketingPaymentZaydetColumnDebugRow[];
  /** Помесячная сверка: сумма по CSV vs значение в графике. */
  zaydetMonthVerify?: MarketingPaymentZaydetMonthVerifyRow[];
  meta: MarketingPaymentPlanMeta;
};

/**
 * Ответ API и локальная модель: только v2.
 * При чтении v1 с диска выполняется нормализация в памяти.
 */
export type MarketingPaymentPlanFile = MarketingPaymentPlanFileV2;

function sortedPeriodKeys(record: Record<string, number>): string[] {
  return Object.keys(record)
    .filter((k) => /^\d{4}-\d{2}$/.test(k))
    .sort((a, b) => a.localeCompare(b));
}

/** Читает JSON с диска; v1 поднимается до v2 без факта (нужна перезагрузка CSV). */
export function normalizeMarketingPaymentPlanDoc(raw: unknown): MarketingPaymentPlanFileV2 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const meta = o.meta as MarketingPaymentPlanMeta | undefined;
  if (!meta || typeof meta !== "object") return null;

  if (o.v === 2 && o.planByPeriodKey && typeof o.planByPeriodKey === "object") {
    const plan = o.planByPeriodKey as Record<string, number>;
    const fact = o.factByPeriodKey;
    return {
      v: 2,
      projectId: String(o.projectId ?? "default"),
      updatedAt: String(o.updatedAt ?? new Date().toISOString()),
      planByPeriodKey: plan,
      factByPeriodKey:
        fact != null && typeof fact === "object" ? (fact as Record<string, number>) : null,
      factUnavailableReason:
        o.factUnavailableReason !== undefined
          ? (o.factUnavailableReason as string | null)
          : fact != null &&
              typeof fact === "object" &&
              Object.keys(fact as Record<string, number>).length > 0
            ? null
            : PAYMENT_CSV_FACT_MAPPING_REQUIRED_RU,
      columnPeriodKeysPlan: Array.isArray(o.columnPeriodKeysPlan)
        ? (o.columnPeriodKeysPlan as string[])
        : sortedPeriodKeys(plan),
      columnPeriodKeysFact: Array.isArray(o.columnPeriodKeysFact)
        ? (o.columnPeriodKeysFact as string[])
        : fact != null && typeof fact === "object"
          ? sortedPeriodKeys(fact as Record<string, number>)
          : [],
      zaydetColumnDebug: Array.isArray(o.zaydetColumnDebug)
        ? (o.zaydetColumnDebug as MarketingPaymentZaydetColumnDebugRow[])
        : [],
      zaydetMonthVerify: Array.isArray(o.zaydetMonthVerify)
        ? (o.zaydetMonthVerify as unknown[]).map((e) => {
            const r = e as Record<string, unknown>;
            return {
              month: String(r.month ?? ""),
              rawCsvSum: Number(r.rawCsvSum) || 0,
              displayedValue: Number(r.displayedValue) || 0,
              parsedCellCount:
                typeof r.parsedCellCount === "number" && Number.isFinite(r.parsedCellCount)
                  ? r.parsedCellCount
                  : 0,
            } satisfies MarketingPaymentZaydetMonthVerifyRow;
          })
        : [],
      meta,
    };
  }

  if (o.v === 1 && o.byPeriodKey && typeof o.byPeriodKey === "object") {
    const plan = o.byPeriodKey as Record<string, number>;
    return {
      v: 2,
      projectId: String(o.projectId ?? "default"),
      updatedAt: String(o.updatedAt ?? new Date().toISOString()),
      planByPeriodKey: plan,
      factByPeriodKey: null,
      factUnavailableReason: PAYMENT_CSV_FACT_MAPPING_REQUIRED_RU,
      columnPeriodKeysPlan: sortedPeriodKeys(plan),
      columnPeriodKeysFact: [],
      zaydetColumnDebug: [],
      zaydetMonthVerify: [],
      meta,
    };
  }

  return null;
}
