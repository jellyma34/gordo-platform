import { marketingSalesReportMock } from "@/lib/marketingSalesReportData";

/** Тип объекта / линейка отчёта (без строки «итого» — она считается в UI). */
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

/** Сценарий плана (версия плана в ГПР). */
export type SalesPlanScenarioId = "base" | "updated" | "forecast";

/**
 * Учёт расторжений — отдельное измерение (как в PDF: с расторжениями / без).
 * Не смешивается с metric_type (шт / м² / ДДУ / эскроу).
 */
export type SalesPlanTerminationId = "with_terminations" | "without_terminations";

/**
 * Вид метрики — строго раздельные блоки данных отчёта.
 * Базовые метрики + средняя цена за м² (по общей / приведённой площади) с режимом авто от ДДУ/м² или ручной ввод.
 */
export type SalesPlanMetricKind =
  | "quantity"
  | "area_total"
  | "area_weighted"
  | "revenue_ddu"
  | "cashflow_escrow"
  | "avg_price_total_m2"
  | "avg_price_weighted_m2";

/** Базовые метрики таблицы редактирования (без средних цен — они в отдельном блоке UI). */
export type SalesPlanBaseMetricKind = Exclude<
  SalesPlanMetricKind,
  "avg_price_total_m2" | "avg_price_weighted_m2"
>;

/** Вводимые поля строки (периоды: месяц и накопительно; проектный план при необходимости). */
export type SalesPlanCategoryValues = {
  /** План на уровне проекта (колонка из PDF), может быть 0 если не используется */
  planProject: number;
  planMonth: number;
  planCumulative: number;
  factMonth: number;
  factCumulative: number;
  /**
   * Только для avg_price_*: true — использовать числа из ячейки; false — брать из ДДУ/площади.
   * Для остальных метрик не используется.
   */
  isManualOverride?: boolean;
};

/**
 * Сетка: сценарий → учёт расторжений → метрика → категория.
 * metric_type и scenario (terminations) не смешиваются с сущностью объекта.
 */
export type SalesPlanWorkGrid = Record<
  SalesPlanScenarioId,
  Record<SalesPlanTerminationId, Record<SalesPlanMetricKind, Record<SalesPlanCategoryId, SalesPlanCategoryValues>>>
>;

export type SalesPlanHistoryField =
  | "planProject"
  | "planMonth"
  | "factMonth"
  | "planCumulative"
  | "factCumulative"
  | "isManualOverride";

export type SalesPlanHistoryEntry = {
  id: string;
  at: string;
  userLabel: string;
  scenario: SalesPlanScenarioId;
  /** Записи до v3 могли быть без учёта расторжений — в UI подставляется with_terminations */
  termination?: SalesPlanTerminationId;
  metric: SalesPlanMetricKind;
  categoryId: SalesPlanCategoryId;
  field: SalesPlanHistoryField;
  oldValue: number;
  newValue: number;
};

export const SALES_PLAN_WORK_STORAGE_KEY = "gordo-sales-plan-work-v3";

/** Лимит отображения выполнения (защита от ошибок ввода). */
export const SALES_PLAN_MAX_PERCENT_EXECUTION = 200;

export const SALES_PLAN_CATEGORY_LABELS: Record<SalesPlanCategoryId, string> = {
  "1k": "1-к",
  "2k": "2-к",
  "3k": "3-к",
  "4k_plus": "4-к+",
  parking: "Машино-места",
  storage: "Кладовые",
  commercial: "Коммерция",
};

export const SALES_PLAN_SCENARIO_LABELS: Record<SalesPlanScenarioId, string> = {
  base: "База",
  updated: "Обновлённый",
  forecast: "Прогноз",
};

export const SALES_PLAN_TERMINATION_LABELS: Record<SalesPlanTerminationId, string> = {
  with_terminations: "С учётом расторжений",
  without_terminations: "Без учёта расторжений",
};

