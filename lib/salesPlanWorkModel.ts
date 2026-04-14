import { marketingSalesReportMock } from "@/lib/marketingSalesReportData";

/** Сегменты плана (как в PDF / отчёте). */
export const SALES_PLAN_CATEGORY_IDS = [
  "1k",
  "2k",
  "3k",
  "4k_plus",
  "parking",
  "storage",
  "commercial",
] as const;

export type SalesPlanCategoryId = (typeof SALES_PLAN_CATEGORY_IDS)[number];

export type SalesPlanScenarioId = "base" | "updated" | "forecast";

export type SalesPlanMetricKind = "units" | "revenue" | "avgPrice";

/** Храним только вводимые поля; накопленный факт и дельты считаются. */
export type SalesPlanCategoryValues = {
  planMonth: number;
  factMonth: number;
  planCumulative: number;
};

export type SalesPlanWorkGrid = Record<
  SalesPlanScenarioId,
  Record<SalesPlanMetricKind, Record<SalesPlanCategoryId, SalesPlanCategoryValues>>
>;

export type SalesPlanHistoryField = "planMonth" | "factMonth" | "planCumulative";

export type SalesPlanHistoryEntry = {
  id: string;
  at: string;
  userLabel: string;
  scenario: SalesPlanScenarioId;
  metric: SalesPlanMetricKind;
  categoryId: SalesPlanCategoryId;
  field: SalesPlanHistoryField;
  oldValue: number;
  newValue: number;
};

export const SALES_PLAN_WORK_STORAGE_KEY = "gordo-sales-plan-work-v2";

export const SALES_PLAN_CATEGORY_LABELS: Record<SalesPlanCategoryId, string> = {
  "1k": "1-к",
  "2k": "2-к",
  "3k": "3-к",
  "4k_plus": "4-к+",
  parking: "Паркинг",
  storage: "Кладовые",
  commercial: "Коммерция",
};

export const SALES_PLAN_SCENARIO_LABELS: Record<SalesPlanScenarioId, string> = {
  base: "База",
  updated: "Обновлённый",
  forecast: "Прогноз",
};

export const SALES_PLAN_METRIC_LABELS: Record<SalesPlanMetricKind, string> = {
  units: "Шт.",
  revenue: "Выручка",
  avgPrice: "Средняя цена",
};

export function deriveSalesPlanRow(v: SalesPlanCategoryValues) {
  const deltaMonth = v.factMonth - v.planMonth;
  const factCumulative = v.planCumulative + deltaMonth;
  const deltaCumulative = factCumulative - v.planCumulative;
  const performancePct = v.planCumulative !== 0 ? (factCumulative / v.planCumulative) * 100 : null;
  return { deltaMonth, factCumulative, deltaCumulative, performancePct };
}

function cloneGrid(grid: SalesPlanWorkGrid): SalesPlanWorkGrid {
  const scenarios: SalesPlanScenarioId[] = ["base", "updated", "forecast"];
  const metrics: SalesPlanMetricKind[] = ["units", "revenue", "avgPrice"];
  const next = {} as SalesPlanWorkGrid;
  for (const s of scenarios) {
    next[s] = { units: {} as any, revenue: {} as any, avgPrice: {} as any };
    for (const m of metrics) {
      for (const c of SALES_PLAN_CATEGORY_IDS) {
        const src = grid[s][m][c];
        next[s][m][c] = { planMonth: src.planMonth, factMonth: src.factMonth, planCumulative: src.planCumulative };
      }
    }
  }
  return next;
}

