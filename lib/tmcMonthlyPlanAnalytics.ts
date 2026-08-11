/**
 * «План на месяц»: позиции к закупке в следующем календарном месяце
 * и просроченные незакупленные позиции относительно текущей даты.
 *
 * «ПРОСРОЧЕНО» / «Не закуплено в срок» использует ТОТ ЖЕ набор, что KPI
 * «В РАБОТЕ → НЕ ЗАКУПЛЕНО»: delivery-remaining + isTmcNotPurchased,
 * плюс плановая дата закупки < сегодня (`isTmcOverdueAndNotPurchased`).
 *
 * Плановая дата закупки — `tmcPurchasePlanDate` (contractPlanDate → supplyPlanDate),
 * не дата поставки.
 * Отображаемый ID — CSV «№ п/п» (`tmcCsvRowNoLabel`).
 */

import {
  isTmcControlledPosition,
  tmcCsvRowNoLabel,
  tmcStatusCategoryLabel,
  type TMCItem,
} from "@/lib/tmcData";
import { collectTmcDeliveryDynamicsUnits } from "@/lib/tmcDeliveryDynamicsAnalytics";
import {
  classifyTmcPurchaseStatus,
  isTmcNotPurchased,
  isTmcOverdueAndNotPurchased,
  normalizeTmcPurchaseState,
  TMC_CRITICAL_OVERDUE_DAYS,
  tmcPurchasePlanDate,
  type TmcPurchaseStatus,
} from "@/lib/tmcProcurementAnalytics";

const DAY_MS = 1000 * 60 * 60 * 24;

export type TmcMonthlyPlanPriority = "high" | "medium";

export type TmcMonthlyPlanNextMonthRow = {
  /** Внутренний ключ React. */
  id: string;
  /** Отображаемый ID (№ п/п). */
  workId: string;
  name: string;
  quantityLabel: string;
  planDate: string;
  statusLabel: string;
};

export type TmcMonthlyPlanOverdueRow = {
  id: string;
  workId: string;
  name: string;
  planDate: string;
  overdueDays: number;
  overdueLabel: string;
  priority: TmcMonthlyPlanPriority;
  priorityLabel: string;
};

export type TmcMonthlyPlanAnalytics = {
  /** YYYY-MM следующего календарного месяца. */
  nextMonthKey: string;
  nextMonthLabel: string;
  nextMonthRows: TmcMonthlyPlanNextMonthRow[];
  overdueRows: TmcMonthlyPlanOverdueRow[];
  nextMonthCount: number;
  overdueCount: number;
};

/** Локальная календарная дата YYYY-MM-DD (без UTC-сдвига). */
export function tmcLocalDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Следующий календарный месяц относительно даты (учёт перехода года). */
export function tmcNextCalendarMonth(today: Date): { year: number; monthIndex: number } {
  const year = today.getFullYear();
  const monthIndex = today.getMonth();
  if (monthIndex === 11) {
    return { year: year + 1, monthIndex: 0 };
  }
  return { year, monthIndex: monthIndex + 1 };
}

export function tmcMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

const MONTH_LABELS_RU = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
] as const;

export function tmcMonthLabelRu(year: number, monthIndex: number): string {
  return `${MONTH_LABELS_RU[monthIndex] ?? "—"} ${year}`;
}

function parseIsoNoonMs(iso: string): number | null {
  const value = new Date(`${iso.trim()}T12:00:00`).getTime();
  return Number.isNaN(value) ? null : value;
}

function localTodayNoonMs(today: Date): number {
  return new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    12,
    0,
    0,
  ).getTime();
}

/** Дней просрочки: текущая дата − плановая дата (положительное = просрочка). */
export function tmcPurchasePlanOverdueDays(
  planIso: string,
  today: Date = new Date(),
): number {
  const planMs = parseIsoNoonMs(planIso);
  if (planMs == null) return 0;
  const todayMs = localTodayNoonMs(today);
  return Math.round((todayMs - planMs) / DAY_MS);
}

/** «+30 дней» / «+2 дня» / «+1 день». */
export function formatTmcOverdueDaysLabel(days: number): string {
  const n = Math.abs(Math.trunc(days));
  const mod10 = n % 10;
  const mod100 = n % 100;
  let word = "дней";
  if (mod10 === 1 && mod100 !== 11) word = "день";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = "дня";
  return `+${n} ${word}`;
}