export const SALES_PLAN_METRIC_LABELS: Record<SalesPlanMetricKind, string> = {
  quantity: "Кол-во, шт.",
  area_total: "Площадь общая, м²",
  area_weighted: "Площадь привед., м²",
  revenue_ddu: "Продажи по ДДУ, ₽",
  cashflow_escrow: "Поступления на эскроу, ₽",
  avg_price_total_m2: "Средняя цена, ₽/м² (общ. пл.)",
  avg_price_weighted_m2: "Средняя цена, ₽/м² (привед.)",
};

const SCENARIOS: SalesPlanScenarioId[] = ["base", "updated", "forecast"];
const TERMINATIONS: SalesPlanTerminationId[] = ["with_terminations", "without_terminations"];
export const SALES_PLAN_METRIC_ORDER: readonly SalesPlanBaseMetricKind[] = [
  "quantity",
  "area_total",
  "area_weighted",
  "revenue_ddu",
  "cashflow_escrow",
] as const;

export const SALES_PLAN_AVG_PRICE_METRICS: readonly ("avg_price_total_m2" | "avg_price_weighted_m2")[] = [
  "avg_price_total_m2",
  "avg_price_weighted_m2",
] as const;

const BASE_METRICS: SalesPlanBaseMetricKind[] = [...SALES_PLAN_METRIC_ORDER];
const METRICS: SalesPlanMetricKind[] = [...BASE_METRICS, ...SALES_PLAN_AVG_PRICE_METRICS];

/** Допуск для сравнения авто-средней с ДДУ/м² (относительный). */
export const SALES_PLAN_AVG_AUTO_TOLERANCE = 0.05;

export type SalesPlanDerivedRow = {
  deviationMonth: number;
  deviationCumulative: number;
  /** fact_cumulative / plan_cumulative × 100, без искусственного cap в числе (cap только в UI) */
  percentExecution: number | null;
};

export function deriveSalesPlanRow(v: SalesPlanCategoryValues): SalesPlanDerivedRow {
  const deviationMonth = v.factMonth - v.planMonth;
  const deviationCumulative = v.factCumulative - v.planCumulative;
  const percentExecution =
    v.planCumulative !== 0 ? (v.factCumulative / v.planCumulative) * 100 : null;
  return { deviationMonth, deviationCumulative, percentExecution };
}

/** Доля строки в сумме факта накопит. по всем категориям (текущая метрика). */
export function percentOfTotalFact(factCumulative: number, sumFactCumulative: number): number | null {
  if (sumFactCumulative <= 0) return null;
  return (factCumulative / sumFactCumulative) * 100;
}

export type SalesPlanRowValidation = {
  errors: string[];
  warnings: string[];
};

export function validateSalesPlanCategoryValues(v: SalesPlanCategoryValues, d: SalesPlanDerivedRow): SalesPlanRowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const nonDeviationFields: (keyof SalesPlanCategoryValues)[] = [
    "planProject",
    "planMonth",
    "planCumulative",
    "factMonth",
    "factCumulative",
  ];
  for (const k of nonDeviationFields) {
    const x = v[k];
    if (typeof x === "number" && x < 0) errors.push(`${String(k)} не может быть отрицательным`);
  }

  if (v.factCumulative < v.factMonth) {
    warnings.push("Факт накопит. меньше факта за месяц — проверьте согласованность периодов");
  }

  if (d.percentExecution != null && d.percentExecution > SALES_PLAN_MAX_PERCENT_EXECUTION) {
    warnings.push(`Выполнение ${d.percentExecution.toFixed(1)}% > ${SALES_PLAN_MAX_PERCENT_EXECUTION}% — проверьте ввод`);
  }

  return { errors, warnings };
}

/** Средняя цена ₽/м² (общая площадь). */
export function avgPricePerM2Total(revenueFactCum: number, areaTotalFactCum: number): number | null {
  if (areaTotalFactCum <= 0) return null;
  return revenueFactCum / areaTotalFactCum;
}

