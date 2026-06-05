import { getStatusByDeviation } from "@/lib/gprUtils";
import {
  TMC_GPR_STAGE_ROOT_CODE,
  tmcFactReferenceDate,
  tmcPlanReferenceDate,
  type TMCItem,
  type TmcSupplyStatus,
} from "@/lib/tmcData";

const DAY_MS = 1000 * 60 * 60 * 24;

export type TmcTraffic =
  | "green"
  | "yellow"
  | "red"
  | "gray"
  | "overdue_not_started";

export type TmcEnrichedItem = TMCItem & {
  traffic: TmcTraffic;
  /** Отклонение факт − план (дни), если есть обе даты. */
  deviation: number | null;
  /** Просрочка: дней после плановой даты без факта или положительное отклонение. */
  overdueDays: number;
};

function parseIsoMs(iso: string | null): number | null {
  if (!iso) return null;
  const value = new Date(`${iso}T12:00:00`).getTime();
  return Number.isNaN(value) ? null : value;
}

export function tmcDeviationDays(item: TMCItem): number | null {
  const pr = tmcPlanReferenceDate(item);
  const fr = tmcFactReferenceDate(item);
  if (!pr || !fr) return null;
  const p = parseIsoMs(pr);
  const f = parseIsoMs(fr);
  if (p === null || f === null) return null;
  return Math.round((f - p) / DAY_MS);
}

export function tmcOverdueDays(item: TMCItem, today: Date = new Date()): number {
  const dev = tmcDeviationDays(item);
  if (dev !== null && dev > 0) return dev;
  const factRef = tmcFactReferenceDate(item);
  if (factRef) return 0;
  const planRef = tmcPlanReferenceDate(item);
  if (!planRef) return 0;
  const p = parseIsoMs(planRef);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0).getTime();
  if (p !== null && p < todayStart) {
    return Math.round((todayStart - p) / DAY_MS);
  }
  return 0;
}

export function tmcTrafficOf(item: TMCItem, today: Date = new Date()): TmcTraffic {
  const factRef = tmcFactReferenceDate(item);
  if (!factRef) {
    if (tmcOverdueDays(item, today) > 0) return "overdue_not_started";
    return "gray";
  }
  const d = tmcDeviationDays(item);
  if (d === null) return "gray";
  return getStatusByDeviation(d) as TmcTraffic;
}

export function enrichTmcItems(items: TMCItem[], today: Date = new Date()): TmcEnrichedItem[] {
  return items.map((item) => ({
    ...item,
    traffic: tmcTrafficOf(item, today),
    deviation: tmcDeviationDays(item),
    overdueDays: tmcOverdueDays(item, today),
  }));
}

/** Фактическая стоимость позиции (costFact / factCost после syncTmcFinancials). */
export function tmcItemFactCostRub(item: TMCItem): number {
  return item.factCost ?? 0;
}

/** Позиция с фактической поставкой: есть costFact и признак поступления (дата или объём). */
export function isTmcDeliveryFact(item: TMCItem): boolean {
  const cost = tmcItemFactCostRub(item);
  if (cost <= 0) return false;
  if (item.supplyFactDate?.trim()) return true;
  return item.volumeFact > 0;
}

/**
 * Просроченная позиция ТМЦ — тот же критерий, что и сегмент «Просрочено» в распределении статусов:
 * поставка с отставанием (red) или плановая дата прошла без факта (overdue_not_started).
 */
export function isTmcOverduePosition(item: TmcEnrichedItem): boolean {
  return item.traffic === "red" || item.traffic === "overdue_not_started";
}

/**
 * Закупленная позиция — есть факт закупки/поставки и срок оценивается по отклонению:
 * green, yellow или red (согласовано с суммой статусов кроме «Ожидается» и «не начато просрочено»).
 */
export function isTmcPurchasedPosition(item: TmcEnrichedItem): boolean {
  return item.traffic === "green" || item.traffic === "yellow" || item.traffic === "red";
}

/** Просрочка по дням (для таблицы критических поставок; шире, чем KPI «Просрочено»). */
export function isOverdueTmcDelivery(item: Pick<TmcEnrichedItem, "overdueDays">): boolean {
  return item.overdueDays > 0;
}

