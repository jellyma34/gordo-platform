import { isTmcControlledPosition, type TMCItem } from "@/lib/tmcData";
import { TMC_CONTRACT_CHART_START_MONTH } from "@/lib/tmcContractDynamicsAnalytics";

const DAY_MS = 86400000;

/** Тот же старт шкалы, что у блоков договоров / заявок. */
export const TMC_DELIVERY_CHART_START_MONTH = TMC_CONTRACT_CHART_START_MONTH;

const CHART_MONTH_LABELS = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек",
] as const;

const DEVIATION_BUCKET_ORDER = [
  "on_time",
  "days_1_3",
  "days_4_7",
  "days_8_14",
  "days_over_14",
  "not_delivered",
  "pending",
] as const;

export type TmcDeliveryDeviationBucketId = (typeof DEVIATION_BUCKET_ORDER)[number];

export type TmcDeliveryDynamicsUnit = {
  id: string;
  /** Плановая дата поставки (deliveryPlanDate / supplyPlanDate). */
  planDeliveryDate: string;
  /** Фактическая дата поставки (deliveryFactDate / supplyFactDate). */
  actualDeliveryDate: string | null;
  /** Факт − план (дни); null если факта нет. */
  deviationDays: number | null;
  bucket: TmcDeliveryDeviationBucketId;
};

export type TmcDeliveryMonthlyDynamicsRow = {
  monthKey: string;
  label: string;
  monthTitle: string;
  plan: number;
  fact: number;
};

export type TmcDeliveryDeviationSegment = {
  bucket: TmcDeliveryDeviationBucketId;
  label: string;
  count: number;
  pct: number;
  color: string;
};

export type TmcDeliveryDynamicsAnalytics = {
  monthlyRows: TmcDeliveryMonthlyDynamicsRow[];
  deviationSegments: TmcDeliveryDeviationSegment[];
  /** Поставки с фактической датой (центр donut). */
  factDeliveredCount: number;
  /** on_time / factDeliveredCount × 100. */
  onTimeOverallPct: number | null;
  units: TmcDeliveryDynamicsUnit[];
};

