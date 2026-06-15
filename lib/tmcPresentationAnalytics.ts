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
  const deliveryPipeline = computeTmcDeliveryPipelineCounts(items);
  const deliveryCount = deliveryPipeline.deliveredKpi;
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

export type TmcProcurementFinancialResult = {
  /** Σ max(planCost − factCost, 0) по позициям с фактом закупки. */
  economyRub: number;
  /** Σ max(factCost − planCost, 0) по позициям с фактом закупки. */
  overrunRub: number;
  /** Экономия − перерасход. */
  balanceRub: number;
  /** Σ planCost по позициям с factCost > 0. */
  purchasedPlanRub: number;
  /** economyRub / purchasedPlanRub × 100, %. */
  economySharePct: number;
  /** Σ factCost по позициям с factCost > 0. */
  purchasedFactRub: number;
  /** Факт − план по закупленным позициям, ₽. */
  deviationRub: number;
  /** deviationRub / purchasedPlanRub × 100, %. */
  deviationPct: number;
};

/** Позиция с зафиксированной фактической стоимостью закупки. */
export function hasTmcPurchaseFact(item: TMCItem): boolean {
  return tmcItemFactCostRub(item) > 0;
}

/** Финансовый результат закупок: экономия и перерасход только по позициям с фактом. */
export function computeTmcProcurementFinancialResult(
  items: TmcEnrichedItem[],
): TmcProcurementFinancialResult {
  let economyRub = 0;
  let overrunRub = 0;
  let purchasedPlanRub = 0;

  for (const item of items) {
    if (!hasTmcPurchaseFact(item)) continue;
    const plan = item.planCost;
    const fact = tmcItemFactCostRub(item);
    purchasedPlanRub += plan;
    economyRub += Math.max(plan - fact, 0);
    overrunRub += Math.max(fact - plan, 0);
  }

  const economySharePct =
    purchasedPlanRub > 0 ? Math.round((economyRub / purchasedPlanRub) * 1000) / 10 : 0;
  const purchasedFactRub = purchasedPlanRub - economyRub + overrunRub;
  const deviationRub = purchasedFactRub - purchasedPlanRub;
  const deviationPct =
    purchasedPlanRub > 0 ? Math.round((deviationRub / purchasedPlanRub) * 1000) / 10 : 0;

  return {
    economyRub,
    overrunRub,
    balanceRub: economyRub - overrunRub,
    purchasedPlanRub,
    economySharePct,
    purchasedFactRub,
    deviationRub,
    deviationPct,
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
    const factMln = factVisible ? (existing?.factMln ?? 0) : null;

    planCumMln += planMln;
    if (factVisible && factMln != null) factCumMln += factMln;

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

/** Помесячная динамика закупок (млн ₽): план — contractPlanDate, факт — contractFactDate. */
export function buildTmcMonthlyProcurementSeries(
  items: TMCItem[],
  today: Date = new Date(),
): TmcMonthlyProcurementPoint[] {
  const planByMonth = new Map<string, number>();
  const factByMonth = new Map<string, number>();
  const todayIso = today.toISOString().slice(0, 10);

  for (const item of items) {
    const planDate = item.contractPlanDate?.trim() || null;
    const factDate = item.contractFactDate?.trim() || null;
    if (planDate) {
      const mk = planDate.slice(0, 7);
      planByMonth.set(mk, (planByMonth.get(mk) ?? 0) + item.planCost);
    }
    if (factDate) {
      const factRub = tmcItemFactCostRub(item);
      if (factRub > 0) {
        const mk = factDate.slice(0, 7);
        factByMonth.set(mk, (factByMonth.get(mk) ?? 0) + factRub);
      }
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

export type TmcDeliveryDynamicsValueMode = "cost" | "quantity";

function toDeliveryChartValue(
  rawRubOrCount: number,
  valueMode: TmcDeliveryDynamicsValueMode,
): number {
  if (valueMode === "cost") {
    return Math.round((rawRubOrCount / 1_000_000) * 10) / 10;
  }
  return rawRubOrCount;
}

function roundDeliveryCumulative(
  value: number,
  valueMode: TmcDeliveryDynamicsValueMode,
): number {
  return valueMode === "cost" ? roundMln10(value) : value;
}

/**
 * Помесячная динамика поставок по полям supplyPlanDate / supplyFactDate.
 * cost — млн ₽ (planCost / factCost); quantity — число позиций ТМЦ.
 */
export function buildTmcMonthlyDeliverySeries(
  items: TMCItem[],
  today: Date = new Date(),
  valueMode: TmcDeliveryDynamicsValueMode = "cost",
): TmcMonthlyProcurementPoint[] {
  const planByMonth = new Map<string, number>();
  const factByMonth = new Map<string, number>();
  const todayIso = today.toISOString().slice(0, 10);

  for (const item of items) {
    const planDate = item.supplyPlanDate?.trim() || null;
    const factDate = item.supplyFactDate?.trim() || null;

    if (planDate) {
      const mk = planDate.slice(0, 7);
      const delta = valueMode === "cost" ? item.planCost : 1;
      planByMonth.set(mk, (planByMonth.get(mk) ?? 0) + delta);
    }
    if (factDate) {
      const mk = factDate.slice(0, 7);
      const delta = valueMode === "cost" ? tmcItemFactCostRub(item) : 1;
      if (valueMode === "quantity" || delta > 0) {
        factByMonth.set(mk, (factByMonth.get(mk) ?? 0) + delta);
      }
    }
  }

  const monthKeys = new Set([...planByMonth.keys(), ...factByMonth.keys()]);
  if (monthKeys.size === 0) return [];

  const sorted = [...monthKeys].sort();
  const start = monthStartFromIso(`${sorted[0]}-01`);
  const end = monthStartFromIso(`${sorted[sorted.length - 1]}-01`);
  const todayMonth = todayIso.slice(0, 7);
  const points: TmcMonthlyProcurementPoint[] = [];
  let planCumRaw = 0;
  let factCumRaw = 0;
  let cursor = start;

  while (cursor.getTime() <= end.getTime()) {
    const iso = cursor.toISOString().slice(0, 10);
    const mk = iso.slice(0, 7);
    const planRaw = planByMonth.get(mk) ?? 0;
    const factRaw = factByMonth.get(mk) ?? 0;
    planCumRaw += planRaw;
    factCumRaw += factRaw;
    const factVisible = mk <= todayMonth;
    points.push({
      iso,
      label: monthLabelRu(cursor),
      planMln: toDeliveryChartValue(planRaw, valueMode),
      factMln: factVisible ? toDeliveryChartValue(factRaw, valueMode) : null,
      planCumMln: roundDeliveryCumulative(
        toDeliveryChartValue(planCumRaw, valueMode),
        valueMode,
      ),
      factCumMln: factVisible
        ? roundDeliveryCumulative(toDeliveryChartValue(factCumRaw, valueMode), valueMode)
        : null,
    });
    cursor = addMonths(cursor, 1);
  }

  return points;
}

/**
 * Выравнивание динамики поставок по той же оси X, что и «Динамика закупок»
 * (включая пустые месяцы с нулевыми точками).
 */
export function alignTmcMonthlySeriesToTimeline(
  series: TmcMonthlyProcurementPoint[],
  referenceTimeline: TmcMonthlyProcurementPoint[],
  today: Date = new Date(),
): TmcMonthlyProcurementPoint[] {
  if (referenceTimeline.length === 0) return series;

  const todayMonth = today.toISOString().slice(0, 7);
  const byMonth = new Map(series.map((p) => [p.iso.slice(0, 7), p]));
  let planCum = 0;
  let factCum = 0;

  return referenceTimeline.map((ref) => {
    const mk = ref.iso.slice(0, 7);
    const existing = byMonth.get(mk);
    const plan = existing?.planMln ?? 0;
    const factVisible = mk <= todayMonth;
    const fact = factVisible ? (existing?.factMln ?? 0) : null;
    planCum += plan;
    if (factVisible && fact != null) factCum += fact;

    return {
      iso: ref.iso,
      label: ref.label,
      planMln: plan,
      factMln: fact,
      planCumMln: roundMln10(planCum),
      factCumMln: factVisible ? roundMln10(factCum) : null,
    };
  });
}

export type TmcDynamicsMonthSourceRow = {
  id: string;
  itemCode: string;
  name: string;
  kind: "plan" | "fact";
  date: string;
  dateField: "contractPlanDate" | "contractFactDate" | "supplyPlanDate" | "supplyFactDate";
  amountRub: number;
};

export type TmcDynamicsMonthDiagnostic = {
  month: string;
  plan: number;
  fact: number;
  sourceRows: TmcDynamicsMonthSourceRow[];
};

function pushDynamicsSourceRow(
  byMonth: Map<string, TmcDynamicsMonthSourceRow[]>,
  monthKey: string,
  row: TmcDynamicsMonthSourceRow,
): void {
  const rows = byMonth.get(monthKey) ?? [];
  rows.push(row);
  byMonth.set(monthKey, rows);
}

function collectProcurementDynamicsSources(
  items: TMCItem[],
): Map<string, TmcDynamicsMonthSourceRow[]> {
  const byMonth = new Map<string, TmcDynamicsMonthSourceRow[]>();

  for (const item of items) {
    const planDate = item.contractPlanDate?.trim() || null;
    if (planDate) {
      pushDynamicsSourceRow(byMonth, planDate.slice(0, 7), {
        id: item.id,
        itemCode: item.itemCode,
        name: item.name,
        kind: "plan",
        date: planDate,
        dateField: "contractPlanDate",
        amountRub: item.planCost,
      });
    }

    const factDate = item.contractFactDate?.trim() || null;
    if (factDate) {
      const factRub = tmcItemFactCostRub(item);
      if (factRub > 0) {
        pushDynamicsSourceRow(byMonth, factDate.slice(0, 7), {
          id: item.id,
          itemCode: item.itemCode,
          name: item.name,
          kind: "fact",
          date: factDate,
          dateField: "contractFactDate",
          amountRub: factRub,
        });
      }
    }
  }

  return byMonth;
}

function collectDeliveryDynamicsSources(
  items: TMCItem[],
): Map<string, TmcDynamicsMonthSourceRow[]> {
  const byMonth = new Map<string, TmcDynamicsMonthSourceRow[]>();

  for (const item of items) {
    const planDate = item.supplyPlanDate?.trim() || null;
    if (planDate) {
      pushDynamicsSourceRow(byMonth, planDate.slice(0, 7), {
        id: item.id,
        itemCode: item.itemCode,
        name: item.name,
        kind: "plan",
        date: planDate,
        dateField: "supplyPlanDate",
        amountRub: item.planCost,
      });
    }

    const factDate = item.supplyFactDate?.trim() || null;
    if (factDate) {
      const factRub = tmcItemFactCostRub(item);
      if (factRub > 0) {
        pushDynamicsSourceRow(byMonth, factDate.slice(0, 7), {
          id: item.id,
          itemCode: item.itemCode,
          name: item.name,
          kind: "fact",
          date: factDate,
          dateField: "supplyFactDate",
          amountRub: factRub,
        });
      }
    }
  }

  return byMonth;
}

function buildDynamicsMonthDiagnostics(
  timeline: TmcMonthlyProcurementPoint[],
  sourcesByMonth: Map<string, TmcDynamicsMonthSourceRow[]>,
  today: Date = new Date(),
): TmcDynamicsMonthDiagnostic[] {
  const todayMonth = today.toISOString().slice(0, 7);

  return timeline.map((point) => {
    const month = point.iso.slice(0, 7);
    const factVisible = month <= todayMonth;
    const sourceRows = sourcesByMonth.get(month) ?? [];
    return {
      month,
      plan: point.planMln,
      fact: factVisible ? (point.factMln ?? 0) : 0,
      sourceRows,
    };
  });
}

/** Временная диагностика: какие строки ТМЦ попали в каждый месяц «Динамика закупок». */
export function diagnoseTmcProcurementDynamicsMonths(
  items: TMCItem[],
  timeline: TmcMonthlyProcurementPoint[],
  today: Date = new Date(),
): TmcDynamicsMonthDiagnostic[] {
  return buildDynamicsMonthDiagnostics(
    timeline,
    collectProcurementDynamicsSources(items),
    today,
  );
}

/** Временная диагностика: какие строки ТМЦ попали в каждый месяц «Динамика поставок». */
export function diagnoseTmcDeliveryDynamicsMonths(
  items: TMCItem[],
  timeline: TmcMonthlyProcurementPoint[],
  today: Date = new Date(),
): TmcDynamicsMonthDiagnostic[] {
  return buildDynamicsMonthDiagnostics(
    timeline,
    collectDeliveryDynamicsSources(items),
    today,
  );
}

/** % выполнения плана заявок за период (факт / план × 100). */
export function tmcRequestCompletionPct(plan: number, fact: number): number | null {
  if (plan <= 0) return fact > 0 ? null : 0;
  return (fact / plan) * 100;
}

/** Цвет линии факта заявок по светофору выполнения плана. */
export function tmcRequestCompletionColor(pct: number): string {
  if (pct < 70) return "#ef4444";
  if (pct < 95) return "#f59e0b";
  if (pct <= 105) return "#22c55e";
  return "#3b82f6";
}

/**
 * Помесячная динамика заявок на закупку:
 * план — contractPlanDate, факт — contractFactDate (1 позиция ТМЦ = 1 заявка).
 */
export function buildTmcMonthlyRequestSeries(
  items: TMCItem[],
  today: Date = new Date(),
): TmcMonthlyProcurementPoint[] {
  const planByMonth = new Map<string, number>();
  const factByMonth = new Map<string, number>();
  const todayIso = today.toISOString().slice(0, 10);

  for (const item of items) {
    const planDate = item.contractPlanDate?.trim() || null;
    const factDate = item.contractFactDate?.trim() || null;

    if (planDate) {
      const mk = planDate.slice(0, 7);
      planByMonth.set(mk, (planByMonth.get(mk) ?? 0) + 1);
    }
    if (factDate) {
      const mk = factDate.slice(0, 7);
      factByMonth.set(mk, (factByMonth.get(mk) ?? 0) + 1);
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
    const planCount = planByMonth.get(mk) ?? 0;
    const factCount = factByMonth.get(mk) ?? 0;
    planCum += planCount;
    factCum += factCount;
    const factVisible = mk <= todayMonth;
    points.push({
      iso,
      label: monthLabelRu(cursor),
      planMln: planCount,
      factMln: factVisible ? factCount : null,
      planCumMln: planCum,
      factCumMln: factVisible ? factCum : null,
    });
    cursor = addMonths(cursor, 1);
  }

  return points;
}

export type TmcRequestDynamicsKpi = {
  submittedFactCount: number;
  submittedPlanCount: number;
  factCostRub: number;
  planCostRub: number;
  executionPct: number;
  notSubmittedCount: number;
};

/** KPI блока «План / факт заявок» по датам договора (план/факт). */
export function computeTmcRequestDynamicsKpi(
  items: TMCItem[],
  today: Date = new Date(),
): TmcRequestDynamicsKpi {
  const todayIso = today.toISOString().slice(0, 10);
  let submittedPlanCount = 0;
  let submittedFactCount = 0;
  let planCostRub = 0;
  let factCostRub = 0;
  let notSubmittedCount = 0;

  for (const item of items) {
    const contractPlan = item.contractPlanDate?.trim();
    const contractFact = item.contractFactDate?.trim();

    if (contractPlan) {
      submittedPlanCount += 1;
      planCostRub += item.planCost;
      if (!contractFact && contractPlan <= todayIso) {
        notSubmittedCount += 1;
      }
    }
    if (contractFact) {
      submittedFactCount += 1;
      factCostRub += item.planCost;
    }
  }

  const executionPct =
    submittedPlanCount > 0
      ? Math.round((submittedFactCount / submittedPlanCount) * 1000) / 10
      : 0;

  return {
    submittedFactCount,
    submittedPlanCount,
    factCostRub,
    planCostRub,
    executionPct,
    notSubmittedCount,
  };
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

export const TMC_ARMATURE_BELOW_LABEL = "Арматура (ниже 0.000)";
export const TMC_ARMATURE_ABOVE_LABEL = "Арматура (выше 0.000)";

export type TmcArmatureElevationGroup = "below" | "above";

const TMC_ARMATURE_BELOW_STAGE_MARKERS = [
  "устройство фундамента",
  "устройство стен цоколя",
  "устройство цоколя",
  "плиты покрытия на отрицательных",
  "отрицательных отметках",
  "железобетонные конструкции ниже",
  "конструкции железобетонные ниже",
  "кж ниже 0",
  "ниже 0.000",
  "ниже 0",
] as const;

const TMC_ARMATURE_ABOVE_STAGE_MARKERS = [
  "плиты покрытия на отм. 0.000",
  "плиты покрытия на отм.0",
  "плиты покрытия на отм 0",
  "0.000 и выше",
  "монолитные конструкции этажей",
  "монолитные конструкции",
  "устройство кровли",
  "кровл",
  "отверстия и проем",
  "устройство каркаса",
] as const;

export function isTmcArmatureMaterial(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized.startsWith("арматура") || /\bарматура\b/u.test(normalized);
}

function normalizeTmcGprStage(stage: string): string {
  return stage.trim().toLowerCase().replace(/\u00a0/g, " ").replace(/\s+/g, " ");
}

function extractTmcStageElevationMarks(stage: string): number[] {
  const normalized = normalizeTmcGprStage(stage);
  const marks: number[] = [];
  const re = /(?:отм\.?\s*|на\s+отм\.?\s*)?(-?\d+(?:[.,]\d+)?)/giu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) {
    const raw = match[1]?.replace(",", ".");
    if (!raw) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) marks.push(value);
  }
  return marks;
}

function hasTmcNegativeElevationMark(stage: string): boolean {
  const normalized = normalizeTmcGprStage(stage);
  if (/(?:^|[^\d])-([1-7])(?:[.,]\d+)?(?:[^\d]|$)/u.test(normalized)) return true;
  return extractTmcStageElevationMarks(stage).some((mark) => mark < 0);
}

function hasTmcNonNegativeElevationMark(stage: string): boolean {
  return extractTmcStageElevationMarks(stage).some((mark) => mark >= 0);
}

function inferTmcArmatureGroupFromItemCode(itemCode: string): TmcArmatureElevationGroup {
  const code = itemCode.trim();
  if (code.startsWith("2.05.02")) return "below";
  if (code.startsWith("2.05.04") || code.startsWith("2.05.07")) return "above";
  return "below";
}

/** Группа отметки для арматуры: ниже или выше 0.000 по этапу ГПР. */
export function classifyTmcArmatureByGprStage(
  gprStage: string,
  itemCode = "",
): TmcArmatureElevationGroup {
  const stage = normalizeTmcGprStage(gprStage);
  if (!stage) return inferTmcArmatureGroupFromItemCode(itemCode);

  for (const marker of TMC_ARMATURE_BELOW_STAGE_MARKERS) {
    if (stage.includes(marker)) return "below";
  }
  for (const marker of TMC_ARMATURE_ABOVE_STAGE_MARKERS) {
    if (stage.includes(marker)) return "above";
  }

  if (/0[.,]000\s*и\s*выше/u.test(stage) || /выше\s*0/u.test(stage)) return "above";
  if (/ниже\s*0/u.test(stage)) return "below";

  const elevations = extractTmcStageElevationMarks(stage);
  if (elevations.length > 0) {
    if (elevations.every((mark) => mark < 0)) return "below";
    if (elevations.every((mark) => mark >= 0)) return "above";
    if (hasTmcNegativeElevationMark(stage)) return "below";
    if (hasTmcNonNegativeElevationMark(stage)) return "above";
  }

  return inferTmcArmatureGroupFromItemCode(itemCode);
}

function tmcMaterialPlanFactBucketKey(item: TMCItem): string {
  const name = item.name.trim() || "Без наименования";
  if (!isTmcArmatureMaterial(name)) return name;
  const group = classifyTmcArmatureByGprStage(item.gprStage, item.itemCode);
  return group === "below" ? TMC_ARMATURE_BELOW_LABEL : TMC_ARMATURE_ABOVE_LABEL;
}

export type TmcArmaturePlanFactDiagnostics = {
  belowPlan: number;
  belowFact: number;
  abovePlan: number;
  aboveFact: number;
  belowStages: string[];
  aboveStages: string[];
};

export function computeTmcArmaturePlanFactDiagnostics(items: TMCItem[]): TmcArmaturePlanFactDiagnostics {
  const belowStages = new Set<string>();
  const aboveStages = new Set<string>();
  let belowPlan = 0;
  let belowFact = 0;
  let abovePlan = 0;
  let aboveFact = 0;

  for (const item of items) {
    if (!isTmcArmatureMaterial(item.name)) continue;
    const group = classifyTmcArmatureByGprStage(item.gprStage, item.itemCode);
    const stageLabel = item.gprStage.trim() || item.itemCode.trim() || "Без этапа";
    if (group === "below") {
      belowStages.add(stageLabel);
      belowPlan += item.planCost;
      belowFact += tmcItemFactCostRub(item);
    } else {
      aboveStages.add(stageLabel);
      abovePlan += item.planCost;
      aboveFact += tmcItemFactCostRub(item);
    }
  }

  return {
    belowPlan,
    belowFact,
    abovePlan,
    aboveFact,
    belowStages: [...belowStages].sort((a, b) => a.localeCompare(b, "ru")),
    aboveStages: [...aboveStages].sort((a, b) => a.localeCompare(b, "ru")),
  };
}

export type TmcMaterialPlanFactMode = "cost" | "completion";

export type TmcMaterialPlanFactRow = {
  name: string;
  shortLabel: string;
  plan: number;
  fact: number;
  deviation: number;
  /** Выполнение по стоимости (факт / план), режим «Стоимость». */
  completionPct: number;
  /** План % на текущую дату — полоса в режиме «% выполнения». */
  planBarPct: number;
  /** Факт % на текущую дату — полоса в режиме «% выполнения». */
  factBarPct: number;
  /** Факт относительно плана на текущую дату (для цвета фактической полосы). */
  executionVsPlanPct: number;
  /** Есть supplyPlanDate для расчёта календарного плана. */
  hasCalendarPlan: boolean;
};

function roundTmcCompletionBarPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.round(pct * 10) / 10;
}

type TmcMaterialPlanFactBucket = {
  plan: number;
  fact: number;
  totalVolumePlan: number;
  totalVolumeFact: number;
  planVolumeByToday: number;
  factVolumeByToday: number;
  hasCalendarPlan: boolean;
};

/**
 * Проценты для режима «% выполнения» по объёмам поставки.
 * Fallback 100% / fact/plan×100 — если нет supplyPlanDate (календарный план).
 */
function resolveTmcMaterialCompletionBarPcts(bucket: TmcMaterialPlanFactBucket): {
  planBarPct: number;
  factBarPct: number;
  executionVsPlanPct: number;
} {
  const { totalVolumePlan, totalVolumeFact, planVolumeByToday, factVolumeByToday, hasCalendarPlan } =
    bucket;

  if (totalVolumePlan <= 0) {
    return { planBarPct: 0, factBarPct: 0, executionVsPlanPct: 0 };
  }

  if (!hasCalendarPlan) {
    // Нет календарного плана по supplyPlanDate — прежняя логика: план = 100%, факт = доля от общего плана.
    const factBarPct = roundTmcCompletionBarPct((totalVolumeFact / totalVolumePlan) * 100);
    return { planBarPct: 100, factBarPct, executionVsPlanPct: factBarPct };
  }

  const planBarPct = roundTmcCompletionBarPct((planVolumeByToday / totalVolumePlan) * 100);
  const factBarPct = roundTmcCompletionBarPct((factVolumeByToday / totalVolumePlan) * 100);
  const executionVsPlanPct =
    planBarPct > 0 ? roundTmcCompletionBarPct((factBarPct / planBarPct) * 100) : 0;

  return { planBarPct, factBarPct, executionVsPlanPct };
}

function truncateTmcMaterialLabel(name: string, maxLen = 34): string {
  const t = name.trim().replace(/\s+/g, " ");
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

/** План/факт по наименованию ТМЦ (топ-N по плановой стоимости). */
export function computeTmcMaterialPlanFact(
  items: TMCItem[],
  limit = TMC_MATERIAL_PLAN_FACT_TOP_N,
  today: Date = new Date(),
): TmcMaterialPlanFactRow[] {
  const todayIso = today.toISOString().slice(0, 10);
  const buckets = new Map<string, TmcMaterialPlanFactBucket>();

  for (const item of items) {
    const name = tmcMaterialPlanFactBucketKey(item);
    const cur = buckets.get(name) ?? {
      plan: 0,
      fact: 0,
      totalVolumePlan: 0,
      totalVolumeFact: 0,
      planVolumeByToday: 0,
      factVolumeByToday: 0,
      hasCalendarPlan: false,
    };
    cur.plan += item.planCost;
    cur.fact += tmcItemFactCostRub(item);
    cur.totalVolumePlan += item.volumePlan;
    cur.totalVolumeFact += item.volumeFact;

    const supplyPlanDate = item.supplyPlanDate?.trim();
    if (supplyPlanDate && item.volumePlan > 0) {
      cur.hasCalendarPlan = true;
      if (supplyPlanDate <= todayIso) {
        cur.planVolumeByToday += item.volumePlan;
      }
    }

    const supplyFactDate = item.supplyFactDate?.trim();
    if (supplyFactDate && supplyFactDate <= todayIso) {
      cur.factVolumeByToday += item.volumeFact;
    }

    buckets.set(name, cur);
  }

  const rows = [...buckets.entries()]
    .filter(([, v]) => v.plan > 0 || v.fact > 0)
    .map(([name, v]) => {
      const barPcts = resolveTmcMaterialCompletionBarPcts(v);
      return {
        name,
        shortLabel: truncateTmcMaterialLabel(name),
        plan: v.plan,
        fact: v.fact,
        deviation: v.fact - v.plan,
        completionPct: v.plan > 0 ? Math.round((v.fact / v.plan) * 1000) / 10 : 0,
        planBarPct: barPcts.planBarPct,
        factBarPct: barPcts.factBarPct,
        executionVsPlanPct: barPcts.executionVsPlanPct,
        hasCalendarPlan: v.hasCalendarPlan,
      };
    })
    .sort((a, b) => b.plan - a.plan)
    .slice(0, limit);

  const fallbackNames = rows
    .filter((row) => row.plan > 0 && !row.hasCalendarPlan)
    .map((row) => row.name);
  if (fallbackNames.length > 0) {
    console.warn(
      "[TMC plan/fact %] Нет календарного плана поставок (supplyPlanDate) для материалов:",
      fallbackNames,
      "— fallback: план=100%, факт=(фактический объём / общий плановый объём)×100.",
    );
  }

  return rows;
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

function resolveTmcItemPlanUnitPrice(item: TMCItem): number {
  if (item.pricePlan > 0) return item.pricePlan;
  if (item.volumePlan > 0) {
    const planCost = item.planCost > 0 ? item.planCost : item.totalPlan > 0 ? item.totalPlan : 0;
    if (planCost > 0) return planCost / item.volumePlan;
  }
  return 0;
}

function resolveTmcItemFactUnitPrice(item: TMCItem): number {
  if (item.priceFact > 0) return item.priceFact;
  if (item.volumeFact > 0) {
    const factCost = item.factCost ?? item.totalFact ?? 0;
    if (factCost > 0) return factCost / item.volumeFact;
  }
  return 0;
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

/** Диагностика цепочки «По ТМЦ»: где уменьшается число позиций. */
export function diagnoseTmcMaterialCostDynamicsChain(
  sourceItems: TMCItem[],
  chartRows: TmcMaterialCostDynamicsRow[],
  context: { scope?: string; limitApplied?: number | null } = {},
): void {
  if (process.env.NODE_ENV === "production") return;

  const uniqueNames = new Set(sourceItems.map((i) => i.name.trim() || "Без наименования"));
  const chartNames = new Set(chartRows.map((r) => r.name));

  console.group("[TMC debug] Динамика стоимости — цепочка «По ТМЦ»");
  console.log("Chart source rows", sourceItems.length);
  console.log("Unique material names", uniqueNames.size);
  console.log("Grouped materials", chartRows.length);
  console.log("scope", context.scope ?? "all");
  if (context.limitApplied != null) {
    console.log("limit applied", context.limitApplied);
  }
  if (uniqueNames.size !== chartRows.length) {
    const missing = [...uniqueNames].filter((n) => !chartNames.has(n));
    if (missing.length > 0) {
      console.warn("[TMC debug] Материалы не попали в график:", missing);
    }
  }
  console.groupEnd();
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

/**
 * План/факт цены за единицу по уникальному наименованию ТМЦ.
 * Несколько строк CSV с одним материалом → один столбец;
 * цена = средневзвешенная по объёму: Σ(price × qty) / Σ(qty).
 */
export function computeTmcMaterialCostDynamics(
  items: TMCItem[],
  limit?: number,
): TmcMaterialCostDynamicsRow[] {
  if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
    console.log("[TMC debug] Chart source rows", items.length);
  }

  const buckets = new Map<
    string,
    {
      volumePlan: number;
      volumeFact: number;
      planCost: number;
      factCost: number;
      weightedPlanPrice: number;
      weightedFactPrice: number;
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
    };

    const planUnitPrice = resolveTmcItemPlanUnitPrice(item);
    const factUnitPrice = resolveTmcItemFactUnitPrice(item);

    if (item.volumePlan > 0) {
      cur.volumePlan += item.volumePlan;
      cur.planCost += item.planCost > 0 ? item.planCost : item.totalPlan > 0 ? item.totalPlan : 0;
      if (planUnitPrice > 0) {
        cur.weightedPlanPrice += planUnitPrice * item.volumePlan;
      }
    }

    if (item.volumeFact > 0) {
      cur.volumeFact += item.volumeFact;
      cur.factCost += item.factCost ?? item.totalFact ?? 0;
      if (factUnitPrice > 0) {
        cur.weightedFactPrice += factUnitPrice * item.volumeFact;
      }
    }

    buckets.set(name, cur);
  }

  const rows = [...buckets.entries()]
    .map(([name, v]) => {
      const planUnitPrice = weightedAvgUnitPrice(
        v.weightedPlanPrice,
        v.volumePlan,
        [],
        v.planCost,
      );
      const factUnitPrice = weightedAvgUnitPrice(
        v.weightedFactPrice,
        v.volumeFact,
        [],
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
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const limited =
    limit != null && limit > 0 && rows.length > limit ? rows.slice(0, limit) : rows;

  if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
    console.log("[TMC debug] Grouped materials", limited.length);
    if (limit != null && limit > 0 && rows.length > limit) {
      console.warn(
        `[TMC debug] TOP-N обрезка: ${rows.length} → ${limited.length} (limit=${limit})`,
      );
    }
  }

  logTmcMaterialCostDynamicsDebug(limited);
  return limited;
}

export type TmcMaterialCostDynamicsMode = "byMaterial" | "byMonth" | "byPriceIndex";

export type TmcMonthlyUnitCostPoint = {
  iso: string;
  label: string;
  planUnitPrice: number;
  factUnitPrice: number;
};

export type TmcMonthlyUnitCostIndexPoint = {
  iso: string;
  label: string;
  planIndex: number;
  factIndex: number;
};

export type TmcUnitCostMonthlySummary = {
  avgPlanUnitPrice: number;
  avgFactUnitPrice: number;
  deviationPct: number;
};

export type TmcUnitCostIndexSummary = {
  maxGrowthPct: number;
  maxDeclinePct: number;
  avgChangePct: number;
  increaseCount: number;
  decreaseCount: number;
};

export type TmcPriceIndexPeriod = "whole" | "lastMonth";

export type TmcPriceIndexSortMode = "byAlphabet" | "byChange";

export type TmcPriceHeatmapCellTone = "empty" | "neutral" | "up" | "down";

export type TmcPriceHeatmapCell = {
  monthKey: string;
  price: number | null;
  changePct: number | null;
  tone: TmcPriceHeatmapCellTone;
  previousMonthKey: string | null;
  previousMonthPrice: number | null;
};

export type TmcPriceHeatmapMaterialRow = {
  name: string;
  shortLabel: string;
  cells: TmcPriceHeatmapCell[];
};

export type TmcPriceHeatmapMonth = {
  monthKey: string;
  label: string;
  labelLong: string;
};

export type TmcMaterialPriceHeatmapDataset = {
  months: TmcPriceHeatmapMonth[];
  rows: TmcPriceHeatmapMaterialRow[];
  maxGrowthPct: number;
  maxGrowthMaterial: string;
  maxGrowthMonthsLabel: string | null;
  maxDeclinePct: number;
  maxDeclineMaterial: string;
  maxDeclineMonthsLabel: string | null;
};

export type TmcMaterialPriceIndexCurrentTone = "neutral" | "up" | "down";

export type TmcMaterialPriceIndexRow = {
  name: string;
  shortLabel: string;
  planPrice: number;
  previousMonthPrice: number;
  currentMonthPrice: number;
  previousMonthKey: string | null;
  currentMonthKey: string;
  previousMonthLabel: string | null;
  currentMonthLabel: string;
  hasPreviousMonth: boolean;
  changePct: number | null;
  currentTone: TmcMaterialPriceIndexCurrentTone;
};

export type TmcMaterialPriceIndexDataset = {
  rows: TmcMaterialPriceIndexRow[];
  maxGrowthPct: number;
  maxGrowthMaterial: string;
  maxGrowthMonthsLabel: string | null;
  maxDeclinePct: number;
  maxDeclineMaterial: string;
  maxDeclineMonthsLabel: string | null;
};

export type TmcMaterialPriceChangeRow = {
  name: string;
  shortLabel: string;
  changePct: number;
};

export type TmcMaterialPriceChangeRanking = {
  rows: TmcMaterialPriceChangeRow[];
  maxGrowthPct: number;
  maxGrowthMaterial: string;
  maxDeclinePct: number;
  maxDeclineMaterial: string;
  avgChangePct: number;
  hasSignificantChange: boolean;
};

const TMC_PRICE_CHANGE_TOP_N = 10;
const TMC_PRICE_CHANGE_MIN_ABS_PCT = 0.1;

/** Цвет линии фактического индекса цены на графике. */
export function tmcUnitCostIndexColor(index: number): string {
  if (!Number.isFinite(index) || index <= 0) return "#22c55e";
  if (index >= 95 && index <= 105) return "#22c55e";
  if ((index > 105 && index <= 120) || (index >= 80 && index < 95)) return "#f59e0b";
  return "#ef4444";
}

function monthlyWeightedUnitPrice(weightedPriceVolumeSum: number, totalVolume: number): number {
  if (totalVolume > 0 && weightedPriceVolumeSum > 0) {
    return Math.round((weightedPriceVolumeSum / totalVolume) * 100) / 100;
  }
  return 0;
}

/**
 * Помесячная динамика стоимости единицы ТМЦ: план — supplyPlanDate, факт — supplyFactDate.
 * Вес средневзвешенной цены — объём поставки (volumePlan / volumeFact).
 */
export function buildTmcMonthlyUnitCostSeries(items: TMCItem[]): TmcMonthlyUnitCostPoint[] {
  type MonthBucket = {
    weightedPlanPrice: number;
    planVolume: number;
    weightedFactPrice: number;
    factVolume: number;
  };

  const byMonth = new Map<string, MonthBucket>();

  const getBucket = (mk: string): MonthBucket => {
    const existing = byMonth.get(mk);
    if (existing) return existing;
    const bucket: MonthBucket = {
      weightedPlanPrice: 0,
      planVolume: 0,
      weightedFactPrice: 0,
      factVolume: 0,
    };
    byMonth.set(mk, bucket);
    return bucket;
  };

  for (const item of items) {
    const planDate = item.supplyPlanDate?.trim() || null;
    if (planDate) {
      const mk = planDate.slice(0, 7);
      const bucket = getBucket(mk);
      const volume = item.volumePlan;
      if (volume > 0 && item.pricePlan > 0) {
        bucket.weightedPlanPrice += item.pricePlan * volume;
        bucket.planVolume += volume;
      }
    }

    const factDate = item.supplyFactDate?.trim() || null;
    if (factDate) {
      const mk = factDate.slice(0, 7);
      const bucket = getBucket(mk);
      const volume = item.volumeFact;
      if (volume > 0 && item.priceFact > 0) {
        bucket.weightedFactPrice += item.priceFact * volume;
        bucket.factVolume += volume;
      }
    }
  }

  if (byMonth.size === 0) return [];

  const sorted = [...byMonth.keys()].sort();
  const start = monthStartFromIso(`${sorted[0]}-01`);
  const end = monthStartFromIso(`${sorted[sorted.length - 1]}-01`);
  const points: TmcMonthlyUnitCostPoint[] = [];
  let cursor = start;

  while (cursor.getTime() <= end.getTime()) {
    const iso = cursor.toISOString().slice(0, 10);
    const mk = iso.slice(0, 7);
    const bucket = byMonth.get(mk);
    points.push({
      iso,
      label: monthLabelRu(cursor),
      planUnitPrice: bucket
        ? monthlyWeightedUnitPrice(bucket.weightedPlanPrice, bucket.planVolume)
        : 0,
      factUnitPrice: bucket
        ? monthlyWeightedUnitPrice(bucket.weightedFactPrice, bucket.factVolume)
        : 0,
    });
    cursor = addMonths(cursor, 1);
  }

  return points;
}

/** Выравнивание динамики стоимости единицы по оси X графика «Динамика закупок». */
export function alignTmcMonthlyUnitCostToTimeline(
  series: TmcMonthlyUnitCostPoint[],
  referenceTimeline: TmcMonthlyProcurementPoint[],
): TmcMonthlyUnitCostPoint[] {
  if (referenceTimeline.length === 0) return series;

  const byMonth = new Map(series.map((p) => [p.iso.slice(0, 7), p]));

  return referenceTimeline.map((ref) => {
    const mk = ref.iso.slice(0, 7);
    const existing = byMonth.get(mk);
    return {
      iso: ref.iso,
      label: ref.label,
      planUnitPrice: existing?.planUnitPrice ?? 0,
      factUnitPrice: existing?.factUnitPrice ?? 0,
    };
  });
}

/** Сводные средние цены за единицу для режима «По месяцам». */
export function computeTmcUnitCostMonthlySummary(items: TMCItem[]): TmcUnitCostMonthlySummary {
  let weightedPlanPrice = 0;
  let planVolume = 0;
  let weightedFactPrice = 0;
  let factVolume = 0;

  for (const item of items) {
    if (item.supplyPlanDate?.trim() && item.volumePlan > 0 && item.pricePlan > 0) {
      weightedPlanPrice += item.pricePlan * item.volumePlan;
      planVolume += item.volumePlan;
    }
    if (item.supplyFactDate?.trim() && item.volumeFact > 0 && item.priceFact > 0) {
      weightedFactPrice += item.priceFact * item.volumeFact;
      factVolume += item.volumeFact;
    }
  }

  const avgPlanUnitPrice = monthlyWeightedUnitPrice(weightedPlanPrice, planVolume);
  const avgFactUnitPrice = monthlyWeightedUnitPrice(weightedFactPrice, factVolume);
  const deviationRub = avgFactUnitPrice - avgPlanUnitPrice;
  const deviationPct =
    avgPlanUnitPrice > 0 ? Math.round((deviationRub / avgPlanUnitPrice) * 1000) / 10 : 0;

  return { avgPlanUnitPrice, avgFactUnitPrice, deviationPct };
}

type TmcMaterialMonthlyPriceBucket = {
  weightedPlanPrice: number;
  planVolume: number;
  weightedFactPrice: number;
  factVolume: number;
};

function getTmcMaterialMonthlyPriceBucket(
  map: Map<string, TmcMaterialMonthlyPriceBucket>,
  monthKey: string,
): TmcMaterialMonthlyPriceBucket {
  const existing = map.get(monthKey);
  if (existing) return existing;
  const bucket: TmcMaterialMonthlyPriceBucket = {
    weightedPlanPrice: 0,
    planVolume: 0,
    weightedFactPrice: 0,
    factVolume: 0,
  };
  map.set(monthKey, bucket);
  return bucket;
}

/** Помесячные цены за единицу по наименованию ТМЦ (план / факт поставки). */
function buildTmcMaterialMonthlyUnitPrices(
  items: TMCItem[],
): Map<string, Map<string, { planUnitPrice: number; factUnitPrice: number }>> {
  const byMaterial = new Map<string, Map<string, TmcMaterialMonthlyPriceBucket>>();

  for (const item of items) {
    const name = item.name.trim() || "Без наименования";
    const months = byMaterial.get(name) ?? new Map<string, TmcMaterialMonthlyPriceBucket>();
    byMaterial.set(name, months);

    const planDate = item.supplyPlanDate?.trim() || null;
    if (planDate) {
      const bucket = getTmcMaterialMonthlyPriceBucket(months, planDate.slice(0, 7));
      const planUnitPrice = resolveTmcItemPlanUnitPrice(item);
      if (item.volumePlan > 0 && planUnitPrice > 0) {
        bucket.weightedPlanPrice += planUnitPrice * item.volumePlan;
        bucket.planVolume += item.volumePlan;
      }
    }

    const factDate = item.supplyFactDate?.trim() || null;
    if (factDate) {
      const bucket = getTmcMaterialMonthlyPriceBucket(months, factDate.slice(0, 7));
      const factUnitPrice = resolveTmcItemFactUnitPrice(item);
      if (item.volumeFact > 0 && factUnitPrice > 0) {
        bucket.weightedFactPrice += factUnitPrice * item.volumeFact;
        bucket.factVolume += item.volumeFact;
      }
    }
  }

  const result = new Map<string, Map<string, { planUnitPrice: number; factUnitPrice: number }>>();

  for (const [name, months] of byMaterial.entries()) {
    const prices = new Map<string, { planUnitPrice: number; factUnitPrice: number }>();
    for (const [monthKey, bucket] of months.entries()) {
      prices.set(monthKey, {
        planUnitPrice: monthlyWeightedUnitPrice(
          bucket.weightedPlanPrice,
          bucket.planVolume,
        ),
        factUnitPrice: monthlyWeightedUnitPrice(
          bucket.weightedFactPrice,
          bucket.factVolume,
        ),
      });
    }
    result.set(name, prices);
  }

  return result;
}

function roundUnitCostIndexPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function buildMaterialUnitPriceIndexSeries(
  monthlyPrices: Map<string, { planUnitPrice: number; factUnitPrice: number }>,
  kind: "plan" | "fact",
  timelineMonthKeys: string[],
): number[] {
  const priceKey = kind === "plan" ? "planUnitPrice" : "factUnitPrice";
  const sortedMonths = [...monthlyPrices.entries()]
    .filter(([, prices]) => prices[priceKey] > 0)
    .map(([monthKey]) => monthKey)
    .sort();

  if (sortedMonths.length === 0) {
    return timelineMonthKeys.map(() => 0);
  }

  const baseMonth = sortedMonths[0]!;
  const basePrice = monthlyPrices.get(baseMonth)?.[priceKey] ?? 0;
  if (basePrice <= 0) {
    return timelineMonthKeys.map(() => 0);
  }

  return timelineMonthKeys.map((monthKey) => {
    const price = monthlyPrices.get(monthKey)?.[priceKey] ?? 0;
    if (price <= 0) return 0;
    return roundUnitCostIndexPct((price / basePrice) * 100);
  });
}

function averagePositiveIndices(indices: number[]): number {
  const valid = indices.filter((value) => value > 0);
  if (valid.length === 0) return 0;
  const sum = valid.reduce((acc, value) => acc + value, 0);
  return roundUnitCostIndexPct(sum / valid.length);
}

/**
 * Помесячный индекс цены: для каждого ТМЦ базовый месяц = первое появление,
 * затем среднее по материалам (без смешивания абсолютных цен разных ТМЦ).
 */
export function buildTmcMonthlyUnitCostIndexSeries(
  items: TMCItem[],
  referenceTimeline: TmcMonthlyProcurementPoint[],
): TmcMonthlyUnitCostIndexPoint[] {
  if (referenceTimeline.length === 0) return [];

  const timelineMonthKeys = referenceTimeline.map((point) => point.iso.slice(0, 7));
  const materialPrices = buildTmcMaterialMonthlyUnitPrices(items);
  const planIndicesByMonth = timelineMonthKeys.map(() => [] as number[]);
  const factIndicesByMonth = timelineMonthKeys.map(() => [] as number[]);

  for (const monthlyPrices of materialPrices.values()) {
    const planSeries = buildMaterialUnitPriceIndexSeries(monthlyPrices, "plan", timelineMonthKeys);
    const factSeries = buildMaterialUnitPriceIndexSeries(monthlyPrices, "fact", timelineMonthKeys);

    planSeries.forEach((value, index) => {
      if (value > 0) planIndicesByMonth[index]!.push(value);
    });
    factSeries.forEach((value, index) => {
      if (value > 0) factIndicesByMonth[index]!.push(value);
    });
  }

  return referenceTimeline.map((point, index) => ({
    iso: point.iso,
    label: point.label,
    planIndex: averagePositiveIndices(planIndicesByMonth[index] ?? []),
    factIndex: averagePositiveIndices(factIndicesByMonth[index] ?? []),
  }));
}

/** Сводная аналитика индекса цены по группам ТМЦ (факт). */
export function computeTmcUnitCostIndexSummary(
  items: TMCItem[],
  referenceTimeline: TmcMonthlyProcurementPoint[],
): TmcUnitCostIndexSummary {
  if (referenceTimeline.length === 0) {
    return {
      maxGrowthPct: 0,
      maxDeclinePct: 0,
      avgChangePct: 0,
      increaseCount: 0,
      decreaseCount: 0,
    };
  }

  const timelineMonthKeys = referenceTimeline.map((point) => point.iso.slice(0, 7));
  const materialPrices = buildTmcMaterialMonthlyUnitPrices(items);

  let maxGrowthPct = 0;
  let maxDeclinePct = 0;
  let changeSum = 0;
  let changeCount = 0;
  let increaseCount = 0;
  let decreaseCount = 0;

  for (const monthlyPrices of materialPrices.values()) {
    const factSeries = buildMaterialUnitPriceIndexSeries(monthlyPrices, "fact", timelineMonthKeys);
    const valid = factSeries.filter((value) => value > 0);
    if (valid.length === 0) continue;

    const peak = Math.max(...valid);
    const trough = Math.min(...valid);
    const last = valid[valid.length - 1]!;

    maxGrowthPct = Math.max(maxGrowthPct, peak - 100);
    if (trough < 100) {
      maxDeclinePct = Math.max(maxDeclinePct, 100 - trough);
    }

    const change = last - 100;
    changeSum += change;
    changeCount += 1;
    if (change > 0) increaseCount += 1;
    else if (change < 0) decreaseCount += 1;
  }

  const avgChangePct =
    changeCount > 0 ? roundUnitCostIndexPct(changeSum / changeCount) : 0;

  return {
    maxGrowthPct: roundUnitCostIndexPct(maxGrowthPct),
    maxDeclinePct: roundUnitCostIndexPct(maxDeclinePct),
    avgChangePct,
    increaseCount,
    decreaseCount,
  };
}

function getMaterialFactPriceSeries(
  monthlyPrices: Map<string, { planUnitPrice: number; factUnitPrice: number }>,
): Array<{ monthKey: string; price: number }> {
  return [...monthlyPrices.entries()]
    .filter(([, prices]) => prices.factUnitPrice > 0)
    .map(([monthKey, prices]) => ({ monthKey, price: prices.factUnitPrice }))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function materialFactPriceChangePct(
  series: Array<{ monthKey: string; price: number }>,
  period: TmcPriceIndexPeriod,
): number | null {
  if (series.length < 2) return null;

  if (period === "whole") {
    const first = series[0]!.price;
    const last = series[series.length - 1]!.price;
    if (first <= 0) return null;
    return roundUnitCostIndexPct(((last - first) / first) * 100);
  }

  const last = series[series.length - 1]!;
  const prev = series[series.length - 2]!;
  if (prev.price <= 0) return null;
  return roundUnitCostIndexPct(((last.price - prev.price) / prev.price) * 100);
}

const EMPTY_PRICE_CHANGE_RANKING: TmcMaterialPriceChangeRanking = {
  rows: [],
  maxGrowthPct: 0,
  maxGrowthMaterial: "—",
  maxDeclinePct: 0,
  maxDeclineMaterial: "—",
  avgChangePct: 0,
  hasSignificantChange: false,
};

/**
 * Рейтинг материалов по изменению фактической цены за единицу (ТОП-10 по |Δ%|).
 * whole — (последняя − первая) / первая; lastMonth — (текущий − предыдущий) / предыдущий.
 */
export function computeTmcMaterialPriceChangeRanking(
  items: TMCItem[],
  period: TmcPriceIndexPeriod = "whole",
): TmcMaterialPriceChangeRanking {
  const materialPrices = buildTmcMaterialMonthlyUnitPrices(items);
  const changes: TmcMaterialPriceChangeRow[] = [];

  for (const [name, monthlyPrices] of materialPrices.entries()) {
    const series = getMaterialFactPriceSeries(monthlyPrices);
    const changePct = materialFactPriceChangePct(series, period);
    if (changePct == null || Math.abs(changePct) < TMC_PRICE_CHANGE_MIN_ABS_PCT) continue;
    changes.push({
      name,
      shortLabel: truncateTmcMaterialLabel(name),
      changePct,
    });
  }

  if (changes.length === 0) {
    return EMPTY_PRICE_CHANGE_RANKING;
  }

  const sorted = [...changes].sort(
    (a, b) => Math.abs(b.changePct) - Math.abs(a.changePct) || b.changePct - a.changePct,
  );
  const rows = sorted.slice(0, TMC_PRICE_CHANGE_TOP_N);

  let maxGrowthPct = 0;
  let maxGrowthMaterial = "—";
  let maxDeclinePct = 0;
  let maxDeclineMaterial = "—";
  let changeSum = 0;

  for (const row of changes) {
    changeSum += row.changePct;
    if (row.changePct > maxGrowthPct) {
      maxGrowthPct = row.changePct;
      maxGrowthMaterial = row.name;
    }
    if (row.changePct < maxDeclinePct) {
      maxDeclinePct = row.changePct;
      maxDeclineMaterial = row.name;
    }
  }

  return {
    rows,
    maxGrowthPct: roundUnitCostIndexPct(maxGrowthPct),
    maxGrowthMaterial,
    maxDeclinePct: roundUnitCostIndexPct(maxDeclinePct),
    maxDeclineMaterial,
    avgChangePct: roundUnitCostIndexPct(changeSum / changes.length),
    hasSignificantChange: true,
  };
}

function formatMonthKeyLabel(monthKey: string): string {
  return monthLabelRu(monthStartFromIso(`${monthKey}-01`));
}

/** Подпись месяца для режима «Индекс цены»: «Апрель 2026». */
export function formatTmcMonthKeyLabelLong(monthKey: string): string {
  const d = monthStartFromIso(`${monthKey}-01`);
  const month = d.toLocaleDateString("ru-RU", { month: "long" });
  const capitalized = month.charAt(0).toUpperCase() + month.slice(1);
  return `${capitalized} ${d.getFullYear()}`;
}

function formatTmcMonthTransitionLabel(fromMonthKey: string, toMonthKey: string): string {
  return `${formatTmcMonthKeyLabelLong(fromMonthKey)} → ${formatTmcMonthKeyLabelLong(toMonthKey)}`;
}

type TmcMaterialFactDeliveryMonth = {
  monthKey: string;
  price: number;
  latestDate: string;
};

/**
 * Месяцы для «Индекс цены»: только реальные месяцы поставки из CSV/реестра,
 * без заполнения пропусков и без будущих месяцев.
 */
export function collectTmcPriceIndexMonthKeys(
  items: TMCItem[],
  today: Date = new Date(),
): string[] {
  const todayMonth = today.toISOString().slice(0, 7);
  const monthKeys = new Set<string>();

  for (const item of items) {
    const factDate = item.supplyFactDate?.trim();
    if (!factDate) continue;
    const monthKey = factDate.slice(0, 7);
    if (monthKey > todayMonth) continue;
    if (resolveTmcItemFactUnitPrice(item) > 0 || item.volumeFact > 0) {
      monthKeys.add(monthKey);
    }
  }

  return [...monthKeys].sort();
}

/** Ось X матрицы «Индекс цены» — только месяцы с фактическими поставками. */
export function buildTmcPriceIndexTimeline(
  items: TMCItem[],
  today: Date = new Date(),
): TmcMonthlyProcurementPoint[] {
  return collectTmcPriceIndexMonthKeys(items, today).map((monthKey) => {
    const cursor = monthStartFromIso(`${monthKey}-01`);
    return {
      iso: `${monthKey}-01`,
      label: monthLabelRu(cursor),
      planMln: 0,
      factMln: 0,
      planCumMln: 0,
      factCumMln: 0,
    };
  });
}

export type TmcDataPipelineDiagnostics = {
  source: "editor" | "presentation" | "analytics";
  recordCount: number;
  totalPlanCostRub: number;
  totalFactCostRub: number;
  supplyMonthKeys: string[];
  scope?: string;
};

export function computeTmcDataDiagnostics(
  items: TMCItem[],
  source: TmcDataPipelineDiagnostics["source"],
  scope?: string,
): TmcDataPipelineDiagnostics {
  const supplyMonthKeys = new Set<string>();
  let totalPlanCostRub = 0;
  let totalFactCostRub = 0;

  for (const item of items) {
    totalPlanCostRub += item.planCost > 0 ? item.planCost : item.totalPlan > 0 ? item.totalPlan : 0;
    totalFactCostRub += tmcItemFactCostRub(item);
    if (item.supplyFactDate?.trim()) supplyMonthKeys.add(item.supplyFactDate.slice(0, 7));
    if (item.supplyPlanDate?.trim()) supplyMonthKeys.add(item.supplyPlanDate.slice(0, 7));
  }

  return {
    source,
    recordCount: items.length,
    totalPlanCostRub,
    totalFactCostRub,
    supplyMonthKeys: [...supplyMonthKeys].sort(),
    scope,
  };
}

/** Временная диагностика цепочки CSV → editor → presentation → analytics. */
export function logTmcDataPipelineDiagnostics(diagnostics: TmcDataPipelineDiagnostics): void {
  console.log(`[TMC debug] records in ${diagnostics.source}:`, diagnostics.recordCount, {
    totalPlanCostRub: diagnostics.totalPlanCostRub,
    totalFactCostRub: diagnostics.totalFactCostRub,
    supplyMonths: diagnostics.supplyMonthKeys,
    scope: diagnostics.scope ?? "all",
  });
}

/** Помесячные фактические цены за единицу по всем поставкам материала (supplyFactDate). */
function buildMaterialFactDeliveryMonths(
  items: TMCItem[],
  materialName: string,
): TmcMaterialFactDeliveryMonth[] {
  type MonthBucket = { weighted: number; vol: number; latestDate: string };
  const byMonth = new Map<string, MonthBucket>();

  for (const item of items) {
    const name = item.name.trim() || "Без наименования";
    if (name !== materialName) continue;

    const factDate = item.supplyFactDate?.trim();
    if (!factDate) continue;

    const unitPrice = resolveTmcItemFactUnitPrice(item);
    if (unitPrice <= 0) continue;

    const monthKey = factDate.slice(0, 7);
    const volume = item.volumeFact > 0 ? item.volumeFact : 1;
    const bucket = byMonth.get(monthKey) ?? { weighted: 0, vol: 0, latestDate: factDate };
    bucket.weighted += unitPrice * volume;
    bucket.vol += volume;
    if (factDate > bucket.latestDate) bucket.latestDate = factDate;
    byMonth.set(monthKey, bucket);
  }

  return [...byMonth.entries()]
    .map(([monthKey, bucket]) => ({
      monthKey,
      price: monthlyWeightedUnitPrice(bucket.weighted, bucket.vol),
      latestDate: bucket.latestDate,
    }))
    .filter((entry) => entry.price > 0)
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function computeMaterialPlanUnitPrice(items: TMCItem[], materialName: string): number {
  let weightedPlanPrice = 0;
  let planVolume = 0;

  for (const item of items) {
    const name = item.name.trim() || "Без наименования";
    if (name !== materialName) continue;
    const planUnitPrice = resolveTmcItemPlanUnitPrice(item);
    if (item.volumePlan > 0 && planUnitPrice > 0) {
      weightedPlanPrice += planUnitPrice * item.volumePlan;
      planVolume += item.volumePlan;
    }
  }

  return monthlyWeightedUnitPrice(weightedPlanPrice, planVolume);
}

function resolveMaterialPriceIndexCurrentTone(
  changePct: number | null,
): TmcMaterialPriceIndexCurrentTone {
  if (changePct == null) return "neutral";
  if (changePct > 10) return "up";
  if (changePct < -10) return "down";
  return "neutral";
}

const EMPTY_MATERIAL_PRICE_INDEX_DATASET: TmcMaterialPriceIndexDataset = {
  rows: [],
  maxGrowthPct: 0,
  maxGrowthMaterial: "—",
  maxGrowthMonthsLabel: null,
  maxDeclinePct: 0,
  maxDeclineMaterial: "—",
  maxDeclineMonthsLabel: null,
};

const EMPTY_MATERIAL_PRICE_HEATMAP_DATASET: TmcMaterialPriceHeatmapDataset = {
  months: [],
  rows: [],
  maxGrowthPct: 0,
  maxGrowthMaterial: "—",
  maxGrowthMonthsLabel: null,
  maxDeclinePct: 0,
  maxDeclineMaterial: "—",
  maxDeclineMonthsLabel: null,
};

const TMC_PRICE_HEATMAP_MIN_CHANGE_PCT = 0.1;

function resolveHeatmapCellTone(changePct: number | null): TmcPriceHeatmapCellTone {
  if (changePct == null) return "neutral";
  if (changePct > TMC_PRICE_HEATMAP_MIN_CHANGE_PCT) return "up";
  if (changePct < -TMC_PRICE_HEATMAP_MIN_CHANGE_PCT) return "down";
  return "neutral";
}

function heatmapRowSortChangeKey(row: TmcPriceHeatmapMaterialRow): number {
  let max = Number.NEGATIVE_INFINITY;
  for (const cell of row.cells) {
    if (cell.changePct != null && Number.isFinite(cell.changePct)) {
      max = Math.max(max, cell.changePct);
    }
  }
  return max;
}

/**
 * Три столбца на материал: план, пред. месяц поставки, тек. месяц поставки (факт).
 * Сортировка — по текущей цене или по Δ% между двумя последними месяцами поставок.
 */
export function computeTmcMaterialPriceIndexBars(
  items: TMCItem[],
  sortMode: TmcPriceIndexSortMode = "byAlphabet",
  limit = TMC_MATERIAL_PLAN_FACT_TOP_N,
): TmcMaterialPriceIndexDataset {
  const materialNames = new Set<string>();
  for (const item of items) {
    if (item.supplyFactDate?.trim()) {
      materialNames.add(item.name.trim() || "Без наименования");
    }
  }

  const rows: TmcMaterialPriceIndexRow[] = [];

  for (const name of materialNames) {
    const deliveryMonths = buildMaterialFactDeliveryMonths(items, name);
    if (deliveryMonths.length === 0) continue;

    const currentEntry = deliveryMonths[deliveryMonths.length - 1]!;
    const prevEntry =
      deliveryMonths.length >= 2 ? deliveryMonths[deliveryMonths.length - 2]! : null;
    const currentMonthPrice = currentEntry.price;
    if (currentMonthPrice <= 0) continue;

    const planPrice = computeMaterialPlanUnitPrice(items, name);
    const hasPreviousMonth = prevEntry != null && prevEntry.price > 0;
    const previousMonthPrice = hasPreviousMonth ? prevEntry!.price : 0;

    let changePct: number | null = null;
    if (hasPreviousMonth) {
      changePct = roundUnitCostIndexPct(
        ((currentMonthPrice - previousMonthPrice) / previousMonthPrice) * 100,
      );
    }

    rows.push({
      name,
      shortLabel: truncateTmcMaterialLabel(name),
      planPrice,
      previousMonthPrice,
      currentMonthPrice,
      previousMonthKey: hasPreviousMonth ? prevEntry!.monthKey : null,
      currentMonthKey: currentEntry.monthKey,
      previousMonthLabel: hasPreviousMonth
        ? formatTmcMonthKeyLabelLong(prevEntry!.monthKey)
        : null,
      currentMonthLabel: formatTmcMonthKeyLabelLong(currentEntry.monthKey),
      hasPreviousMonth,
      changePct,
      currentTone: resolveMaterialPriceIndexCurrentTone(changePct),
    });
  }

  if (rows.length === 0) {
    return EMPTY_MATERIAL_PRICE_INDEX_DATASET;
  }

  let maxGrowthPct = 0;
  let maxGrowthMaterial = "—";
  let maxGrowthMonthsLabel: string | null = null;
  let maxDeclinePct = 0;
  let maxDeclineMaterial = "—";
  let maxDeclineMonthsLabel: string | null = null;

  for (const row of rows) {
    if (row.changePct == null || !row.hasPreviousMonth) continue;

    const monthsLabel =
      row.previousMonthKey && row.currentMonthKey
        ? formatTmcMonthTransitionLabel(row.previousMonthKey, row.currentMonthKey)
        : null;

    if (row.changePct > maxGrowthPct) {
      maxGrowthPct = row.changePct;
      maxGrowthMaterial = row.name;
      maxGrowthMonthsLabel = monthsLabel;
    }
    if (row.changePct < maxDeclinePct) {
      maxDeclinePct = row.changePct;
      maxDeclineMaterial = row.name;
      maxDeclineMonthsLabel = monthsLabel;
    }
  }

  const sorted = [...rows].sort((a, b) => {
    if (sortMode === "byChange") {
      const aChange = a.changePct ?? Number.NEGATIVE_INFINITY;
      const bChange = b.changePct ?? Number.NEGATIVE_INFINITY;
      return bChange - aChange;
    }
    return a.name.localeCompare(b.name, "ru");
  });

  return {
    rows: sorted.slice(0, limit),
    maxGrowthPct: roundUnitCostIndexPct(maxGrowthPct),
    maxGrowthMaterial,
    maxGrowthMonthsLabel,
    maxDeclinePct: roundUnitCostIndexPct(maxDeclinePct),
    maxDeclineMaterial,
    maxDeclineMonthsLabel,
  };
}

/**
 * Матрица фактических цен за единицу ТМЦ по месяцам поставок (тепловая карта).
 */
export function computeTmcMaterialPriceHeatmap(
  items: TMCItem[],
  referenceTimeline: TmcMonthlyProcurementPoint[],
  sortMode: TmcPriceIndexSortMode = "byAlphabet",
  limit = TMC_MATERIAL_PLAN_FACT_TOP_N,
): TmcMaterialPriceHeatmapDataset {
  const months: TmcPriceHeatmapMonth[] = referenceTimeline.map((point) => {
    const monthKey = point.iso.slice(0, 7);
    return {
      monthKey,
      label: point.label,
      labelLong: formatTmcMonthKeyLabelLong(monthKey),
    };
  });

  if (months.length === 0) {
    return EMPTY_MATERIAL_PRICE_HEATMAP_DATASET;
  }

  const materialNames = new Set<string>();
  for (const item of items) {
    if (item.supplyFactDate?.trim()) {
      materialNames.add(item.name.trim() || "Без наименования");
    }
  }

  const heatmapRows: TmcPriceHeatmapMaterialRow[] = [];
  let maxGrowthPct = 0;
  let maxGrowthMaterial = "—";
  let maxGrowthMonthsLabel: string | null = null;
  let maxDeclinePct = 0;
  let maxDeclineMaterial = "—";
  let maxDeclineMonthsLabel: string | null = null;

  for (const name of materialNames) {
    const deliveryByMonth = new Map(
      buildMaterialFactDeliveryMonths(items, name).map((entry) => [entry.monthKey, entry.price]),
    );
    if (deliveryByMonth.size === 0) continue;

    const cells: TmcPriceHeatmapCell[] = [];
    let previousPrice: number | null = null;
    let previousMonthKey: string | null = null;

    for (const month of months) {
      const price = deliveryByMonth.get(month.monthKey) ?? null;

      if (price == null || price <= 0) {
        cells.push({
          monthKey: month.monthKey,
          price: null,
          changePct: null,
          tone: "empty",
          previousMonthKey: null,
          previousMonthPrice: null,
        });
        continue;
      }

      let changePct: number | null = null;
      if (previousPrice != null && previousPrice > 0) {
        changePct = roundUnitCostIndexPct(((price - previousPrice) / previousPrice) * 100);
        const monthsLabel =
          previousMonthKey != null
            ? formatTmcMonthTransitionLabel(previousMonthKey, month.monthKey)
            : null;

        if (changePct > maxGrowthPct) {
          maxGrowthPct = changePct;
          maxGrowthMaterial = name;
          maxGrowthMonthsLabel = monthsLabel;
        }
        if (changePct < maxDeclinePct) {
          maxDeclinePct = changePct;
          maxDeclineMaterial = name;
          maxDeclineMonthsLabel = monthsLabel;
        }
      }

      cells.push({
        monthKey: month.monthKey,
        price,
        changePct,
        tone: resolveHeatmapCellTone(changePct),
        previousMonthKey,
        previousMonthPrice: previousPrice,
      });

      previousPrice = price;
      previousMonthKey = month.monthKey;
    }

    heatmapRows.push({
      name,
      shortLabel: truncateTmcMaterialLabel(name),
      cells,
    });
  }

  if (heatmapRows.length === 0) {
    return { ...EMPTY_MATERIAL_PRICE_HEATMAP_DATASET, months };
  }

  const sorted = [...heatmapRows].sort((a, b) => {
    if (sortMode === "byChange") {
      return heatmapRowSortChangeKey(b) - heatmapRowSortChangeKey(a);
    }
    return a.name.localeCompare(b.name, "ru");
  });

  return {
    months,
    rows: sorted.slice(0, limit),
    maxGrowthPct: roundUnitCostIndexPct(maxGrowthPct),
    maxGrowthMaterial,
    maxGrowthMonthsLabel,
    maxDeclinePct: roundUnitCostIndexPct(maxDeclinePct),
    maxDeclineMaterial,
    maxDeclineMonthsLabel,
  };
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

/** Сегмент компактной KPI donut-диаграммы. */
export type TmcKpiDonutSegment = {
  label: string;
  value: number;
  color: string;
};

export const TMC_KPI_DONUT_COLORS = {
  deliveredOnTime: "#22c55e",
  deliveredLate: "#ef4444",
  inTransit: "#3b82f6",
  notPurchased: "#6b7280",
  risk: "#f59e0b",
  normal: "#22c55e",
  economy: "#22c55e",
  onBudget: "#3b82f6",
  overrun: "#ef4444",
  /** @deprecated используйте deliveredOnTime / deliveredLate */
  delivered: "#22c55e",
  overdue: "#ef4444",
} as const;

/** Взаимоисключающий сегмент воронки поставки (KPI «Поставлено» по всем позициям). */
export type TmcDeliveryPipelineBucket =
  | "deliveredOnTime"
  | "deliveredLate"
  | "inTransit"
  | "notPurchased";

/** Сегмент donut «Поставлено» — только среди закупленных позиций (KPI «Закуплено»). */
export type TmcPurchasedDeliveryBucket =
  | "deliveredOnTime"
  | "deliveredLate"
  | "inTransit"
  | "cancelled";

export type TmcDeliveryPipelineCounts = {
  total: number;
  deliveredOnTime: number;
  deliveredLate: number;
  inTransit: number;
  notPurchased: number;
  /** Поставлено = вовремя + с опозданием (совпадает с KPI карточки). */
  deliveredKpi: number;
  donutSum: number;
};

export type TmcPurchasedDeliveryDonutCounts = {
  /** KPI «Закуплено» — isTmcPurchasedPosition. */
  purchasedTotal: number;
  deliveredOnTime: number;
  deliveredLate: number;
  inTransit: number;
  cancelled: number;
  donutSum: number;
};

/** Фактическая дата поставки (не договора). */
export function hasTmcSupplyFactDate(item: TMCItem): boolean {
  return Boolean(item.supplyFactDate?.trim());
}

/** Отклонение факт − план только по датам поставки. */
export function tmcSupplyDeliveryDeviationDays(item: TMCItem): number | null {
  const plan = item.supplyPlanDate?.trim();
  const fact = item.supplyFactDate?.trim();
  if (!plan || !fact) return null;
  const p = parseIsoMs(plan);
  const f = parseIsoMs(fact);
  if (p === null || f === null) return null;
  return Math.round((f - p) / DAY_MS);
}

/** Отменено / заморожено — расширяемая проверка (в текущем enum статусов нет). */
export function isTmcCancelledOrFrozen(item: TMCItem): boolean {
  const statusRaw = String(item.status ?? "").toLowerCase();
  return statusRaw.includes("отмен") || statusRaw.includes("заморож");
}

/**
 * Donut «Поставлено»: классификация только закупленных позиций (isTmcPurchasedPosition).
 * Незакупленные позиции возвращают null и в диаграмму не попадают.
 */
export function classifyTmcPurchasedDeliveryBucket(
  item: TmcEnrichedItem,
): TmcPurchasedDeliveryBucket | null {
  if (!isTmcPurchasedPosition(item)) return null;
  if (isTmcCancelledOrFrozen(item)) return "cancelled";

  if (hasTmcSupplyFactDate(item)) {
    const deviationDays = tmcSupplyDeliveryDeviationDays(item);
    if (deviationDays !== null && deviationDays > 0) return "deliveredLate";
    return "deliveredOnTime";
  }

  return "inTransit";
}

/**
 * Классификация позиции в ровно один сегмент:
 * 1) факт поставки → вовремя (fact ≤ plan) или с опозданием (fact > plan);
 * 2) иначе факт закупки → в пути;
 * 3) иначе → не закуплено.
 */
export function classifyTmcDeliveryPipelineBucket(item: TmcEnrichedItem): TmcDeliveryPipelineBucket {
  if (isTmcDeliveryFact(item)) {
    const deviationDays = tmcDeviationDays(item);
    if (deviationDays !== null && deviationDays > 0) return "deliveredLate";
    return "deliveredOnTime";
  }
  if (hasTmcPurchaseFact(item)) return "inTransit";
  return "notPurchased";
}

/** Сводка воронки поставки; KPI «Поставлено» = deliveredKpi. */
export function computeTmcDeliveryPipelineCounts(
  items: TmcEnrichedItem[],
  options?: { logDiagnostic?: boolean },
): TmcDeliveryPipelineCounts {
  const counts: Record<TmcDeliveryPipelineBucket, number> = {
    deliveredOnTime: 0,
    deliveredLate: 0,
    inTransit: 0,
    notPurchased: 0,
  };

  for (const item of items) {
    counts[classifyTmcDeliveryPipelineBucket(item)] += 1;
  }

  const total = items.length;
  const deliveredKpi = counts.deliveredOnTime + counts.deliveredLate;
  const donutSum = deliveredKpi + counts.inTransit + counts.notPurchased;

  if (options?.logDiagnostic && process.env.NODE_ENV !== "production") {
    console.table({
      total,
      deliveredOnTime: counts.deliveredOnTime,
      deliveredLate: counts.deliveredLate,
      inTransit: counts.inTransit,
      notPurchased: counts.notPurchased,
      deliveredKpi,
      donutSum,
    });
    if (donutSum !== total) {
      console.warn("[TMC delivery pipeline] donutSum !== total", { donutSum, total });
    }
    if (deliveredKpi !== counts.deliveredOnTime + counts.deliveredLate) {
      console.warn("[TMC delivery pipeline] deliveredKpi mismatch");
    }
  }

  return {
    total,
    deliveredOnTime: counts.deliveredOnTime,
    deliveredLate: counts.deliveredLate,
    inTransit: counts.inTransit,
    notPurchased: counts.notPurchased,
    deliveredKpi,
    donutSum,
  };
}

/** Donut карточки «Поставлено»: распределение закупленных позиций (база = KPI «Закуплено»). */
export function computeTmcPurchasedDeliveryDonutCounts(
  items: TmcEnrichedItem[],
  options?: { logDiagnostic?: boolean },
): TmcPurchasedDeliveryDonutCounts {
  const counts: Record<TmcPurchasedDeliveryBucket, number> = {
    deliveredOnTime: 0,
    deliveredLate: 0,
    inTransit: 0,
    cancelled: 0,
  };

  let purchasedTotal = 0;

  for (const item of items) {
    const bucket = classifyTmcPurchasedDeliveryBucket(item);
    if (bucket === null) continue;
    purchasedTotal += 1;
    counts[bucket] += 1;
  }

  const donutSum =
    counts.deliveredOnTime + counts.deliveredLate + counts.inTransit + counts.cancelled;

  if (options?.logDiagnostic && process.env.NODE_ENV !== "production") {
    console.table({
      purchasedTotal,
      deliveredOnTime: counts.deliveredOnTime,
      deliveredLate: counts.deliveredLate,
      inTransit: counts.inTransit,
      cancelled: counts.cancelled,
      donutSum,
      purchasedKpi: purchasedTotal,
    });
    if (donutSum !== purchasedTotal) {
      console.warn("[TMC purchased delivery donut] donutSum !== purchasedTotal", {
        donutSum,
        purchasedTotal,
      });
    }
  }

  return {
    purchasedTotal,
    deliveredOnTime: counts.deliveredOnTime,
    deliveredLate: counts.deliveredLate,
    inTransit: counts.inTransit,
    cancelled: counts.cancelled,
    donutSum,
  };
}

export type TmcOverdueBreakdownKind = "supply" | "contract" | "payment" | "other";

/** Сегмент donut карточки «Просрочено» — взаимоисключающие причины проблем. */
export type TmcProblemBucket =
  | "notPurchased"
  | "overdueContract"
  | "overduePayment"
  | "overdueDelivery"
  | "overdueOther";

export type TmcProblemDonutCounts = {
  notPurchased: number;
  overdueDelivery: number;
  overdueContract: number;
  overduePayment: number;
  overdueOther: number;
  totalProblemItems: number;
  donutSum: number;
};

function tmcTodayIso(today: Date): string {
  return today.toISOString().slice(0, 10);
}

/**
 * Закупка не инициирована: нет факта закупки/договора и (нет поставщика или нет договора).
 * Поля: supplier, contract, contractFactDate, factCost.
 */
export function isTmcNotInitiatedPurchase(item: TMCItem): boolean {
  const noSupplier = !item.supplier?.trim();
  const contract = item.contract?.trim();
  const noContract = !contract || contract === "0" || contract === "-";
  const noContractFact = !item.contractFactDate?.trim();
  const noPurchaseFact = !hasTmcPurchaseFact(item);
  return noPurchaseFact && noContractFact && (noSupplier || noContract);
}

/** Плановая дата договора наступила, фактического договора нет. */
export function isTmcContractPlanOverdue(item: TMCItem, today: Date = new Date()): boolean {
  const plan = item.contractPlanDate?.trim();
  if (!plan) return false;
  if (item.contractFactDate?.trim()) return false;
  return plan <= tmcTodayIso(today);
}

/** Расширяемая проверка просрочки оплаты (paymentPlanDate / paymentFactDate при появлении в данных). */
export function isTmcOverduePaymentProblem(item: TmcEnrichedItem, today: Date = new Date()): boolean {
  type TmcWithPayment = TmcEnrichedItem & {
    paymentPlanDate?: string | null;
    paymentFactDate?: string | null;
  };
  const ext = item as TmcWithPayment;
  const plan = ext.paymentPlanDate?.trim();
  if (!plan) return false;
  if (ext.paymentFactDate?.trim()) return false;
  return plan <= tmcTodayIso(today);
}

/**
 * Просрочка поставки: закуплено, плановая дата поставки наступила,
 * факт отсутствует или позже плана.
 */
export function isTmcSupplyDeliveryOverdueProblem(
  item: TmcEnrichedItem,
  today: Date = new Date(),
): boolean {
  const purchased = isTmcPurchasedPosition(item) || hasTmcPurchaseFact(item);
  if (!purchased) return false;

  const supplyPlan = item.supplyPlanDate?.trim();
  if (!supplyPlan || supplyPlan > tmcTodayIso(today)) return false;

  if (!hasTmcSupplyFactDate(item)) return true;

  const deviationDays = tmcSupplyDeliveryDeviationDays(item);
  return deviationDays !== null && deviationDays > 0;
}

/** Позиция попадает в donut «Просрочено» (проблемный срез). */
export function isTmcProblemDonutCandidate(
  item: TmcEnrichedItem,
  today: Date = new Date(),
): boolean {
  return (
    isTmcOverduePosition(item) ||
    isTmcContractPlanOverdue(item, today) ||
    isTmcOverduePaymentProblem(item, today)
  );
}

/**
 * Классификация проблемной позиции (donut «Просрочено»).
 * Приоритет: не закуплено → договор → оплата → поставка → прочие.
 * База: KPI «Просрочено» (+ договор/оплата при появлении в данных).
 */
export function classifyTmcProblemBucket(
  item: TmcEnrichedItem,
  today: Date = new Date(),
): TmcProblemBucket | null {
  if (!isTmcProblemDonutCandidate(item, today)) return null;

  if (isTmcNotInitiatedPurchase(item) && item.traffic === "overdue_not_started") {
    return "notPurchased";
  }

  if (isTmcContractPlanOverdue(item, today)) return "overdueContract";
  if (isTmcOverduePaymentProblem(item, today)) return "overduePayment";

  if (item.traffic === "red") return "overdueDelivery";
  if (isTmcSupplyDeliveryOverdueProblem(item, today)) return "overdueDelivery";
  if (item.traffic === "overdue_not_started") return "overdueDelivery";

  return "overdueOther";
}

/** Donut карточки «Просрочено»: структура проблемных позиций. */
export function computeTmcProblemDonutCounts(
  items: TmcEnrichedItem[],
  today: Date = new Date(),
  options?: { logDiagnostic?: boolean },
): TmcProblemDonutCounts {
  const counts: Record<TmcProblemBucket, number> = {
    notPurchased: 0,
    overdueContract: 0,
    overduePayment: 0,
    overdueDelivery: 0,
    overdueOther: 0,
  };

  for (const item of items) {
    const bucket = classifyTmcProblemBucket(item, today);
    if (bucket) counts[bucket] += 1;
  }

  const totalProblemItems =
    counts.notPurchased +
    counts.overdueContract +
    counts.overduePayment +
    counts.overdueDelivery +
    counts.overdueOther;

  if (options?.logDiagnostic && process.env.NODE_ENV !== "production") {
    console.table({
      notPurchased: counts.notPurchased,
      overdueDelivery: counts.overdueDelivery,
      overdueContract: counts.overdueContract,
      overduePayment: counts.overduePayment,
      overdueOther: counts.overdueOther,
      totalProblemItems,
    });
    if (totalProblemItems !== Object.values(counts).reduce((s, n) => s + n, 0)) {
      console.warn("[TMC problem donut] segment sum mismatch");
    }
  }

  return {
    notPurchased: counts.notPurchased,
    overdueDelivery: counts.overdueDelivery,
    overdueContract: counts.overdueContract,
    overduePayment: counts.overduePayment,
    overdueOther: counts.overdueOther,
    totalProblemItems,
    donutSum: totalProblemItems,
  };
}

/**
 * @deprecated Используйте classifyTmcProblemBucket для donut «Просрочено».
 */
export function classifyTmcOverdueBreakdownKind(item: TmcEnrichedItem): TmcOverdueBreakdownKind | null {
  if (!isTmcOverduePosition(item)) return null;

  const supplyPlan = item.supplyPlanDate?.trim();
  const supplyFact = item.supplyFactDate?.trim();
  const contractPlan = item.contractPlanDate?.trim();
  const contractFact = item.contractFactDate?.trim();

  if (contractPlan && !contractFact && item.traffic === "overdue_not_started") {
    return "contract";
  }
  if (supplyPlan && !supplyFact) {
    return "supply";
  }
  if (item.traffic === "red") {
    return "supply";
  }
  return "other";
}

/** Допустимое отклонение факт/план по стоимости позиции, % (в пределах бюджета). */
export const TMC_BUDGET_ON_PLAN_TOLERANCE_PCT = 3;

/** Сегмент donut «Отклонение от закупленного» — все закупленные позиции (KPI «Закуплено»). */
export type TmcPurchasedBudgetBucket = "economy" | "onBudget" | "overrun" | "noFact";

export type TmcPurchasedBudgetDonutCounts = {
  economyCount: number;
  budgetNormalCount: number;
  overspendCount: number;
  noFactCount: number;
  totalPurchased: number;
  donutSum: number;
};

/** Отклонение факт − план по стоимости позиции, %. null — нет факта закупки. */
export function tmcItemBudgetDeviationPct(item: TMCItem): number | null {
  if (!hasTmcPurchaseFact(item)) return null;
  const plan = item.planCost;
  const fact = tmcItemFactCostRub(item);
  if (plan <= 0) return fact > 0 ? 100 : 0;
  return Math.round(((fact - plan) / plan) * 1000) / 10;
}

/**
 * Donut «Отклонение от закупленного»: классификация закупленной позиции (isTmcPurchasedPosition).
 * Приоритет: нет факта → в пределах ±3% → экономия → перерасход.
 */
export function classifyTmcPurchasedBudgetBucket(
  item: TmcEnrichedItem,
): TmcPurchasedBudgetBucket | null {
  if (!isTmcPurchasedPosition(item)) return null;

  if (!hasTmcPurchaseFact(item)) return "noFact";

  const deviationPct = tmcItemBudgetDeviationPct(item);
  if (deviationPct === null) return "noFact";

  if (Math.abs(deviationPct) <= TMC_BUDGET_ON_PLAN_TOLERANCE_PCT) return "onBudget";
  if (deviationPct < 0) return "economy";
  return "overrun";
}

/** Donut карточки «Отклонение от закупленного»: распределение закупленных позиций. */
export function computeTmcPurchasedBudgetDonutCounts(
  items: TmcEnrichedItem[],
  options?: { logDiagnostic?: boolean },
): TmcPurchasedBudgetDonutCounts {
  const counts: Record<TmcPurchasedBudgetBucket, number> = {
    economy: 0,
    onBudget: 0,
    overrun: 0,
    noFact: 0,
  };

  let totalPurchased = 0;

  for (const item of items) {
    const bucket = classifyTmcPurchasedBudgetBucket(item);
    if (bucket === null) continue;
    totalPurchased += 1;
    counts[bucket] += 1;
  }

  const economyCount = counts.economy;
  const budgetNormalCount = counts.onBudget;
  const overspendCount = counts.overrun;
  const noFactCount = counts.noFact;
  const donutSum = economyCount + budgetNormalCount + overspendCount + noFactCount;

  if (options?.logDiagnostic && process.env.NODE_ENV !== "production") {
    console.table({
      economyCount,
      budgetNormalCount,
      overspendCount,
      noFactCount,
      totalPurchased,
    });
    if (donutSum !== totalPurchased) {
      console.warn("[TMC purchased budget donut] segment sum !== totalPurchased", {
        donutSum,
        totalPurchased,
      });
    }
  }

  return {
    economyCount,
    budgetNormalCount,
    overspendCount,
    noFactCount,
    totalPurchased,
    donutSum,
  };
}

export type TmcKpiDonutDistributions = {
  deliveryStatus: TmcKpiDonutSegment[];
  overdueStructure: TmcKpiDonutSegment[];
  budgetDeviation: TmcKpiDonutSegment[];
};

const PURCHASED_DELIVERY_LABELS: Record<TmcPurchasedDeliveryBucket, string> = {
  deliveredOnTime: "Поставлено вовремя",
  deliveredLate: "Поставлено с опозданием",
  inTransit: "В пути",
  cancelled: "Отменено / заморожено",
};

const PURCHASED_DELIVERY_COLORS: Record<TmcPurchasedDeliveryBucket, string> = {
  deliveredOnTime: TMC_KPI_DONUT_COLORS.deliveredOnTime,
  deliveredLate: TMC_KPI_DONUT_COLORS.deliveredLate,
  inTransit: TMC_KPI_DONUT_COLORS.inTransit,
  cancelled: TMC_KPI_DONUT_COLORS.notPurchased,
};

function buildPurchasedDeliveryDonutSegments(
  counts: Record<TmcPurchasedDeliveryBucket, number>,
): TmcKpiDonutSegment[] {
  const order: TmcPurchasedDeliveryBucket[] = [
    "deliveredOnTime",
    "deliveredLate",
    "inTransit",
    "cancelled",
  ];
  return order
    .filter((key) => key !== "cancelled" || counts.cancelled > 0)
    .map((key) => ({
      label: PURCHASED_DELIVERY_LABELS[key],
      value: counts[key],
      color: PURCHASED_DELIVERY_COLORS[key],
    }));
}
const PROBLEM_DONUT_LABELS: Record<TmcProblemBucket, string> = {
  notPurchased: "Не закуплено",
  overdueDelivery: "Просрочено по поставке",
  overdueContract: "Просрочено по договору",
  overduePayment: "Просрочено по оплате",
  overdueOther: "Прочие",
};

const PROBLEM_DONUT_COLORS: Record<TmcProblemBucket, string> = {
  notPurchased: TMC_KPI_DONUT_COLORS.notPurchased,
  overdueDelivery: TMC_KPI_DONUT_COLORS.overdue,
  overdueContract: "#dc2626",
  overduePayment: "#f97316",
  overdueOther: "#94a3b8",
};

function buildProblemDonutSegments(counts: Record<TmcProblemBucket, number>): TmcKpiDonutSegment[] {
  const order: TmcProblemBucket[] = [
    "notPurchased",
    "overdueDelivery",
    "overdueContract",
    "overduePayment",
    "overdueOther",
  ];
  return order.map((key) => ({
    label: PROBLEM_DONUT_LABELS[key],
    value: counts[key],
    color: PROBLEM_DONUT_COLORS[key],
  }));
}

const PURCHASED_BUDGET_LABELS: Record<TmcPurchasedBudgetBucket, string> = {
  economy: "Экономия",
  onBudget: "В пределах бюджета",
  overrun: "Перерасход",
  noFact: "Нет факта",
};

const PURCHASED_BUDGET_COLORS: Record<TmcPurchasedBudgetBucket, string> = {
  economy: TMC_KPI_DONUT_COLORS.economy,
  onBudget: TMC_KPI_DONUT_COLORS.onBudget,
  overrun: TMC_KPI_DONUT_COLORS.overrun,
  noFact: TMC_KPI_DONUT_COLORS.notPurchased,
};

function buildPurchasedBudgetDonutSegments(
  counts: Record<TmcPurchasedBudgetBucket, number>,
): TmcKpiDonutSegment[] {
  const order: TmcPurchasedBudgetBucket[] = ["economy", "onBudget", "overrun", "noFact"];
  return order.map((key) => ({
    label: PURCHASED_BUDGET_LABELS[key],
    value: counts[key],
    color: PURCHASED_BUDGET_COLORS[key],
  }));
}

/** Единый проход по позициям ТМЦ для трёх KPI donut-диаграмм. */
export function computeTmcKpiDonutDistributions(
  items: TmcEnrichedItem[],
  options?: {
    logDeliveryDiagnostic?: boolean;
    logProblemDiagnostic?: boolean;
    logBudgetDiagnostic?: boolean;
  },
  today: Date = new Date(),
): TmcKpiDonutDistributions {
  const purchasedDeliveryDonut = computeTmcPurchasedDeliveryDonutCounts(items, {
    logDiagnostic: options?.logDeliveryDiagnostic,
  });

  const problemDonut = computeTmcProblemDonutCounts(items, today, {
    logDiagnostic: options?.logProblemDiagnostic,
  });

  const purchasedBudgetDonut = computeTmcPurchasedBudgetDonutCounts(items, {
    logDiagnostic: options?.logBudgetDiagnostic,
  });

  const purchasedCounts: Record<TmcPurchasedDeliveryBucket, number> = {
    deliveredOnTime: purchasedDeliveryDonut.deliveredOnTime,
    deliveredLate: purchasedDeliveryDonut.deliveredLate,
    inTransit: purchasedDeliveryDonut.inTransit,
    cancelled: purchasedDeliveryDonut.cancelled,
  };

  const problemCounts: Record<TmcProblemBucket, number> = {
    notPurchased: problemDonut.notPurchased,
    overdueDelivery: problemDonut.overdueDelivery,
    overdueContract: problemDonut.overdueContract,
    overduePayment: problemDonut.overduePayment,
    overdueOther: problemDonut.overdueOther,
  };

  const budgetCounts: Record<TmcPurchasedBudgetBucket, number> = {
    economy: purchasedBudgetDonut.economyCount,
    onBudget: purchasedBudgetDonut.budgetNormalCount,
    overrun: purchasedBudgetDonut.overspendCount,
    noFact: purchasedBudgetDonut.noFactCount,
  };

  return {
    deliveryStatus: buildPurchasedDeliveryDonutSegments(purchasedCounts),
    overdueStructure: buildProblemDonutSegments(problemCounts),
    budgetDeviation: buildPurchasedBudgetDonutSegments(budgetCounts),
  };
}