function isTmcPlanDueByToday(item: TMCItem, today: Date): boolean {
  const planDate = tmcPlanReferenceDate(item);
  if (!planDate) return false;
  const todayIso = today.toISOString().slice(0, 10);
  return planDate <= todayIso;
}

export type TmcProcurementKpi = {
  planRub: number;
  /** Σ factCost по всем позициям (факт закупок). */
  factRub: number;
  procurementFactRub: number;
  /** Σ factCost по позициям с фактической поставкой (факт поступлений). */
  receiptsFactRub: number;
  /** Количество позиций с фактической поставкой. */
  deliveryCount: number;
  /** Все позиции текущего среза. */
  totalItemCount: number;
  /** Позиции с фактом закупки (isTmcPurchasedPosition, = green + yellow + red). */
  purchasedItemCount: number;
  /** Доля закупленных позиций, %. */
  purchasedItemPct: number;
  /** Просрочено с фактом поставки (red). */
  overdueAmongPurchasedCount: number;
  /** Просрочено без факта — план прошёл (overdue_not_started). */
  overdueNotStartedCount: number;
  /** Средний чек поступлений, ₽. */
  avgCheckRub: number;
  deviationRub: number;
  deviationPct: number | null;
  overdueCount: number;
  overdueCostRub: number;
  /** Доля planCost с planDate ≤ today, %. */
  plannedExecutionPct: number;
  /** Σ factCost / Σ planCost, не выше 100%. */
  actualExecutionPct: number;
};

export function computeTmcProcurementKpi(
  items: TmcEnrichedItem[],
  today: Date = new Date(),
): TmcProcurementKpi {
  const planRub = items.reduce((s, i) => s + i.planCost, 0);
  const procurementFactRub = items.reduce((s, i) => s + tmcItemFactCostRub(i), 0);
  const deliveryItems = items.filter(isTmcDeliveryFact);
  const receiptsFactRub = deliveryItems.reduce((s, i) => s + tmcItemFactCostRub(i), 0);
  const deliveryCount = deliveryItems.length;
  const totalItemCount = items.length;
  const purchasedItems = items.filter(isTmcPurchasedPosition);
  const purchasedItemCount = purchasedItems.length;
  const purchasedItemPct =
    totalItemCount > 0
      ? Math.round((purchasedItemCount / totalItemCount) * 1000) / 10
      : 0;
  const overdueItems = items.filter(isTmcOverduePosition);
  const overdueAmongPurchasedCount = items.filter((i) => i.traffic === "red").length;
  const overdueNotStartedCount = items.filter((i) => i.traffic === "overdue_not_started").length;
  const planDueRub = items
    .filter((i) => isTmcPlanDueByToday(i, today))
    .reduce((s, i) => s + i.planCost, 0);
  const plannedExecutionPct =
    planRub > 0 ? Math.round((planDueRub / planRub) * 1000) / 10 : 0;
  const actualExecutionPct =
    planRub > 0
      ? Math.min(100, Math.round((procurementFactRub / planRub) * 1000) / 10)
      : 0;
  return {
    planRub,
    factRub: procurementFactRub,
    procurementFactRub,
    receiptsFactRub,
    deliveryCount,
    totalItemCount,
    purchasedItemCount,
    purchasedItemPct,
    overdueAmongPurchasedCount,
    overdueNotStartedCount,
    avgCheckRub: deliveryCount > 0 ? receiptsFactRub / deliveryCount : 0,
    deviationRub: procurementFactRub - planRub,
    deviationPct:
      planRub > 0 ? Math.round(((procurementFactRub - planRub) / planRub) * 1000) / 10 : null,
    overdueCount: overdueItems.length,
    overdueCostRub: overdueItems.reduce((s, i) => s + i.planCost, 0),
    plannedExecutionPct,
    actualExecutionPct,
  };
}

export type TmcStatusBucket = {
  key: TmcTraffic | "overdue";
  label: string;
  count: number;
  percent: number;
};

