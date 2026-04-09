/**
 * Mock-данные раздела «Маркетинг» (презентация).
 * Структура готова к замене на API: salesPlan / salesFact, installmentPlans / installmentFacts.
 */

export type MarketingObjectOption = { id: string; name: string };
export type MarketingDealTypeOption = { id: string; name: string };

/** План продаж по периоду (кол-во условных единиц / сделок). */
export type SalesPlanRow = {
  periodKey: string;
  label: string;
  units: number;
  deals: number;
  objectId?: string;
  dealTypeId?: string;
};

export type SalesFactRow = {
  periodKey: string;
  label: string;
  units: number;
  deals: number;
  /** Отставание от плана в календарных днях (если применимо). */
  lagDays?: number | null;
  objectId?: string;
  dealTypeId?: string;
};

export type SalesDynamicPoint = {
  date: string;
  deals: number;
  objectId?: string;
  dealTypeId?: string;
};

export type FunnelStageRow = {
  stage: "lead" | "call" | "meeting" | "deal";
  name: string;
  count: number;
};

/** План поступлений по рассрочке. */
export type InstallmentPlanRow = {
  periodKey: string;
  label: string;
  amount: number;
  objectId?: string;
};

export type InstallmentFactRow = {
  periodKey: string;
  label: string;
  amount: number;
  objectId?: string;
};

export type InstallmentOverdueRow = {
  id: string;
  contract: string;
  amount: number;
  daysLate: number;
  objectId?: string;
};

export type MarketingMockBundle = {
  objects: MarketingObjectOption[];
  dealTypes: MarketingDealTypeOption[];
  salesPlan: {
    month: SalesPlanRow[];
    quarter: SalesPlanRow[];
  };
  salesFact: {
    month: SalesFactRow[];
    quarter: SalesFactRow[];
  };
  salesDynamics: SalesDynamicPoint[];
  funnel: FunnelStageRow[];
  installment: {
    totalDduDeals: number;
    installmentDeals: number;
    installmentSharePct: number;
    plans: { month: InstallmentPlanRow[]; quarter: InstallmentPlanRow[] };
    facts: { month: InstallmentFactRow[]; quarter: InstallmentFactRow[] };
    overdue: {
      count: number;
      totalAmount: number;
      items: InstallmentOverdueRow[];
    };
  };
};

export const marketingMockData: MarketingMockBundle = {
  objects: [
    { id: "all", name: "Все объекты" },
    { id: "gordo-main", name: "ЖК Гордо — основная очередь" },
    { id: "gordo-park", name: "ЖК Гордо — паркинг" },
  ],
  dealTypes: [
    { id: "all", name: "Все типы" },
    { id: "primary", name: "Первичка" },
    { id: "tradein", name: "Trade-in" },
  ],
  salesPlan: {
    month: [
      { periodKey: "2025-10", label: "окт. 2025", units: 42, deals: 42, objectId: "gordo-main" },
      { periodKey: "2025-11", label: "ноя. 2025", units: 48, deals: 48, objectId: "gordo-main" },
      { periodKey: "2025-12", label: "дек. 2025", units: 55, deals: 55, objectId: "gordo-main" },
      { periodKey: "2026-01", label: "янв. 2026", units: 38, deals: 38, objectId: "gordo-main" },
      { periodKey: "2026-02", label: "фев. 2026", units: 44, deals: 44, objectId: "gordo-main" },
      { periodKey: "2026-03", label: "мар. 2026", units: 50, deals: 50, objectId: "gordo-main" },
    ],
    quarter: [
      { periodKey: "2025-Q4", label: "Q4 2025", units: 145, deals: 145, objectId: "gordo-main" },
      { periodKey: "2026-Q1", label: "Q1 2026", units: 132, deals: 132, objectId: "gordo-main" },
      { periodKey: "2026-Q2", label: "Q2 2026", units: 160, deals: 160, objectId: "gordo-main" },
    ],
  },
  salesFact: {
    month: [
      { periodKey: "2025-10", label: "окт. 2025", units: 40, deals: 40, lagDays: 5, objectId: "gordo-main" },
      { periodKey: "2025-11", label: "ноя. 2025", units: 52, deals: 52, lagDays: null, objectId: "gordo-main" },
      { periodKey: "2025-12", label: "дек. 2025", units: 48, deals: 48, lagDays: 12, objectId: "gordo-main" },
      { periodKey: "2026-01", label: "янв. 2026", units: 30, deals: 30, lagDays: 8, objectId: "gordo-main" },
      { periodKey: "2026-02", label: "фев. 2026", units: 41, deals: 41, lagDays: 3, objectId: "gordo-main" },
      { periodKey: "2026-03", label: "мар. 2026", units: 36, deals: 36, lagDays: 14, objectId: "gordo-main" },
    ],
    quarter: [
      { periodKey: "2025-Q4", label: "Q4 2025", units: 140, deals: 140, lagDays: 4, objectId: "gordo-main" },
      { periodKey: "2026-Q1", label: "Q1 2026", units: 107, deals: 107, lagDays: 10, objectId: "gordo-main" },
      { periodKey: "2026-Q2", label: "Q2 2026", units: 95, deals: 95, lagDays: 21, objectId: "gordo-main" },
    ],
  },
  salesDynamics: [
    { date: "2025-10-05", deals: 2 },
    { date: "2025-10-18", deals: 5 },
    { date: "2025-11-02", deals: 4 },
    { date: "2025-11-20", deals: 8 },
    { date: "2025-12-08", deals: 6 },
    { date: "2025-12-22", deals: 9 },
    { date: "2026-01-12", deals: 3 },
    { date: "2026-02-03", deals: 7 },
    { date: "2026-02-25", deals: 5 },
    { date: "2026-03-10", deals: 4 },
  ],
  funnel: [
    { stage: "lead", name: "Лид", count: 1280 },
    { stage: "call", name: "Звонок", count: 620 },
    { stage: "meeting", name: "Встреча", count: 210 },
    { stage: "deal", name: "Сделка", count: 58 },
  ],
  installment: {
    totalDduDeals: 186,
    installmentDeals: 52,
    installmentSharePct: 28,
    plans: {
      month: [
        { periodKey: "2025-11", label: "ноя. 2025", amount: 18_500_000 },
        { periodKey: "2025-12", label: "дек. 2025", amount: 22_000_000 },
        { periodKey: "2026-01", label: "янв. 2026", amount: 19_200_000 },
        { periodKey: "2026-02", label: "фев. 2026", amount: 21_000_000 },
        { periodKey: "2026-03", label: "мар. 2026", amount: 20_500_000 },
      ],
      quarter: [
        { periodKey: "2025-Q4", label: "Q4 2025", amount: 58_000_000 },
        { periodKey: "2026-Q1", label: "Q1 2026", amount: 60_700_000 },
        { periodKey: "2026-Q2", label: "Q2 2026", amount: 63_000_000 },
      ],
    },
    facts: {
      month: [
        { periodKey: "2025-11", label: "ноя. 2025", amount: 17_200_000 },
        { periodKey: "2025-12", label: "дек. 2025", amount: 21_400_000 },
        { periodKey: "2026-01", label: "янв. 2026", amount: 16_800_000 },
        { periodKey: "2026-02", label: "фев. 2026", amount: 18_900_000 },
        { periodKey: "2026-03", label: "мар. 2026", amount: 17_000_000 },
      ],
      quarter: [
        { periodKey: "2025-Q4", label: "Q4 2025", amount: 55_200_000 },
        { periodKey: "2026-Q1", label: "Q1 2026", amount: 52_700_000 },
        { periodKey: "2026-Q2", label: "Q2 2026", amount: 48_000_000 },
      ],
    },
    overdue: {
      count: 7,
      totalAmount: 4_250_000,
      items: [
        { id: "1", contract: "ДДУ-1042", amount: 620_000, daysLate: 12, objectId: "gordo-main" },
        { id: "2", contract: "ДДУ-1108", amount: 890_000, daysLate: 24, objectId: "gordo-main" },
        { id: "3", contract: "ДДУ-0981", amount: 410_000, daysLate: 6, objectId: "gordo-park" },
      ],
    },
  },
};