function isoStartMs(iso: string | null | undefined): number | null {
  const t = (iso ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return null;
  const ms = new Date(`${t.slice(0, 10)}T12:00:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function calendarDaysBetweenIso(planIso: string, factIso: string): number | null {
  const a = isoStartMs(planIso);
  const b = isoStartMs(factIso);
  if (a == null || b == null) return null;
  return Math.round((b - a) / DAY_MS);
}

function reportDateNoonMs(reportDate: Date): number {
  return new Date(
    reportDate.getFullYear(),
    reportDate.getMonth(),
    reportDate.getDate(),
    12,
    0,
    0,
  ).getTime();
}

function monthStartFromIso(iso: string): Date {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, 1, 12, 0, 0);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1, 12, 0, 0);
}

function chartMonthLabel(d: Date): string {
  const month = CHART_MONTH_LABELS[d.getMonth()] ?? "";
  const year = String(d.getFullYear()).slice(-2);
  return `${month} ${year}`;
}

function chartMonthTitle(d: Date): string {
  const raw = d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function monthKeyFromIso(iso: string): string {
  return iso.slice(0, 7);
}

function dateToMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isDateInChartRange(iso: string, projectStartMonth: string, endMonthKey: string): boolean {
  const mk = monthKeyFromIso(iso);
  return mk >= projectStartMonth && mk <= endMonthKey;
}

function lateDeviationBucketId(days: number): TmcDeliveryDeviationBucketId {
  if (days <= 0) return "on_time";
  if (days <= 3) return "days_1_3";
  if (days <= 7) return "days_4_7";
  if (days <= 14) return "days_8_14";
  return "days_over_14";
}

const DEVIATION_BUCKET_META: Record<
  TmcDeliveryDeviationBucketId,
  { label: string; color: string }
> = {
  on_time: { label: "В срок (0 дн.)", color: "#22c55e" },
  days_1_3: { label: "1–3 дня", color: "#84cc16" },
  days_4_7: { label: "4–7 дней", color: "#f59e0b" },
  days_8_14: { label: "8–14 дней", color: "#f97316" },
  days_over_14: { label: ">14 дней", color: "#ef4444" },
  not_delivered: { label: "Не поставлено", color: "#94a3b8" },
  pending: { label: "Срок не наступил", color: "#64748b" },
};

/**
 * Плановая дата поставки — только поля поставки.
 * Не использует даты заявки / договора.
 */
export function resolveTmcDeliveryPlanIso(item: TMCItem): string | null {
  return item.deliveryPlanDate?.trim() || item.supplyPlanDate?.trim() || null;
}

/**
 * Фактическая дата поставки — только поля поставки.
 * Не подменяет договором / заявкой / закупкой.
 */
export function resolveTmcDeliveryFactIso(item: TMCItem): string | null {
  return item.deliveryFactDate?.trim() || item.supplyFactDate?.trim() || null;
}

function hasGprLink(item: TMCItem): boolean {
  if (item.gprStartDate?.trim()) return true;
  const code = (item.sourceCode || item.itemCode || "").trim();
  if (code && code !== "-" && /^\d+(\.\d+)*\.?$/.test(code)) return true;
  if ((item.parentWbsCode || "").trim()) return true;
  return false;
}

function resolveDeliveryDeviationDays(
  item: TMCItem,
  planIso: string,
  factIso: string,
): number | null {
  if (item.deliveryDeviationDays != null && Number.isFinite(item.deliveryDeviationDays)) {
    return item.deliveryDeviationDays;
  }
  return calendarDaysBetweenIso(planIso, factIso);
}

function classifyDeliveryUnit(
  item: TMCItem,
  reportDate: Date,
): TmcDeliveryDynamicsUnit | null {
  if (!isTmcControlledPosition(item)) return null;
  if (!hasGprLink(item)) return null;

  const planDeliveryDate = resolveTmcDeliveryPlanIso(item);
  if (!planDeliveryDate) return null;

  const planMs = isoStartMs(planDeliveryDate);
  if (planMs == null) return null;

  const actualDeliveryDate = resolveTmcDeliveryFactIso(item);
  const reportMs = reportDateNoonMs(reportDate);

  if (actualDeliveryDate) {
    const deviationDays = resolveDeliveryDeviationDays(item, planDeliveryDate, actualDeliveryDate);
    if (deviationDays == null) return null;
    return {
      id: item.id,
      planDeliveryDate,
      actualDeliveryDate,
      deviationDays,
      bucket: lateDeviationBucketId(deviationDays),
    };
  }

  if (planMs > reportMs) {
    return {
      id: item.id,
      planDeliveryDate,
      actualDeliveryDate: null,
      deviationDays: null,
      bucket: "pending",
    };
  }

  return {
    id: item.id,
    planDeliveryDate,
    actualDeliveryDate: null,
    deviationDays: null,
    bucket: "not_delivered",
  };
}

/** Уникальные позиции ТМЦ с плановой датой поставки (1 позиция = 1 поставка). */
export function collectTmcDeliveryDynamicsUnits(
  items: TMCItem[],
  reportDate: Date = new Date(),
): TmcDeliveryDynamicsUnit[] {
  const seen = new Set<string>();
  const units: TmcDeliveryDynamicsUnit[] = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    const unit = classifyDeliveryUnit(item, reportDate);
    if (!unit) continue;
    seen.add(item.id);
    units.push(unit);
  }

  return units;
}

function buildMonthlyRows(
  units: TmcDeliveryDynamicsUnit[],
  reportDate: Date,
  projectStartMonth: string = TMC_DELIVERY_CHART_START_MONTH,
): TmcDeliveryMonthlyDynamicsRow[] {
  const endMonthKey = dateToMonthKey(reportDate);
  if (projectStartMonth > endMonthKey) return [];

  const planByMonth = new Map<string, number>();
  const factByMonth = new Map<string, number>();

  for (const u of units) {
    if (isDateInChartRange(u.planDeliveryDate, projectStartMonth, endMonthKey)) {
      const mk = monthKeyFromIso(u.planDeliveryDate);
      planByMonth.set(mk, (planByMonth.get(mk) ?? 0) + 1);
    }
    if (
      u.actualDeliveryDate &&
      isDateInChartRange(u.actualDeliveryDate, projectStartMonth, endMonthKey)
    ) {
      const mk = monthKeyFromIso(u.actualDeliveryDate);
      factByMonth.set(mk, (factByMonth.get(mk) ?? 0) + 1);
    }
  }

  const start = monthStartFromIso(`${projectStartMonth}-01`);
  const end = monthStartFromIso(`${endMonthKey}-01`);
  const rows: TmcDeliveryMonthlyDynamicsRow[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const mk = dateToMonthKey(cursor);
    rows.push({
      monthKey: mk,
      label: chartMonthLabel(cursor),
      monthTitle: chartMonthTitle(cursor),
      plan: planByMonth.get(mk) ?? 0,
      fact: factByMonth.get(mk) ?? 0,
    });
    cursor = addMonths(cursor, 1);
  }

  return rows;
}

function buildDeviationSegments(units: TmcDeliveryDynamicsUnit[]): TmcDeliveryDeviationSegment[] {
  const total = units.length;
  const counts = new Map<TmcDeliveryDeviationBucketId, number>();
  for (const id of DEVIATION_BUCKET_ORDER) counts.set(id, 0);

  for (const u of units) {
    counts.set(u.bucket, (counts.get(u.bucket) ?? 0) + 1);
  }

  return DEVIATION_BUCKET_ORDER.map((bucket) => {
    const count = counts.get(bucket) ?? 0;
    const meta = DEVIATION_BUCKET_META[bucket];
    return {
      bucket,
      label: meta.label,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      color: meta.color,
    };
  });
}

export function buildTmcDeliveryDynamicsAnalytics(
  items: TMCItem[],
  reportDate: Date = new Date(),
): TmcDeliveryDynamicsAnalytics {
  const controlled = items.filter(isTmcControlledPosition);
  const units = collectTmcDeliveryDynamicsUnits(controlled, reportDate);
  const monthlyRows = buildMonthlyRows(units, reportDate);
  const deviationSegments = buildDeviationSegments(units);
  const withFact = units.filter((u) => u.actualDeliveryDate);
  const onTimeCount = withFact.filter((u) => u.bucket === "on_time").length;

  return {
    monthlyRows,
    deviationSegments,
    factDeliveredCount: withFact.length,
    onTimeOverallPct:
      withFact.length > 0 ? Math.round((onTimeCount / withFact.length) * 100) : null,
    units,
  };
}

/** Dev-диагностика блока «Динамика поставок» (своевременность). */
export function logTmcDeliveryDynamicsDiagnostic(
  items: TMCItem[],
  reportDate: Date = new Date(),
): void {
  if (process.env.NODE_ENV === "production") return;
  const analytics = buildTmcDeliveryDynamicsAnalytics(items, reportDate);
  console.group("[TMC] Динамика поставок (своевременность) — диагностика");
  console.log("Позиций с плановой датой поставки:", analytics.units.length);
  console.log("С фактической поставкой:", analytics.factDeliveredCount);
  console.log("В срок %:", analytics.onTimeOverallPct);
  console.log("Шкала:", TMC_DELIVERY_CHART_START_MONTH, "→", dateToMonthKey(reportDate));
  console.table(
    analytics.monthlyRows.map((r) => ({
      month: r.label,
      plan: r.plan,
      fact: r.fact,
      deviation: r.fact - r.plan,
    })),
  );
  console.table(
    analytics.deviationSegments.map((s) => ({
      label: s.label,
      count: s.count,
      pct: s.pct,
    })),
  );
  console.groupEnd();
}