/**
 * Приоритет просрочки — тот же порог, что CRITICAL_OVERDUE_DAYS в KPI закупки.
 * Высокий: >= 14 дней; Средний: 1–13.
 */
export function tmcPurchaseOverduePriority(days: number): TmcMonthlyPlanPriority {
  return days >= TMC_CRITICAL_OVERDUE_DAYS ? "high" : "medium";
}

export function tmcPurchaseOverduePriorityLabel(priority: TmcMonthlyPlanPriority): string {
  return priority === "high" ? "Высокий" : "Средний";
}

function statusLabelOf(item: TMCItem): string {
  const raw = item.statusRaw?.trim();
  if (raw) return raw;
  return tmcStatusCategoryLabel(item.statusCategory);
}

function quantityLabelOf(item: TMCItem): string {
  const qty = item.plannedQuantity ?? item.volumePlan;
  if (qty == null || !Number.isFinite(qty)) return "—";
  const formatted = Number.isInteger(qty)
    ? String(qty)
    : String(qty).replace(".", ",");
  const unit = item.unit?.trim();
  return unit ? `${formatted} ${unit}` : formatted;
}

function isIsoInMonth(iso: string, year: number, monthIndex: number): boolean {
  if (iso.length < 7) return false;
  return iso.slice(0, 7) === tmcMonthKey(year, monthIndex);
}

/**
 * ID позиций невыполненного остатка поставок — тот же universe, что KPI «В работе».
 * (delivery-eligible без факта поставки).
 */
export function collectTmcDeliveryRemainingItemIds(
  items: TMCItem[],
  today: Date = new Date(),
): Set<string> {
  const units = collectTmcDeliveryDynamicsUnits(items, today);
  return new Set(units.filter((u) => !u.actualDeliveryDate).map((u) => u.id));
}

/**
 * Набор KPI «Не закуплено» среди остатка: delivery-remaining ∩ isTmcNotPurchased.
 */
export function collectTmcNotPurchasedAmongRemaining(
  items: TMCItem[],
  today: Date = new Date(),
  remainingItemIds?: Set<string>,
): TMCItem[] {
  const remainingIds = remainingItemIds ?? collectTmcDeliveryRemainingItemIds(items, today);
  return items.filter(
    (item) =>
      isTmcControlledPosition(item) &&
      remainingIds.has(item.id) &&
      isTmcNotPurchased(item),
  );
}

function countByPurchaseStatus(items: TMCItem[]): Record<TmcPurchaseStatus, number> {
  const counts: Record<TmcPurchaseStatus, number> = {
    purchased: 0,
    partially_purchased: 0,
    not_purchased: 0,
    no_fact: 0,
  };
  for (const item of items) {
    counts[classifyTmcPurchaseStatus(item)] += 1;
  }
  return counts;
}

function logMonthlyPlanDebug(params: {
  totalItems: number;
  remainingIds: Set<string>;
  notPurchasedAmongRemaining: TMCItem[];
  overdueRows: TmcMonthlyPlanOverdueRow[];
  today: Date;
}): void {
  if (process.env.NODE_ENV === "production") return;

  const { totalItems, remainingIds, notPurchasedAmongRemaining, overdueRows, today } = params;
  const statusCounts = countByPurchaseStatus(notPurchasedAmongRemaining);
  const overdueNotPurchasedCount = overdueRows.length;

  console.log("[TMC monthly plan ↔ KPI]", {
    totalItems,
    remainingItemCount: remainingIds.size,
    notPurchasedCount: notPurchasedAmongRemaining.length,
    overdueNotPurchasedCount,
    purchasedCount: statusCounts.purchased,
    partiallyPurchasedCount: statusCounts.partially_purchased,
    notPurchasedStatusCount: statusCounts.not_purchased,
    noFactCount: statusCounts.no_fact,
  });

  for (const item of notPurchasedAmongRemaining) {
    const state = normalizeTmcPurchaseState(item, today);
    if (!state.isOverdueAndNotPurchased) continue;
    console.log("[TMC overdue not purchased]", {
      id: item.id,
      material: item.name,
      plannedDate: state.plannedDate,
      actualDate: item.contractFactDate ?? item.deliveryFactDate ?? item.supplyFactDate ?? null,
      status: item.statusRaw || item.statusCategory,
      purchaseStatus: state.purchaseStatus,
      scheduleStatus: state.scheduleStatus,
      isPurchased: state.isPurchased,
      isOverdue: state.isOverdueAndNotPurchased,
    });
  }
}