/** Средняя цена ₽/м² (приведённая площадь). */
export function avgPricePerM2Weighted(revenueFactCum: number, areaWeightedFactCum: number): number | null {
  if (areaWeightedFactCum <= 0) return null;
  return revenueFactCum / areaWeightedFactCum;
}

export function gapDduVsEscrow(revenueFactCum: number, escrowFactCum: number): number {
  return revenueFactCum - escrowFactCum;
}

export function isAvgPriceMetric(m: SalesPlanMetricKind): m is "avg_price_total_m2" | "avg_price_weighted_m2" {
  return m === "avg_price_total_m2" || m === "avg_price_weighted_m2";
}

function divAvg(n: number, d: number): number {
  if (d <= 0) return 0;
  return n / d;
}

/** Средняя ₽/м² по полям периода: выручка ДДУ / площадь (при площади 0 → 0). */
export function computeAvgPriceFromRevenueArea(
  revenue: SalesPlanCategoryValues,
  area: SalesPlanCategoryValues,
): SalesPlanCategoryValues {
  return {
    planProject: divAvg(revenue.planProject, area.planProject),
    planMonth: divAvg(revenue.planMonth, area.planMonth),
    planCumulative: divAvg(revenue.planCumulative, area.planCumulative),
    factMonth: divAvg(revenue.factMonth, area.factMonth),
    factCumulative: divAvg(revenue.factCumulative, area.factCumulative),
    isManualOverride: false,
  };
}

/** Эффективные значения строки: для avg в режиме авто — из ДДУ и м². */
export function getEffectiveCategoryValues(
  slice: Record<SalesPlanMetricKind, Record<SalesPlanCategoryId, SalesPlanCategoryValues>>,
  metric: SalesPlanMetricKind,
  categoryId: SalesPlanCategoryId,
): SalesPlanCategoryValues {
  const row = slice[metric][categoryId];
  if (!isAvgPriceMetric(metric)) return row;
  if (row.isManualOverride === true) return row;
  const rev = slice.revenue_ddu[categoryId];
  const area = metric === "avg_price_total_m2" ? slice.area_total[categoryId] : slice.area_weighted[categoryId];
  return { ...computeAvgPriceFromRevenueArea(rev, area), isManualOverride: false };
}

/** Пересчитать все авто-строки средней цены в срезе от актуальных ДДУ/м². */
export function refreshAutoAvgPriceInSlice(
  slice: Record<SalesPlanMetricKind, Record<SalesPlanCategoryId, SalesPlanCategoryValues>>,
): void {
  for (const c of SALES_PLAN_CATEGORY_IDS) {
    for (const m of SALES_PLAN_AVG_PRICE_METRICS) {
      const row = slice[m][c];
      if (row.isManualOverride === true) continue;
      const rev = slice.revenue_ddu[c];
      const area = m === "avg_price_total_m2" ? slice.area_total[c] : slice.area_weighted[c];
      slice[m][c] = { ...computeAvgPriceFromRevenueArea(rev, area), isManualOverride: false };
    }
  }
}

function fillAvgMetricsForSlice(
  slice: Record<SalesPlanMetricKind, Record<SalesPlanCategoryId, SalesPlanCategoryValues>>,
): void {
  refreshAutoAvgPriceInSlice(slice);
}

/** Перед сохранением: синхронизировать авто-средние по всей сетке. */
export function syncAutoAvgPriceRows(grid: SalesPlanWorkGrid): SalesPlanWorkGrid {
  const next = cloneGrid(grid);
  for (const s of SCENARIOS) {
    for (const t of TERMINATIONS) {
      refreshAutoAvgPriceInSlice(next[s][t]);
    }
  }
  return next;
}

function numFmtRu(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n));
}