/** Начальное заполнение: пример из PDF (2k, parking) + выручка из mock radar, шт. — согласованно с формулой накопленного факта. */
export function buildDefaultSalesPlanWorkGrid(): SalesPlanWorkGrid {
  const radar = marketingSalesReportMock.radarCategories;
  const byAxis = Object.fromEntries(radar.map((r) => [r.axisLabel, r])) as Record<string, (typeof radar)[number]>;

  const rev = (axis: string) => {
    const row = byAxis[axis];
    if (!row) return { pc: 0, fc: 0 };
    return { pc: row.planCumulative, fc: row.factCumulative };
  };

  const r1 = rev("1-к");
  const r2 = rev("2-к");
  const r3 = rev("3-к");
  const rp = rev("Парк.");
  const rs = rev("Клад.");
  const rc = rev("Комм.");

  const monthlyPlanTotal = marketingSalesReportMock.salesData.revenue.planMonth;

  const revenuePlanMonth = (planCum: number, totalCum: number) =>
    totalCum > 0 ? Math.round((monthlyPlanTotal * planCum) / totalCum) : 0;

  const totalRevPlanCum =
    r1.pc + r2.pc + r3.pc + rp.pc + rs.pc + rc.pc + 95_000_000; /* 4к+ оценка */

  const revenueRow = (planCum: number, factCum: number): SalesPlanCategoryValues => {
    const planMonth = revenuePlanMonth(planCum, totalRevPlanCum);
    const factMonth = factCum - planCum + planMonth;
    return { planMonth, factMonth, planCumulative: planCum };
  };

  const unitsBase: Record<SalesPlanCategoryId, SalesPlanCategoryValues> = {
    "1k": { planMonth: 4, factMonth: 5, planCumulative: 18 },
    "2k": { planMonth: 1, factMonth: 3, planCumulative: 9 },
    "3k": { planMonth: 2, factMonth: 2, planCumulative: 14 },
    "4k_plus": { planMonth: 3, factMonth: 2, planCumulative: 20 },
    parking: { planMonth: 1, factMonth: 0, planCumulative: 5 },
    storage: { planMonth: 1, factMonth: 1, planCumulative: 6 },
    commercial: { planMonth: 2, factMonth: 1, planCumulative: 8 },
  };

  const revenueBase: Record<SalesPlanCategoryId, SalesPlanCategoryValues> = {
    "1k": revenueRow(r1.pc, r1.fc),
    "2k": revenueRow(r2.pc, r2.fc),
    "3k": revenueRow(r3.pc, r3.fc),
    "4k_plus": revenueRow(95_000_000, 88_000_000),
    parking: revenueRow(rp.pc, rp.fc),
    storage: revenueRow(rs.pc, rs.fc),
    commercial: revenueRow(rc.pc, rc.fc),
  };

  const avgBase: Record<SalesPlanCategoryId, SalesPlanCategoryValues> = {} as any;
  for (const c of SALES_PLAN_CATEGORY_IDS) {
    const u = unitsBase[c];
    const rv = revenueBase[c];
    const dU = deriveSalesPlanRow(u);
    const dR = deriveSalesPlanRow(rv);
    const cumAvg = dU.factCumulative > 0 ? Math.round(dR.factCumulative / dU.factCumulative) : 0;
    const planMonthAvg = u.planMonth > 0 ? Math.round(rv.planMonth / u.planMonth) : 0;
    const factMonthAvg = u.factMonth > 0 ? Math.round(rv.factMonth / u.factMonth) : 0;
    avgBase[c] = {
      planMonth: planMonthAvg,
      factMonth: factMonthAvg,
      planCumulative: cumAvg,
    };
  }

  const baseSlice = {
    units: unitsBase,
    revenue: revenueBase,
    avgPrice: avgBase,
  };

  const mapCat = (
    src: Record<SalesPlanCategoryId, SalesPlanCategoryValues>,
    fn: (v: SalesPlanCategoryValues) => SalesPlanCategoryValues,
  ) => {
    const o = {} as Record<SalesPlanCategoryId, SalesPlanCategoryValues>;
    for (const c of SALES_PLAN_CATEGORY_IDS) o[c] = fn(src[c]!);
    return o;
  };

  const grid: SalesPlanWorkGrid = {
    base: {
      units: { ...unitsBase },
      revenue: { ...revenueBase },
      avgPrice: { ...avgBase },
    },
    updated: {
      units: mapCat(unitsBase, (v) => ({ ...v })),
      revenue: mapCat(revenueBase, (v) => ({ ...v })),
      avgPrice: mapCat(avgBase, (v) => ({ ...v })),
    },
    forecast: {
      units: mapCat(unitsBase, (v) => ({
        planMonth: v.planMonth + 1,
        factMonth: v.factMonth,
        planCumulative: v.planCumulative + 2,
      })),
      revenue: mapCat(revenueBase, (v) => ({
        planMonth: Math.round(v.planMonth * 1.05),
        factMonth: v.factMonth,
        planCumulative: Math.round(v.planCumulative * 1.03),
      })),
      avgPrice: mapCat(avgBase, (v) => ({
        planMonth: Math.round(v.planMonth * 1.02),
        factMonth: v.factMonth,
        planCumulative: Math.round(v.planCumulative * 1.01),
      })),
    },
  };

  return grid;
}

export function diffGridsToHistory(args: {
  before: SalesPlanWorkGrid;
  after: SalesPlanWorkGrid;
  userLabel: string;
  fields: SalesPlanHistoryField[];
}): SalesPlanHistoryEntry[] {
  const { before, after, userLabel, fields } = args;
  const scenarios: SalesPlanScenarioId[] = ["base", "updated", "forecast"];
  const metrics: SalesPlanMetricKind[] = ["units", "revenue", "avgPrice"];
  const out: SalesPlanHistoryEntry[] = [];
  const at = new Date().toISOString();
  let seq = 0;
  for (const s of scenarios) {
    for (const m of metrics) {
      for (const c of SALES_PLAN_CATEGORY_IDS) {
        const b = before[s][m][c];
        const a = after[s][m][c];
        for (const f of fields) {
          const oldValue = b[f];
          const newValue = a[f];
          if (oldValue !== newValue) {
            seq += 1;
            out.push({
              id: `${at}-${seq}`,
              at,
              userLabel,
              scenario: s,
              metric: m,
              categoryId: c,
              field: f,
              oldValue,
              newValue,
            });
          }
        }
      }
    }
  }
  return out;
}

export function loadSalesPlanWorkPersisted(): { grid: SalesPlanWorkGrid; history: SalesPlanHistoryEntry[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SALES_PLAN_WORK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { grid?: SalesPlanWorkGrid; history?: SalesPlanHistoryEntry[] };
    if (!parsed.grid || !parsed.history) return null;
    return { grid: cloneGrid(parsed.grid), history: parsed.history };
  } catch {
    return null;
  }
}

export function persistSalesPlanWork(grid: SalesPlanWorkGrid, history: SalesPlanHistoryEntry[]) {
  if (typeof window === "undefined") return;
  const capped = history.slice(0, 200);
  localStorage.setItem(SALES_PLAN_WORK_STORAGE_KEY, JSON.stringify({ grid, history: capped }));
}

export { cloneGrid };
