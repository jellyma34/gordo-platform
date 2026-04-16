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

/** Выручка по периоду (синхронно с salesFact по periodKey). */
export type SalesRevenueRow = {
  periodKey: string;
  label: string;
  revenueRub: number;
  objectId?: string;
  dealTypeId?: string;
};

/** Строка разреза drill-down по выбранному месяцу. */
export type DealDrilldownSegmentRow = {
  key: string;
  label: string;
  deals: number;
  revenueRub: number;
};

/** Детализация сделок по месяцу / кварталу (мок). */
export type DealsPeriodDrilldown = {
  apartmentTypes: DealDrilldownSegmentRow[];
  objects: DealDrilldownSegmentRow[];
  managers: DealDrilldownSegmentRow[];
  sources: DealDrilldownSegmentRow[];
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
  /** Фактическая выручка по тем же периодам, что и salesFact (для avgCheck = revenue / deals). */
  salesRevenue: {
    month: SalesRevenueRow[];
    quarter: SalesRevenueRow[];
  };
  /** Детализация по periodKey для блока «Сделки» (презентация). */
  dealsPeriodDrilldown: Record<string, DealsPeriodDrilldown>;
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
  salesRevenue: {
    month: [
      { periodKey: "2025-10", label: "окт. 2025", revenueRub: 188_000_000, objectId: "gordo-main" },
      { periodKey: "2025-11", label: "ноя. 2025", revenueRub: 249_600_000, objectId: "gordo-main" },
      { periodKey: "2025-12", label: "дек. 2025", revenueRub: 225_600_000, objectId: "gordo-main" },
      { periodKey: "2026-01", label: "янв. 2026", revenueRub: 147_000_000, objectId: "gordo-main" },
      { periodKey: "2026-02", label: "фев. 2026", revenueRub: 198_000_000, objectId: "gordo-main" },
      { periodKey: "2026-03", label: "мар. 2026", revenueRub: 169_200_000, objectId: "gordo-main" },
    ],
    quarter: [
      { periodKey: "2025-Q4", label: "Q4 2025", revenueRub: 663_200_000, objectId: "gordo-main" },
      { periodKey: "2026-Q1", label: "Q1 2026", revenueRub: 514_200_000, objectId: "gordo-main" },
      { periodKey: "2026-Q2", label: "Q2 2026", revenueRub: 456_000_000, objectId: "gordo-main" },
    ],
  },
  dealsPeriodDrilldown: {
    "2025-10": {
      apartmentTypes: [
        { key: "1k", label: "1-комн.", deals: 9, revenueRub: 40_500_000 },
        { key: "2k", label: "2-комн.", deals: 18, revenueRub: 90_000_000 },
        { key: "3k", label: "3-комн.", deals: 8, revenueRub: 44_000_000 },
        { key: "st", label: "Студии", deals: 5, revenueRub: 13_500_000 },
      ],
      objects: [
        { key: "gordo-main", label: "ЖК Гордо — основная", deals: 32, revenueRub: 150_400_000 },
        { key: "gordo-park", label: "ЖК Гордо — паркинг", deals: 8, revenueRub: 37_600_000 },
      ],
      managers: [
        { key: "m1", label: "Иванова А.", deals: 14, revenueRub: 65_800_000 },
        { key: "m2", label: "Петров С.", deals: 12, revenueRub: 56_400_000 },
        { key: "m3", label: "Сидорова М.", deals: 14, revenueRub: 65_800_000 },
      ],
      sources: [
        { key: "site", label: "Сайт", deals: 16, revenueRub: 75_200_000 },
        { key: "agency", label: "Агентства", deals: 11, revenueRub: 51_700_000 },
        { key: "partner", label: "Партнёры", deals: 13, revenueRub: 61_100_000 },
      ],
    },
    "2025-11": {
      apartmentTypes: [
        { key: "1k", label: "1-комн.", deals: 11, revenueRub: 49_500_000 },
        { key: "2k", label: "2-комн.", deals: 24, revenueRub: 120_000_000 },
        { key: "3k", label: "3-комн.", deals: 10, revenueRub: 55_000_000 },
        { key: "st", label: "Студии", deals: 7, revenueRub: 25_100_000 },
      ],
      objects: [
        { key: "gordo-main", label: "ЖК Гордо — основная", deals: 44, revenueRub: 211_200_000 },
        { key: "gordo-park", label: "ЖК Гордо — паркинг", deals: 8, revenueRub: 38_400_000 },
      ],
      managers: [
        { key: "m1", label: "Иванова А.", deals: 18, revenueRub: 86_400_000 },
        { key: "m2", label: "Петров С.", deals: 17, revenueRub: 81_600_000 },
        { key: "m3", label: "Сидорова М.", deals: 17, revenueRub: 81_600_000 },
      ],
      sources: [
        { key: "site", label: "Сайт", deals: 22, revenueRub: 105_600_000 },
        { key: "agency", label: "Агентства", deals: 15, revenueRub: 72_000_000 },
        { key: "call", label: "Звонок", deals: 15, revenueRub: 72_000_000 },
      ],
    },
    "2025-12": {
      apartmentTypes: [
        { key: "1k", label: "1-комн.", deals: 10, revenueRub: 45_000_000 },
        { key: "2k", label: "2-комн.", deals: 20, revenueRub: 100_000_000 },
        { key: "3k", label: "3-комн.", deals: 12, revenueRub: 66_000_000 },
        { key: "com", label: "Коммерция", deals: 6, revenueRub: 14_600_000 },
      ],
      objects: [
        { key: "gordo-main", label: "ЖК Гордо — основная", deals: 40, revenueRub: 192_000_000 },
        { key: "gordo-park", label: "ЖК Гордо — паркинг", deals: 8, revenueRub: 33_600_000 },
      ],
      managers: [
        { key: "m1", label: "Иванова А.", deals: 16, revenueRub: 76_800_000 },
        { key: "m2", label: "Петров С.", deals: 16, revenueRub: 76_800_000 },
        { key: "m3", label: "Сидорова М.", deals: 16, revenueRub: 72_000_000 },
      ],
      sources: [
        { key: "site", label: "Сайт", deals: 20, revenueRub: 96_000_000 },
        { key: "agency", label: "Агентства", deals: 14, revenueRub: 67_200_000 },
        { key: "partner", label: "Партнёры", deals: 14, revenueRub: 62_400_000 },
      ],
    },
    "2026-01": {
      apartmentTypes: [
        { key: "1k", label: "1-комн.", deals: 6, revenueRub: 27_000_000 },
        { key: "2k", label: "2-комн.", deals: 14, revenueRub: 70_000_000 },
        { key: "3k", label: "3-комн.", deals: 7, revenueRub: 38_500_000 },
        { key: "st", label: "Студии", deals: 3, revenueRub: 11_500_000 },
      ],
      objects: [
        { key: "gordo-main", label: "ЖК Гордо — основная", deals: 26, revenueRub: 124_800_000 },
        { key: "gordo-park", label: "ЖК Гордо — паркинг", deals: 4, revenueRub: 22_200_000 },
      ],
      managers: [
        { key: "m1", label: "Иванова А.", deals: 10, revenueRub: 48_000_000 },
        { key: "m2", label: "Петров С.", deals: 10, revenueRub: 48_000_000 },
        { key: "m3", label: "Сидорова М.", deals: 10, revenueRub: 51_000_000 },
      ],
      sources: [
        { key: "site", label: "Сайт", deals: 12, revenueRub: 57_600_000 },
        { key: "agency", label: "Агентства", deals: 10, revenueRub: 48_000_000 },
        { key: "call", label: "Звонок", deals: 8, revenueRub: 41_400_000 },
      ],
    },
    "2026-02": {
      apartmentTypes: [
        { key: "1k", label: "1-комн.", deals: 9, revenueRub: 40_500_000 },
        { key: "2k", label: "2-комн.", deals: 19, revenueRub: 95_000_000 },
        { key: "3k", label: "3-комн.", deals: 9, revenueRub: 49_500_000 },
        { key: "com", label: "Коммерция", deals: 4, revenueRub: 13_000_000 },
      ],
      objects: [
        { key: "gordo-main", label: "ЖК Гордо — основная", deals: 35, revenueRub: 168_000_000 },
        { key: "gordo-park", label: "ЖК Гордо — паркинг", deals: 6, revenueRub: 30_000_000 },
      ],
      managers: [
        { key: "m1", label: "Иванова А.", deals: 14, revenueRub: 67_200_000 },
        { key: "m2", label: "Петров С.", deals: 14, revenueRub: 67_200_000 },
        { key: "m3", label: "Сидорова М.", deals: 13, revenueRub: 63_600_000 },
      ],
      sources: [
        { key: "site", label: "Сайт", deals: 17, revenueRub: 81_600_000 },
        { key: "agency", label: "Агентства", deals: 12, revenueRub: 57_600_000 },
        { key: "partner", label: "Партнёры", deals: 12, revenueRub: 58_800_000 },
      ],
    },
    "2026-03": {
      apartmentTypes: [
        { key: "1k", label: "1-комн.", deals: 7, revenueRub: 31_500_000 },
        { key: "2k", label: "2-комн.", deals: 16, revenueRub: 80_000_000 },
        { key: "3k", label: "3-комн.", deals: 9, revenueRub: 49_500_000 },
        { key: "st", label: "Студии", deals: 4, revenueRub: 8_200_000 },
      ],
      objects: [
        { key: "gordo-main", label: "ЖК Гордо — основная", deals: 31, revenueRub: 148_800_000 },
        { key: "gordo-park", label: "ЖК Гордо — паркинг", deals: 5, revenueRub: 20_400_000 },
      ],
      managers: [
        { key: "m1", label: "Иванова А.", deals: 12, revenueRub: 57_600_000 },
        { key: "m2", label: "Петров С.", deals: 12, revenueRub: 57_600_000 },
        { key: "m3", label: "Сидорова М.", deals: 12, revenueRub: 54_000_000 },
      ],
      sources: [
        { key: "site", label: "Сайт", deals: 14, revenueRub: 67_200_000 },
        { key: "agency", label: "Агентства", deals: 11, revenueRub: 52_800_000 },
        { key: "call", label: "Звонок", deals: 11, revenueRub: 49_200_000 },
      ],
    },
    "2025-Q4": {
      apartmentTypes: [
        { key: "1k", label: "1-комн.", deals: 30, revenueRub: 135_000_000 },
        { key: "2k", label: "2-комн.", deals: 62, revenueRub: 310_000_000 },
        { key: "3k", label: "3-комн.", deals: 30, revenueRub: 165_000_000 },
        { key: "st", label: "Студии + прочее", deals: 18, revenueRub: 53_200_000 },
      ],
      objects: [
        { key: "gordo-main", label: "ЖК Гордо — основная", deals: 116, revenueRub: 553_600_000 },
        { key: "gordo-park", label: "ЖК Гордо — паркинг", deals: 24, revenueRub: 109_600_000 },
      ],
      managers: [
        { key: "m1", label: "Иванова А.", deals: 48, revenueRub: 230_400_000 },
        { key: "m2", label: "Петров С.", deals: 45, revenueRub: 216_000_000 },
        { key: "m3", label: "Сидорова М.", deals: 47, revenueRub: 216_800_000 },
      ],
      sources: [
        { key: "site", label: "Сайт", deals: 58, revenueRub: 276_800_000 },
        { key: "agency", label: "Агентства", deals: 40, revenueRub: 190_900_000 },
        { key: "partner", label: "Партнёры / звонки", deals: 42, revenueRub: 195_500_000 },
      ],
    },
    "2026-Q1": {
      apartmentTypes: [
        { key: "1k", label: "1-комн.", deals: 22, revenueRub: 99_000_000 },
        { key: "2k", label: "2-комн.", deals: 49, revenueRub: 245_000_000 },
        { key: "3k", label: "3-комн.", deals: 25, revenueRub: 137_500_000 },
        { key: "com", label: "Коммерция", deals: 11, revenueRub: 32_700_000 },
      ],
      objects: [
        { key: "gordo-main", label: "ЖК Гордо — основная", deals: 92, revenueRub: 441_600_000 },
        { key: "gordo-park", label: "ЖК Гордо — паркинг", deals: 15, revenueRub: 72_600_000 },
      ],
      managers: [
        { key: "m1", label: "Иванова А.", deals: 36, revenueRub: 172_800_000 },
        { key: "m2", label: "Петров С.", deals: 36, revenueRub: 172_800_000 },
        { key: "m3", label: "Сидорова М.", deals: 35, revenueRub: 168_600_000 },
      ],
      sources: [
        { key: "site", label: "Сайт", deals: 43, revenueRub: 206_400_000 },
        { key: "agency", label: "Агентства", deals: 33, revenueRub: 158_400_000 },
        { key: "call", label: "Звонок / партнёры", deals: 31, revenueRub: 149_400_000 },
      ],
    },
    "2026-Q2": {
      apartmentTypes: [
        { key: "1k", label: "1-комн.", deals: 28, revenueRub: 126_000_000 },
        { key: "2k", label: "2-комн.", deals: 40, revenueRub: 200_000_000 },
        { key: "3k", label: "3-комн.", deals: 18, revenueRub: 99_000_000 },
        { key: "com", label: "Коммерция", deals: 9, revenueRub: 31_000_000 },
      ],
      objects: [
        { key: "gordo-main", label: "ЖК Гордо — основная", deals: 78, revenueRub: 374_400_000 },
        { key: "gordo-park", label: "ЖК Гордо — паркинг", deals: 17, revenueRub: 81_600_000 },
      ],
      managers: [
        { key: "m1", label: "Иванова А.", deals: 32, revenueRub: 153_600_000 },
        { key: "m2", label: "Петров С.", deals: 32, revenueRub: 153_600_000 },
        { key: "m3", label: "Сидорова М.", deals: 31, revenueRub: 148_800_000 },
      ],
      sources: [
        { key: "site", label: "Сайт", deals: 38, revenueRub: 182_400_000 },
        { key: "agency", label: "Агентства", deals: 30, revenueRub: 144_000_000 },
        { key: "partner", label: "Партнёры", deals: 27, revenueRub: 129_600_000 },
      ],
    },
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