export function filterByObjectAndDealType<T extends { objectId?: string; dealTypeId?: string }>(
  rows: T[],
  objectId: string,
  dealTypeId: string,
): T[] {
  return rows.filter((r) => {
    const o = !objectId || objectId === "all" || !r.objectId || r.objectId === objectId;
    const d = !dealTypeId || dealTypeId === "all" || !r.dealTypeId || r.dealTypeId === dealTypeId;
    return o && d;
  });
}

/** Слияние план/факт по periodKey для диаграмм. */
export function mergeSalesPlanFact(
  plan: SalesPlanRow[],
  fact: SalesFactRow[],
): Array<{
  periodKey: string;
  label: string;
  plan: number;
  fact: number;
  planDeals: number;
  factDeals: number;
  lagDays: number | null | undefined;
}> {
  const map = new Map<string, { label: string; plan: number; fact: number; planDeals: number; factDeals: number; lagDays: number | null | undefined }>();
  for (const p of plan) {
    map.set(p.periodKey, {
      label: p.label,
      plan: p.units,
      fact: 0,
      planDeals: p.deals,
      factDeals: 0,
      lagDays: undefined,
    });
  }
  for (const f of fact) {
    const cur = map.get(f.periodKey);
    if (cur) {
      cur.fact = f.units;
      cur.factDeals = f.deals;
      cur.lagDays = f.lagDays ?? null;
    } else {
      map.set(f.periodKey, {
        label: f.label,
        plan: 0,
        fact: f.units,
        planDeals: 0,
        factDeals: f.deals,
        lagDays: f.lagDays ?? null,
      });
    }
  }
  return [...map.entries()]
    .map(([periodKey, v]) => ({ periodKey, ...v }))
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));
}

export function mergeInstallmentPlanFact(
  plans: InstallmentPlanRow[],
  facts: InstallmentFactRow[],
): Array<{ periodKey: string; label: string; plan: number; fact: number }> {
  const map = new Map<string, { label: string; plan: number; fact: number }>();
  for (const p of plans) {
    map.set(p.periodKey, { label: p.label, plan: p.amount, fact: 0 });
  }
  for (const f of facts) {
    const cur = map.get(f.periodKey);
    if (cur) cur.fact = f.amount;
    else map.set(f.periodKey, { label: f.label, plan: 0, fact: f.amount });
  }
  return [...map.entries()]
    .map(([periodKey, v]) => ({ periodKey, ...v }))
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey));
}