const STATUS_LABELS: Record<string, string> = {
  green: "Поставлено в срок",
  yellow: "Риск по срокам",
  overdue: "Просрочено",
  gray: "Ожидается поставка",
};

export function computeTmcStatusDistribution(items: TmcEnrichedItem[]): TmcStatusBucket[] {
  const total = items.length;
  const counts = { green: 0, yellow: 0, overdue: 0, gray: 0 };
  for (const i of items) {
    if (i.traffic === "red" || i.traffic === "overdue_not_started") counts.overdue += 1;
    else if (i.traffic === "green") counts.green += 1;
    else if (i.traffic === "yellow") counts.yellow += 1;
    else counts.gray += 1;
  }
  const keys = ["green", "yellow", "overdue", "gray"] as const;
  return keys.map((key) => ({
    key,
    label: STATUS_LABELS[key] ?? key,
    count: counts[key],
    percent: total > 0 ? Math.round((counts[key] / total) * 1000) / 10 : 0,
  }));
}

export type TmcPlanLagReasonKey = "no_delivery" | "under_plan" | "over_plan";

export type TmcPlanLagReason = {
  key: TmcPlanLagReasonKey;
  label: string;
  count: number;
  /** Вклад в отставание: отрицательный увеличивает gap, положительный — компенсация. */
  amountRub: number;
};

export type TmcPlanLagReasonsSummary = {
  reasons: TmcPlanLagReason[];
  /** Σ вкладов = receiptsFactRub − planRub (совпадает с KPI «Отставание от плана»). */
  totalLagRub: number;
};

/** Display-only: декомпозиция отставания от плана по денежным причинам. */
export function computeTmcPlanLagReasons(items: TmcEnrichedItem[]): TmcPlanLagReasonsSummary {
  let noDeliveryCount = 0;
  let noDeliveryLag = 0;
  let underPlanCount = 0;
  let underPlanLag = 0;
  let overPlanCount = 0;
  let overPlanCompensation = 0;

  for (const item of items) {
    const plan = item.planCost;
    const fact = tmcItemFactCostRub(item);

    if (!isTmcDeliveryFact(item)) {
      noDeliveryCount += 1;
      noDeliveryLag -= plan;
      continue;
    }

    if (fact < plan) {
      underPlanCount += 1;
      underPlanLag -= plan - fact;
    } else if (fact > plan) {
      overPlanCount += 1;
      overPlanCompensation += fact - plan;
    }
  }

  const totalLagRub = noDeliveryLag + underPlanLag + overPlanCompensation;

  return {
    reasons: [
      {
        key: "no_delivery",
        label: "Нет фактической поставки",
        count: noDeliveryCount,
        amountRub: noDeliveryLag,
      },
      {
        key: "under_plan",
        label: "Поставлено ниже плана",
        count: underPlanCount,
        amountRub: underPlanLag,
      },
      {
        key: "over_plan",
        label: "Перевыполнение стоимости",
        count: overPlanCount,
        amountRub: overPlanCompensation,
      },
    ],
    totalLagRub,
  };
}

export type TmcMonthlyProcurementPoint = {
  iso: string;
  label: string;
  planMln: number;
  factMln: number | null;
  planCumMln: number;
  factCumMln: number | null;
};

function monthStartFromIso(iso: string): Date {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, 1, 12, 0, 0);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1, 12, 0, 0);
}

function monthLabelRu(d: Date): string {
  return d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
}

/** Старт временной шкалы графика «Динамика закупок» (display-only). */
export const TMC_PROCUREMENT_CHART_START_MONTH = "2025-09";