export type BuildTmcMonthlyPlanOptions = {
  /**
   * ID остатка из того же `buildTmcMetrics().deliveries` (KPI «В работе»).
   * Если не передан — считается через collectTmcDeliveryDynamicsUnits.
   */
  remainingItemIds?: Set<string> | string[];
  /** Dev-диагностика согласованности с KPI. */
  logDiagnostic?: boolean;
};

/**
 * Две выборки:
 * 1) план закупки в следующем календарном месяце, закупка не завершена (все controlled);
 * 2) просрочено и не закуплено — только среди остатка KPI «Не закуплено».
 */
export function buildTmcMonthlyPlanAnalytics(
  items: TMCItem[],
  today: Date = new Date(),
  options?: BuildTmcMonthlyPlanOptions,
): TmcMonthlyPlanAnalytics {
  const { year, monthIndex } = tmcNextCalendarMonth(today);
  const nextMonthKey = tmcMonthKey(year, monthIndex);
  const todayIso = tmcLocalDateIso(today);

  const remainingIds = options?.remainingItemIds
    ? new Set(options.remainingItemIds)
    : collectTmcDeliveryRemainingItemIds(items, today);

  const notPurchasedAmongRemaining = collectTmcNotPurchasedAmongRemaining(
    items,
    today,
    remainingIds,
  );
  const notPurchasedRemainingIds = new Set(notPurchasedAmongRemaining.map((i) => i.id));

  const nextMonthRows: TmcMonthlyPlanNextMonthRow[] = [];
  const overdueRows: TmcMonthlyPlanOverdueRow[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (!isTmcControlledPosition(item)) continue;
    if (!isTmcNotPurchased(item)) continue;

    const planDate = tmcPurchasePlanDate(item);
    if (!planDate) continue;

    const key = item.id || `${tmcCsvRowNoLabel(item)}|${planDate}|${item.name}`;
    if (seen.has(key)) continue;

    // ПРОСРОЧЕНО: только позиции из KPI «Не закуплено» среди остатка.
    if (
      notPurchasedRemainingIds.has(item.id) &&
      isTmcOverdueAndNotPurchased(item, today)
    ) {
      const overdueDays = tmcPurchasePlanOverdueDays(planDate, today);
      if (overdueDays <= 0) continue;
      const priority = tmcPurchaseOverduePriority(overdueDays);
      seen.add(key);
      overdueRows.push({
        id: item.id,
        workId: tmcCsvRowNoLabel(item),
        name: item.name?.trim() || "—",
        planDate,
        overdueDays,
        overdueLabel: formatTmcOverdueDaysLabel(overdueDays),
        priority,
        priorityLabel: tmcPurchaseOverduePriorityLabel(priority),
      });
      continue;
    }

    // Следующий месяц: незакупленные с планом в следующем календарном месяце.
    if (planDate >= todayIso && isIsoInMonth(planDate, year, monthIndex)) {
      seen.add(key);
      nextMonthRows.push({
        id: item.id,
        workId: tmcCsvRowNoLabel(item),
        name: item.name?.trim() || "—",
        quantityLabel: quantityLabelOf(item),
        planDate,
        statusLabel: statusLabelOf(item),
      });
    }
  }

  nextMonthRows.sort(
    (a, b) =>
      a.planDate.localeCompare(b.planDate) ||
      a.workId.localeCompare(b.workId, "ru", { numeric: true }) ||
      a.name.localeCompare(b.name, "ru"),
  );
  overdueRows.sort(
    (a, b) =>
      b.overdueDays - a.overdueDays ||
      a.planDate.localeCompare(b.planDate) ||
      a.name.localeCompare(b.name, "ru"),
  );

  if (options?.logDiagnostic) {
    logMonthlyPlanDebug({
      totalItems: items.filter(isTmcControlledPosition).length,
      remainingIds,
      notPurchasedAmongRemaining,
      overdueRows,
      today,
    });
  }

  return {
    nextMonthKey,
    nextMonthLabel: tmcMonthLabelRu(year, monthIndex),
    nextMonthRows,
    overdueRows,
    nextMonthCount: nextMonthRows.length,
    overdueCount: overdueRows.length,
  };
}