/** В режиме авто: предупреждение, если числа в ячейке сильно расходятся с ДДУ/м². */
export function validateAvgPriceAutoVsComputed(
  slice: Record<SalesPlanMetricKind, Record<SalesPlanCategoryId, SalesPlanCategoryValues>>,
  metric: "avg_price_total_m2" | "avg_price_weighted_m2",
  categoryId: SalesPlanCategoryId,
): SalesPlanRowValidation {
  const warnings: string[] = [];
  const row = slice[metric][categoryId];
  if (row.isManualOverride === true) return { errors: [], warnings: [] };

  const rev = slice.revenue_ddu[categoryId];
  const area = metric === "avg_price_total_m2" ? slice.area_total[categoryId] : slice.area_weighted[categoryId];
  const comp = computeAvgPriceFromRevenueArea(rev, area);
  const fields: (keyof Pick<
    SalesPlanCategoryValues,
    "planProject" | "planMonth" | "planCumulative" | "factMonth" | "factCumulative"
  >)[] = ["planProject", "planMonth", "planCumulative", "factMonth", "factCumulative"];

  for (const f of fields) {
    const den = area[f];
    const num = rev[f];
    if (den <= 0 && num <= 0) continue;
    if (den <= 0 && num > 0) {
      warnings.push(`${String(f)}: площадь 0 при ненулевой выручке — среднюю по ДДУ/м² не определить`);
      continue;
    }
    const cVal = comp[f];
    const sVal = row[f];
    const base = Math.max(Math.abs(cVal), 1);
    if (Math.abs(sVal - cVal) > base * SALES_PLAN_AVG_AUTO_TOLERANCE) {
      warnings.push(
        `${String(f)}: значение в таблице (${numFmtRu(sVal)}) расходится с ДДУ/м² (${numFmtRu(cVal)}) больше чем на ${Math.round(SALES_PLAN_AVG_AUTO_TOLERANCE * 100)}%`,
      );
    }
  }
  return { errors: [], warnings };
}

function emptyValues(): SalesPlanCategoryValues {
  return {
    planProject: 0,
    planMonth: 0,
    planCumulative: 0,
    factMonth: 0,
    factCumulative: 0,
    isManualOverride: false,
  };
}

export function cloneGrid(grid: SalesPlanWorkGrid): SalesPlanWorkGrid {
  const next = {} as SalesPlanWorkGrid;
  for (const s of SCENARIOS) {
    next[s] = {} as SalesPlanWorkGrid[typeof s];
    for (const t of TERMINATIONS) {
      next[s][t] = {} as Record<SalesPlanMetricKind, Record<SalesPlanCategoryId, SalesPlanCategoryValues>>;
      for (const m of METRICS) {
        next[s][t][m] = {} as Record<SalesPlanCategoryId, SalesPlanCategoryValues>;
        for (const c of SALES_PLAN_CATEGORY_IDS) {
          const src = grid[s][t][m][c];
          next[s][t][m][c] = {
            planProject: src.planProject,
            planMonth: src.planMonth,
            planCumulative: src.planCumulative,
            factMonth: src.factMonth,
            factCumulative: src.factCumulative,
            isManualOverride: src.isManualOverride,
          };
        }
      }
    }
  }
  return next;
}

type LegacyMetric = "units" | "revenue" | "avgPrice";
type LegacyValues = { planMonth: number; factMonth: number; planCumulative: number };
type LegacyGrid = Record<SalesPlanScenarioId, Record<LegacyMetric, Record<SalesPlanCategoryId, LegacyValues>>>;

function isLegacyGrid(g: unknown): g is LegacyGrid {
  if (!g || typeof g !== "object") return false;
  const base = (g as LegacyGrid).base;
  if (!base || typeof base !== "object") return false;
  return "units" in base && !("with_terminations" in base);
}