function roundMln10(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Display-only: непрерывная шкала месяцев от старта проекта до последнего месяца данных.
 * Агрегация plan/fact по месяцам не меняется — добавляются только пустые месяцы с нулями.
 */
export function fillTmcMonthlyProcurementTimeline(
  series: TmcMonthlyProcurementPoint[],
  today: Date = new Date(),
  projectStartMonth: string = TMC_PROCUREMENT_CHART_START_MONTH,
): TmcMonthlyProcurementPoint[] {
  const todayMonth = today.toISOString().slice(0, 7);
  const start = monthStartFromIso(`${projectStartMonth}-01`);
  const end =
    series.length > 0
      ? monthStartFromIso(series[series.length - 1]!.iso)
      : monthStartFromIso(`${todayMonth}-01`);

  if (start.getTime() > end.getTime()) return [];

  const byMonth = new Map(series.map((p) => [p.iso.slice(0, 7), p]));
  const points: TmcMonthlyProcurementPoint[] = [];
  let planCumMln = 0;
  let factCumMln = 0;
  let cursor = start;

  while (cursor.getTime() <= end.getTime()) {
    const iso = cursor.toISOString().slice(0, 10);
    const mk = iso.slice(0, 7);
    const existing = byMonth.get(mk);
    const factVisible = mk <= todayMonth;

    const planMln = existing?.planMln ?? 0;
    const factMln = existing ? existing.factMln : 0;

    planCumMln += planMln;
    if (factMln != null) factCumMln += factMln;

    points.push({
      iso,
      label: monthLabelRu(cursor),
      planMln,
      factMln,
      planCumMln: roundMln10(planCumMln),
      factCumMln: factVisible ? roundMln10(factCumMln) : null,
    });
    cursor = addMonths(cursor, 1);
  }

  return points;
}

/** Помесячная динамика закупок (млн ₽) по датам план/факт поставки или договора. */
export function buildTmcMonthlyProcurementSeries(
  items: TMCItem[],
  today: Date = new Date(),
): TmcMonthlyProcurementPoint[] {
  const planByMonth = new Map<string, number>();
  const factByMonth = new Map<string, number>();
  const todayIso = today.toISOString().slice(0, 10);

  for (const item of items) {
    const planDate = tmcPlanReferenceDate(item);
    const factDate = tmcFactReferenceDate(item);
    if (planDate) {
      const mk = planDate.slice(0, 7);
      planByMonth.set(mk, (planByMonth.get(mk) ?? 0) + item.planCost);
    }
    if (factDate && item.factCost != null && item.factCost > 0) {
      const mk = factDate.slice(0, 7);
      factByMonth.set(mk, (factByMonth.get(mk) ?? 0) + item.factCost);
    }
  }

  const monthKeys = new Set([...planByMonth.keys(), ...factByMonth.keys()]);
  if (monthKeys.size === 0) return [];

  const sorted = [...monthKeys].sort();
  const start = monthStartFromIso(`${sorted[0]}-01`);
  const end = monthStartFromIso(`${sorted[sorted.length - 1]}-01`);

  const todayMonth = todayIso.slice(0, 7);
  const points: TmcMonthlyProcurementPoint[] = [];
  let planCum = 0;
  let factCum = 0;
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const iso = cursor.toISOString().slice(0, 10);
    const mk = iso.slice(0, 7);
    const planRub = planByMonth.get(mk) ?? 0;
    const factRub = factByMonth.get(mk) ?? 0;
    planCum += planRub;
    factCum += factRub;
    const factVisible = mk <= todayMonth;
    points.push({
      iso,
      label: monthLabelRu(cursor),
      planMln: Math.round((planRub / 1_000_000) * 10) / 10,
      factMln: factVisible ? Math.round((factRub / 1_000_000) * 10) / 10 : null,
      planCumMln: Math.round((planCum / 1_000_000) * 10) / 10,
      factCumMln: factVisible ? Math.round((factCum / 1_000_000) * 10) / 10 : null,
    });
    cursor = addMonths(cursor, 1);
  }
  return points;
}

const TMC_WORK_TYPE_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(TMC_GPR_STAGE_ROOT_CODE).map(([name, code]) => [code, name]),
);

export type TmcWorkTypePlanFactMode = "cost" | "volume";

export type TmcWorkTypePlanFactRow = {
  workTypeCode: string;
  label: string;
  fullName: string;
  plan: number;
  fact: number;
  deviation: number;
};

/** WBS верхнего уровня по шифру позиции (например 2.05). */
export function tmcWorkTypeCodeFromItem(item: TMCItem): string {
  const normalized = item.itemCode.trim().replace(/,/g, ".");
  const parts = normalized.split(".").filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  const stage = item.gprStage?.trim();
  if (stage && TMC_GPR_STAGE_ROOT_CODE[stage]) return TMC_GPR_STAGE_ROOT_CODE[stage];
  return parts[0] ?? "—";
}