function migrateLegacyToV3(legacy: LegacyGrid): SalesPlanWorkGrid {
  const fromLegacy = (v: LegacyValues): SalesPlanCategoryValues => {
    const deltaMonth = v.factMonth - v.planMonth;
    const factCumulative = v.planCumulative + deltaMonth;
    return {
      planProject: 0,
      planMonth: v.planMonth,
      planCumulative: v.planCumulative,
      factMonth: v.factMonth,
      factCumulative: factCumulative,
      isManualOverride: false,
    };
  };

  const next = {} as SalesPlanWorkGrid;
  for (const s of SCENARIOS) {
    next[s] = {} as SalesPlanWorkGrid[typeof s];
    const u = legacy[s]?.units;
    const r = legacy[s]?.revenue;
    for (const t of TERMINATIONS) {
      next[s][t] = {} as Record<SalesPlanMetricKind, Record<SalesPlanCategoryId, SalesPlanCategoryValues>>;
      for (const m of METRICS) {
        next[s][t][m] = {} as Record<SalesPlanCategoryId, SalesPlanCategoryValues>;
        for (const c of SALES_PLAN_CATEGORY_IDS) {
          next[s][t][m][c] = emptyValues();
        }
      }
    }
    if (!u || !r) {
      for (const t of TERMINATIONS) {
        fillAvgMetricsForSlice(next[s][t]);
      }
      continue;
    }
    for (const t of TERMINATIONS) {
      for (const c of SALES_PLAN_CATEGORY_IDS) {
        const uv = fromLegacy(u[c] ?? { planMonth: 0, factMonth: 0, planCumulative: 0 });
        const rv = fromLegacy(r[c] ?? { planMonth: 0, factMonth: 0, planCumulative: 0 });
        next[s][t].quantity[c] = { ...uv };
        next[s][t].revenue_ddu[c] = { ...rv };
        const m2Rough = Math.max(0, Math.round(uv.factCumulative * 42));
        const m2w = Math.max(0, Math.round(m2Rough * 0.92));
        next[s][t].area_total[c] = {
          planProject: 0,
          planMonth: Math.max(0, Math.round(uv.planMonth * 42)),
          planCumulative: Math.max(0, Math.round(uv.planCumulative * 42)),
          factMonth: Math.max(0, Math.round(uv.factMonth * 42)),
          factCumulative: m2Rough,
        };
        next[s][t].area_weighted[c] = {
          planProject: 0,
          planMonth: Math.max(0, Math.round(uv.planMonth * 38)),
          planCumulative: Math.max(0, Math.round(uv.planCumulative * 38)),
          factMonth: Math.max(0, Math.round(uv.factMonth * 38)),
          factCumulative: m2w,
        };
        const escrowFact = Math.round(rv.factCumulative * 0.88);
        const escrowPlanM = Math.round(rv.planMonth * 0.88);
        next[s][t].cashflow_escrow[c] = {
          planProject: 0,
          planMonth: escrowPlanM,
          planCumulative: Math.round(rv.planCumulative * 0.88),
          factMonth: Math.round(rv.factMonth * 0.88),
          factCumulative: escrowFact,
        };
      }
      fillAvgMetricsForSlice(next[s][t]);
    }
  }
  return next;
}

function coerceCategoryValues(row: unknown): SalesPlanCategoryValues {
  if (!row || typeof row !== "object") return emptyValues();
  const o = row as Record<string, unknown>;
  const n = (k: string) => (typeof o[k] === "number" && Number.isFinite(o[k] as number) ? (o[k] as number) : 0);
  return {
    planProject: n("planProject"),
    planMonth: n("planMonth"),
    planCumulative: n("planCumulative"),
    factMonth: n("factMonth"),
    factCumulative: n("factCumulative"),
    isManualOverride: typeof o.isManualOverride === "boolean" ? o.isManualOverride : false,
  };
}