/** План/факт поставок ТМЦ по видам работ (WBS level 1). */
export function computeTmcWorkTypePlanFact(
  items: TMCItem[],
  mode: TmcWorkTypePlanFactMode = "cost",
): TmcWorkTypePlanFactRow[] {
  const buckets = new Map<string, { plan: number; fact: number; stageNames: Set<string> }>();

  for (const item of items) {
    const code = tmcWorkTypeCodeFromItem(item);
    const cur = buckets.get(code) ?? { plan: 0, fact: 0, stageNames: new Set<string>() };
    if (mode === "cost") {
      cur.plan += item.planCost;
      cur.fact += tmcItemFactCostRub(item);
    } else {
      cur.plan += item.volumePlan;
      cur.fact += item.volumeFact;
    }
    const stage = item.gprStage?.trim();
    if (stage) cur.stageNames.add(stage);
    buckets.set(code, cur);
  }

  return [...buckets.entries()]
    .filter(([, v]) => v.plan > 0 || v.fact > 0)
    .map(([code, v]) => {
      const fullName =
        TMC_WORK_TYPE_NAME_BY_CODE[code] ??
        ([...v.stageNames].sort((a, b) => a.localeCompare(b, "ru"))[0] ?? code);
      return {
        workTypeCode: code,
        label: code,
        fullName,
        plan: v.plan,
        fact: v.fact,
        deviation: v.fact - v.plan,
      };
    })
    .sort((a, b) => b.plan - a.plan);
}

export const TMC_MATERIAL_PLAN_FACT_TOP_N = 15;

export type TmcMaterialPlanFactMode = TmcWorkTypePlanFactMode;

export type TmcMaterialPlanFactRow = {
  name: string;
  shortLabel: string;
  plan: number;
  fact: number;
  deviation: number;
  completionPct: number;
};