/** Приведение неизвестного JSON к актуальной сетке (миграция v2 → v3). */
export function normalizeWorkGridFromStorage(parsed: unknown): SalesPlanWorkGrid | null {
  if (!parsed || typeof parsed !== "object") return null;
  if (isLegacyGrid(parsed)) {
    return migrateLegacyToV3(parsed);
  }
  const g = parsed as SalesPlanWorkGrid;
  try {
    const out = {} as SalesPlanWorkGrid;
    for (const s of SCENARIOS) {
      out[s] = {} as SalesPlanWorkGrid[typeof s];
      for (const t of TERMINATIONS) {
        out[s][t] = {} as Record<SalesPlanMetricKind, Record<SalesPlanCategoryId, SalesPlanCategoryValues>>;
        for (const m of METRICS) {
          out[s][t][m] = {} as Record<SalesPlanCategoryId, SalesPlanCategoryValues>;
          for (const c of SALES_PLAN_CATEGORY_IDS) {
            out[s][t][m][c] = coerceCategoryValues(g[s]?.[t]?.[m]?.[c]);
          }
        }
      }
    }
    for (const s of SCENARIOS) {
      for (const t of TERMINATIONS) {
        refreshAutoAvgPriceInSlice(out[s][t]);
      }
    }
    return out;
  } catch {
    return null;
  }
}