function truncateTmcMaterialLabel(name: string, maxLen = 34): string {
  const t = name.trim().replace(/\s+/g, " ");
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

/** План/факт по наименованию ТМЦ (топ-N по плановой стоимости/количеству). */
export function computeTmcMaterialPlanFact(
  items: TMCItem[],
  mode: TmcMaterialPlanFactMode = "cost",
  limit = TMC_MATERIAL_PLAN_FACT_TOP_N,
): TmcMaterialPlanFactRow[] {
  const buckets = new Map<string, { plan: number; fact: number }>();

  for (const item of items) {
    const name = item.name.trim() || "Без наименования";
    const cur = buckets.get(name) ?? { plan: 0, fact: 0 };
    if (mode === "cost") {
      cur.plan += item.planCost;
      cur.fact += tmcItemFactCostRub(item);
    } else {
      cur.plan += item.volumePlan;
      cur.fact += item.volumeFact;
    }
    buckets.set(name, cur);
  }

  return [...buckets.entries()]
    .filter(([, v]) => v.plan > 0 || v.fact > 0)
    .map(([name, v]) => ({
      name,
      shortLabel: truncateTmcMaterialLabel(name),
      plan: v.plan,
      fact: v.fact,
      deviation: v.fact - v.plan,
      completionPct: v.plan > 0 ? Math.round((v.fact / v.plan) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.plan - a.plan)
    .slice(0, limit);
}

function aggregateTmcItemsByName(items: TMCItem[]): Map<
  string,
  {
    planCost: number;
    factCost: number;
    volumePlan: number;
    volumeFact: number;
    units: Set<string>;
  }
> {
  const buckets = new Map<
    string,
    {
      planCost: number;
      factCost: number;
      volumePlan: number;
      volumeFact: number;
      units: Set<string>;
    }
  >();

  for (const item of items) {
    const name = item.name.trim() || "Без наименования";
    const cur = buckets.get(name) ?? {
      planCost: 0,
      factCost: 0,
      volumePlan: 0,
      volumeFact: 0,
      units: new Set<string>(),
    };
    cur.planCost += item.planCost;
    cur.factCost += tmcItemFactCostRub(item);
    cur.volumePlan += item.volumePlan;
    cur.volumeFact += item.volumeFact;
    const unit = item.unit?.trim();
    if (unit) cur.units.add(unit);
    buckets.set(name, cur);
  }

  return buckets;
}

function formatTmcAggregatedUnits(units: Set<string>): string {
  if (units.size === 0) return "—";
  if (units.size === 1) return [...units][0] ?? "—";
  return [...units].sort((a, b) => a.localeCompare(b, "ru")).join(", ");
}

function weightedAvgUnitPrice(
  weightedPriceVolumeSum: number,
  totalVolume: number,
  unitPriceSamples: number[],
  totalCost = 0,
): number {
  if (totalVolume > 0 && weightedPriceVolumeSum > 0) {
    return Math.round((weightedPriceVolumeSum / totalVolume) * 100) / 100;
  }
  if (totalVolume > 0 && totalCost > 0) {
    return Math.round((totalCost / totalVolume) * 100) / 100;
  }
  if (totalVolume > 0 && weightedPriceVolumeSum <= 0 && unitPriceSamples.length > 0) {
    const avg = unitPriceSamples.reduce((sum, p) => sum + p, 0) / unitPriceSamples.length;
    return Math.round(avg * 100) / 100;
  }
  if (unitPriceSamples.length > 0) {
    const avg = unitPriceSamples.reduce((sum, p) => sum + p, 0) / unitPriceSamples.length;
    return Math.round(avg * 100) / 100;
  }
  return 0;
}

/** Отладочный вывод dataset «Динамика стоимости ТМЦ» (только dev). */
export function logTmcMaterialCostDynamicsDebug(rows: TmcMaterialCostDynamicsRow[]): void {
  if (process.env.NODE_ENV === "production") return;

  console.table(
    rows.map((row) => ({
      materialName: row.name,
      planPrice: row.planUnitPrice,
      factPrice: row.factUnitPrice,
      deviationPercent: row.deviationPct,
    })),
  );

  for (const row of rows) {
    if (!Number.isFinite(row.planUnitPrice) || row.planUnitPrice <= 0) {
      console.warn(`[TMC cost dynamics] Отсутствует planPrice для «${row.name}»`);
    }
    if (row.factUnitPrice == null || !Number.isFinite(row.factUnitPrice)) {
      console.warn(`[TMC cost dynamics] Отсутствует factPrice для «${row.name}»`);
    }
  }
}

export type TmcMaterialCostDynamicsRow = {
  name: string;
  shortLabel: string;
  planUnitPrice: number;
  factUnitPrice: number;
  deviationRub: number;
  deviationPct: number;
  deviationKind: "economy" | "overrun" | "on_plan";
  deviationKindLabel: string;
};

/** План/факт цены закупки за единицу по наименованию ТМЦ для line chart «Динамика стоимости ТМЦ». */
export function computeTmcMaterialCostDynamics(
  items: TMCItem[],
  limit = TMC_MATERIAL_PLAN_FACT_TOP_N,
): TmcMaterialCostDynamicsRow[] {
  const buckets = new Map<
    string,
    {
      volumePlan: number;
      volumeFact: number;
      planCost: number;
      factCost: number;
      weightedPlanPrice: number;
      weightedFactPrice: number;
      planPriceSamples: number[];
      factPriceSamples: number[];
    }
  >();

  for (const item of items) {
    const name = item.name.trim() || "Без наименования";
    const cur = buckets.get(name) ?? {
      volumePlan: 0,
      volumeFact: 0,
      planCost: 0,
      factCost: 0,
      weightedPlanPrice: 0,
      weightedFactPrice: 0,
      planPriceSamples: [],
      factPriceSamples: [],
    };

    cur.volumePlan += item.volumePlan;
    cur.volumeFact += item.volumeFact;
    cur.planCost += item.planCost;
    cur.factCost += item.factCost ?? 0;
    cur.weightedPlanPrice += item.pricePlan * item.volumePlan;
    cur.weightedFactPrice += item.priceFact * item.volumeFact;
    if (item.pricePlan > 0) cur.planPriceSamples.push(item.pricePlan);
    if (item.priceFact > 0) cur.factPriceSamples.push(item.priceFact);
    buckets.set(name, cur);
  }

  const rows = [...buckets.entries()]
    .map(([name, v]) => {
      const planUnitPrice = weightedAvgUnitPrice(
        v.weightedPlanPrice,
        v.volumePlan,
        v.planPriceSamples,
        v.planCost,
      );
      const factUnitPrice = weightedAvgUnitPrice(
        v.weightedFactPrice,
        v.volumeFact,
        v.factPriceSamples,
        v.factCost,
      );
      const deviationRub = factUnitPrice - planUnitPrice;
      const deviationPct =
        planUnitPrice > 0 ? Math.round((deviationRub / planUnitPrice) * 1000) / 10 : 0;

      let deviationKind: TmcMaterialCostDynamicsRow["deviationKind"] = "on_plan";
      let deviationKindLabel = "По плану";
      if (planUnitPrice > 0 && factUnitPrice <= 0) {
        deviationKind = "economy";
        deviationKindLabel = "Нет фактической цены";
      } else if (planUnitPrice > 0 && factUnitPrice < planUnitPrice) {
        deviationKind = "economy";
        deviationKindLabel = "Экономия";
      } else if (factUnitPrice > planUnitPrice) {
        deviationKind = "overrun";
        deviationKindLabel = "Перерасход";
      }

      return {
        name,
        shortLabel: truncateTmcMaterialLabel(name),
        planUnitPrice,
        factUnitPrice,
        deviationRub,
        deviationPct,
        deviationKind,
        deviationKindLabel,
      };
    })
    .filter((row) => row.planUnitPrice > 0 || row.factUnitPrice > 0)
    .sort((a, b) => b.planUnitPrice - a.planUnitPrice)
    .slice(0, limit);

  logTmcMaterialCostDynamicsDebug(rows);
  return rows;
}

export type TmcVolumeCompletionTone = "critical" | "warning" | "complete" | "over";

export type TmcVolumeDynamicsRow = {
  name: string;
  shortLabel: string;
  unit: string;
  volumePlan: number;
  volumeFact: number;
  /** Для графика: плановая линия = 100%. */
  plan: number;
  /** Для графика: % выполнения объёма. */
  fact: number;
  completionPct: number;
  deviationPct: number;
  tone: TmcVolumeCompletionTone;
};

function tmcVolumeCompletionTone(completionPct: number): TmcVolumeCompletionTone {
  if (completionPct < 80) return "critical";
  if (completionPct < 100) return "warning";
  if (completionPct <= 110) return "complete";
  return "over";
}

/** Динамика объёмов закупок ТМЦ (% выполнения) для line chart. */
export function computeTmcVolumeDynamics(
  items: TMCItem[],
  limit = TMC_MATERIAL_PLAN_FACT_TOP_N,
): TmcVolumeDynamicsRow[] {
  const buckets = aggregateTmcItemsByName(items);

  return [...buckets.entries()]
    .filter(([, v]) => v.volumePlan > 0)
    .map(([name, v]) => {
      const volumePlan = v.volumePlan;
      const volumeFact = v.volumeFact;
      const completionPct =
        volumePlan > 0 ? Math.round((volumeFact / volumePlan) * 1000) / 10 : 0;
      const deviationPct = Math.round((completionPct - 100) * 10) / 10;

      return {
        name,
        shortLabel: truncateTmcMaterialLabel(name),
        unit: formatTmcAggregatedUnits(v.units),
        volumePlan,
        volumeFact,
        plan: 100,
        fact: completionPct,
        completionPct,
        deviationPct,
        tone: tmcVolumeCompletionTone(completionPct),
      };
    })
    .sort((a, b) => b.volumePlan - a.volumePlan)
    .slice(0, limit);
}

export function tmcStatusLabel(status: TmcSupplyStatus): string {
  if (status === "поставлено") return "Поставлено";
  if (status === "частично") return "Частично";
  return "В плане";
}