/** Начальное заполнение по mock radar + синтетические площади/эскроу. */
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

  const totalRevPlanCum = r1.pc + r2.pc + r3.pc + rp.pc + rs.pc + rc.pc + 95_000_000;

  const revenueRow = (planCum: number, factCum: number): SalesPlanCategoryValues => {
    const planMonth = revenuePlanMonth(planCum, totalRevPlanCum);
    const factMonth = factCum - planCum + planMonth;
    const factCumulative = factCum;
    return { planProject: Math.round(planCum * 1.02), planMonth, planCumulative: planCum, factMonth, factCumulative };
  };

  const unitsBase: Record<SalesPlanCategoryId, SalesPlanCategoryValues> = {
    "1k": { planProject: 20, planMonth: 4, planCumulative: 18, factMonth: 5, factCumulative: 19 },
    "2k": { planProject: 12, planMonth: 1, planCumulative: 9, factMonth: 3, factCumulative: 11 },
    "3k": { planProject: 16, planMonth: 2, planCumulative: 14, factMonth: 2, factCumulative: 14 },
    "4k_plus": { planProject: 22, planMonth: 3, planCumulative: 20, factMonth: 2, factCumulative: 21 },
    parking: { planProject: 8, planMonth: 1, planCumulative: 5, factMonth: 0, factCumulative: 5 },
    storage: { planProject: 8, planMonth: 1, planCumulative: 6, factMonth: 1, factCumulative: 7 },
    commercial: { planProject: 10, planMonth: 2, planCumulative: 8, factMonth: 1, factCumulative: 8 },
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

  const scaleArea = (u: SalesPlanCategoryValues, m2PerUnit: number): SalesPlanCategoryValues => ({
    planProject: Math.round(u.planProject * m2PerUnit),
    planMonth: Math.round(u.planMonth * m2PerUnit),
    planCumulative: Math.round(u.planCumulative * m2PerUnit),
    factMonth: Math.round(u.factMonth * m2PerUnit),
    factCumulative: Math.round(u.factCumulative * m2PerUnit),
  });

  const areaTotalBase = {} as Record<SalesPlanCategoryId, SalesPlanCategoryValues>;
  const areaWeightedBase = {} as Record<SalesPlanCategoryId, SalesPlanCategoryValues>;
  const escrowBase = {} as Record<SalesPlanCategoryId, SalesPlanCategoryValues>;

  for (const c of SALES_PLAN_CATEGORY_IDS) {
    const u = unitsBase[c]!;
    const rv = revenueBase[c]!;
    areaTotalBase[c] = scaleArea(u, 48);
    areaWeightedBase[c] = scaleArea(u, 44);
    escrowBase[c] = {
      planProject: Math.round(rv.planProject * 0.9),
      planMonth: Math.round(rv.planMonth * 0.9),
      planCumulative: Math.round(rv.planCumulative * 0.9),
      factMonth: Math.round(rv.factMonth * 0.9),
      factCumulative: Math.round(rv.factCumulative * 0.88),
    };
  }

  const withoutTermAdjust = (v: SalesPlanCategoryValues, k: number): SalesPlanCategoryValues => ({
    planProject: Math.round(v.planProject * k),
    planMonth: Math.round(v.planMonth * k),
    planCumulative: Math.round(v.planCumulative * k),
    factMonth: Math.round(v.factMonth * k),
    factCumulative: Math.round(v.factCumulative * k),
  });

  const sliceForTermination = (
    t: SalesPlanTerminationId,
    q: Record<SalesPlanCategoryId, SalesPlanCategoryValues>,
    aT: Record<SalesPlanCategoryId, SalesPlanCategoryValues>,
    aW: Record<SalesPlanCategoryId, SalesPlanCategoryValues>,
    revT: Record<SalesPlanCategoryId, SalesPlanCategoryValues>,
    esc: Record<SalesPlanCategoryId, SalesPlanCategoryValues>,
  ): Record<SalesPlanMetricKind, Record<SalesPlanCategoryId, SalesPlanCategoryValues>> => {
    const k = t === "without_terminations" ? 1.03 : 1;
    const out = {
      quantity: {} as Record<SalesPlanCategoryId, SalesPlanCategoryValues>,
      area_total: {} as Record<SalesPlanCategoryId, SalesPlanCategoryValues>,
      area_weighted: {} as Record<SalesPlanCategoryId, SalesPlanCategoryValues>,
      revenue_ddu: {} as Record<SalesPlanCategoryId, SalesPlanCategoryValues>,
      cashflow_escrow: {} as Record<SalesPlanCategoryId, SalesPlanCategoryValues>,
    } as Record<SalesPlanMetricKind, Record<SalesPlanCategoryId, SalesPlanCategoryValues>>;
    for (const c of SALES_PLAN_CATEGORY_IDS) {
      const fn = t === "without_terminations" ? (x: SalesPlanCategoryValues) => withoutTermAdjust(x, k) : (x: SalesPlanCategoryValues) => ({ ...x });
      out.quantity[c] = fn({ ...q[c]! });
      out.area_total[c] = fn({ ...aT[c]! });
      out.area_weighted[c] = fn({ ...aW[c]! });
      out.revenue_ddu[c] = fn({ ...revT[c]! });
      out.cashflow_escrow[c] = fn({ ...esc[c]! });
    }
    for (const m of SALES_PLAN_AVG_PRICE_METRICS) {
      out[m] = {} as Record<SalesPlanCategoryId, SalesPlanCategoryValues>;
      for (const c of SALES_PLAN_CATEGORY_IDS) {
        out[m][c] = emptyValues();
      }
    }
    fillAvgMetricsForSlice(out);
    return out;
  };

  const baseWith = sliceForTermination("with_terminations", unitsBase, areaTotalBase, areaWeightedBase, revenueBase, escrowBase);
  const baseWithout = sliceForTermination("without_terminations", unitsBase, areaTotalBase, areaWeightedBase, revenueBase, escrowBase);

  const mapCat = (
    src: Record<SalesPlanMetricKind, Record<SalesPlanCategoryId, SalesPlanCategoryValues>>,
    fn: (v: SalesPlanCategoryValues) => SalesPlanCategoryValues,
  ): Record<SalesPlanMetricKind, Record<SalesPlanCategoryId, SalesPlanCategoryValues>> => {
    const o = {} as Record<SalesPlanMetricKind, Record<SalesPlanCategoryId, SalesPlanCategoryValues>>;
    for (const m of BASE_METRICS) {
      o[m] = {} as Record<SalesPlanCategoryId, SalesPlanCategoryValues>;
      for (const c of SALES_PLAN_CATEGORY_IDS) {
        o[m][c] = fn({ ...src[m][c]! });
      }
    }
    for (const m of SALES_PLAN_AVG_PRICE_METRICS) {
      o[m] = {} as Record<SalesPlanCategoryId, SalesPlanCategoryValues>;
      for (const c of SALES_PLAN_CATEGORY_IDS) {
        o[m][c] = emptyValues();
      }
    }
    fillAvgMetricsForSlice(o);
    return o;
  };

  const grid: SalesPlanWorkGrid = {
    base: {
      with_terminations: mapCat(baseWith, (v) => ({ ...v })),
      without_terminations: mapCat(baseWithout, (v) => ({ ...v })),
    },
    updated: {
      with_terminations: mapCat(baseWith, (v) => ({ ...v })),
      without_terminations: mapCat(baseWithout, (v) => ({ ...v })),
    },
    forecast: {
      with_terminations: mapCat(baseWith, (v) => ({
        planProject: Math.round(v.planProject * 1.02),
        planMonth: Math.round(v.planMonth * 1.05),
        planCumulative: Math.round(v.planCumulative * 1.03),
        factMonth: v.factMonth,
        factCumulative: Math.round(v.factCumulative * 1.02),
      })),
      without_terminations: mapCat(baseWithout, (v) => ({
        planProject: Math.round(v.planProject * 1.02),
        planMonth: Math.round(v.planMonth * 1.05),
        planCumulative: Math.round(v.planCumulative * 1.03),
        factMonth: v.factMonth,
        factCumulative: Math.round(v.factCumulative * 1.02),
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
  const out: SalesPlanHistoryEntry[] = [];
  const at = new Date().toISOString();
  let seq = 0;
  for (const s of SCENARIOS) {
    for (const term of TERMINATIONS) {
      for (const m of METRICS) {
        for (const c of SALES_PLAN_CATEGORY_IDS) {
          const b = before[s][term][m][c];
          const a = after[s][term][m][c];
          for (const f of fields) {
            if (f === "isManualOverride") {
              const ob = b.isManualOverride === true ? 1 : 0;
              const oa = a.isManualOverride === true ? 1 : 0;
              if (ob !== oa) {
                seq += 1;
                out.push({
                  id: `${at}-${seq}`,
                  at,
                  userLabel,
                  scenario: s,
                  termination: term,
                  metric: m,
                  categoryId: c,
                  field: f,
                  oldValue: ob,
                  newValue: oa,
                });
              }
              continue;
            }
            const oldValue = b[f] as number;
            const newValue = a[f] as number;
            if (oldValue !== newValue) {
              seq += 1;
              out.push({
                id: `${at}-${seq}`,
                at,
                userLabel,
                scenario: s,
                termination: term,
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
  }
  return out;
}

const LEGACY_STORAGE_KEY = "gordo-sales-plan-work-v2";

export function loadSalesPlanWorkPersisted(): { grid: SalesPlanWorkGrid; history: SalesPlanHistoryEntry[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SALES_PLAN_WORK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { grid?: unknown; history?: SalesPlanHistoryEntry[] };
      const grid = normalizeWorkGridFromStorage(parsed.grid);
      if (grid) return { grid, history: Array.isArray(parsed.history) ? parsed.history : [] };
    }
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as { grid?: unknown; history?: SalesPlanHistoryEntry[] };
      const grid = normalizeWorkGridFromStorage(parsed.grid);
      if (grid) {
        return { grid, history: Array.isArray(parsed.history) ? parsed.history : [] };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function persistSalesPlanWork(grid: SalesPlanWorkGrid, history: SalesPlanHistoryEntry[]) {
  if (typeof window === "undefined") return;
  const capped = history.slice(0, 200);
  localStorage.setItem(SALES_PLAN_WORK_STORAGE_KEY, JSON.stringify({ grid, history: capped }));
}

/** Сумма факта накопит. по категориям (для % от итого). */
export function sumFactCumulativeForMetric(
  slice: Record<SalesPlanMetricKind, Record<SalesPlanCategoryId, SalesPlanCategoryValues>>,
  metric: SalesPlanMetricKind,
): number {
  return SALES_PLAN_CATEGORY_IDS.reduce(
    (s, c) => s + getEffectiveCategoryValues(slice, metric, c).factCumulative,
    0,
  );
}
