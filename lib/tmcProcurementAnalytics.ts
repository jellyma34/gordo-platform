import {
  isTmcControlledPosition,
  isTmcWbsCode,
  tmcStatusCategoryLabel,
  type TMCItem,
  type TmcStatusCategory,
} from "@/lib/tmcData";
import {
  normalizeGprCodeFinal,
  type ConstructionObjectScope,
  type GPRTask,
} from "@/lib/gprUtils";
import {
  filterGprTasksForTmcStartChart,
  type PlanFactTasksBarLevel,
  type PlanFactWorkTypePartKey,
} from "@/lib/planFactWorkTypeTimeline";

const DAY_MS = 1000 * 60 * 60 * 24;

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso?.trim()) return null;
  const value = new Date(`${iso.trim()}T12:00:00`).getTime();
  return Number.isNaN(value) ? null : value;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).getTime();
}

/** Позиции для KPI: только rowKind=position (без групп WBS). */
export function tmcKpiPositions(items: TMCItem[]): TMCItem[] {
  return items.filter(isTmcControlledPosition);
}

export function hasDeliveryFact(item: TMCItem): boolean {
  return Boolean(item.deliveryFactDate?.trim() || item.supplyFactDate?.trim());
}

export function hasContractFact(item: TMCItem): boolean {
  const contract = item.contract?.trim();
  const hasRef = Boolean(contract && contract !== "0" && contract !== "-");
  return hasRef || Boolean(item.contractFactDate?.trim());
}

export function hasRequestFact(item: TMCItem): boolean {
  return Boolean(item.requestFactDate?.trim());
}

/**
 * Поставка фактически состоялась:
 * статус delivered/partial ИЛИ заполнена дата факта поставки ИЛИ actualQuantity > 0.
 */
export function isTmcDeliveredPosition(item: TMCItem): boolean {
  if (item.statusCategory === "delivered" || item.statusCategory === "partial") return true;
  if (hasDeliveryFact(item)) return true;
  if ((item.actualQuantity ?? 0) > 0) return true;
  return false;
}

/** Процесс начат (заявка/договор/частичная активность), поставка ещё не завершена полностью. */
export function isTmcInProgressPosition(item: TMCItem): boolean {
  if (item.statusCategory === "delivered") return false;
  if (isTmcDeliveredPosition(item) && item.statusCategory === "partial") return true;
  if (isTmcDeliveredPosition(item)) return false;
  return (
    hasRequestFact(item) ||
    hasContractFact(item) ||
    item.statusCategory === "plan" ||
    (item.actualQuantity ?? 0) > 0
  );
}

/**
 * Просрочка поставки:
 * - факт позже плана (deviation > 0 или даты), ИЛИ
 * - плановая дата прошла, факта поставки нет.
 */
export function isTmcDeliveryOverdue(item: TMCItem, reportDate: Date): boolean {
  const plan = item.deliveryPlanDate ?? item.supplyPlanDate;
  const fact = item.deliveryFactDate ?? item.supplyFactDate;
  const planMs = parseIsoMs(plan);
  const factMs = parseIsoMs(fact);
  const reportMs = startOfDay(reportDate);

  if (item.deliveryDeviationDays != null && item.deliveryDeviationDays > 0 && factMs != null) {
    return true;
  }
  if (planMs != null && factMs != null && factMs > planMs) return true;
  if (planMs != null && factMs == null && planMs < reportMs) return true;
  return false;
}

/** Не закуплено: нет факта договора и нет факта поставки. */
export function isTmcNotPurchased(item: TMCItem): boolean {
  if (isTmcDeliveredPosition(item)) return false;
  if (hasContractFact(item)) return false;
  return true;
}

export function tmcDeliveryLateDays(item: TMCItem, reportDate: Date): number {
  const plan = item.deliveryPlanDate ?? item.supplyPlanDate;
  const fact = item.deliveryFactDate ?? item.supplyFactDate;
  const planMs = parseIsoMs(plan);
  const factMs = parseIsoMs(fact);
  const reportMs = startOfDay(reportDate);

  if (item.deliveryDeviationDays != null && item.deliveryDeviationDays > 0) {
    return item.deliveryDeviationDays;
  }
  if (planMs != null && factMs != null && factMs > planMs) {
    return Math.round((factMs - planMs) / DAY_MS);
  }
  if (planMs != null && factMs == null && planMs < reportMs) {
    return Math.round((reportMs - planMs) / DAY_MS);
  }
  return 0;
}

export type TmcProcurementLifecycleKpi = {
  reportDate: string | null;
  totalPositions: number;
  deliveredCount: number;
  inProgressCount: number;
  overdueCount: number;
  notPurchasedCount: number;
  averageOverdueDays: number;
  criticalOverdueCount: number;
  withDeliveryCount: number;
  withoutDeliveryCount: number;
};

const CRITICAL_OVERDUE_DAYS = 14;

export function computeTmcProcurementLifecycleKpi(
  items: TMCItem[],
  reportDate: Date = new Date(),
  reportDateIso: string | null = null,
): TmcProcurementLifecycleKpi {
  const positions = tmcKpiPositions(items);
  const totalPositions = positions.length;

  let deliveredCount = 0;
  let inProgressCount = 0;
  let overdueCount = 0;
  let notPurchasedCount = 0;
  let withDeliveryCount = 0;
  let overdueDaysSum = 0;
  let overdueForAvg = 0;
  let criticalOverdueCount = 0;

  for (const item of positions) {
    const delivered = isTmcDeliveredPosition(item);
    const overdue = isTmcDeliveryOverdue(item, reportDate);
    const notPurchased = isTmcNotPurchased(item);
    const inProgress = isTmcInProgressPosition(item) && !delivered;

    if (delivered) {
      deliveredCount += 1;
      withDeliveryCount += 1;
    }
    if (inProgress) inProgressCount += 1;
    if (overdue) {
      overdueCount += 1;
      const days = tmcDeliveryLateDays(item, reportDate);
      if (days > 0) {
        overdueDaysSum += days;
        overdueForAvg += 1;
        if (days >= CRITICAL_OVERDUE_DAYS) criticalOverdueCount += 1;
      }
    }
    if (notPurchased) notPurchasedCount += 1;
  }

  return {
    reportDate: reportDateIso,
    totalPositions,
    deliveredCount,
    inProgressCount,
    overdueCount,
    notPurchasedCount,
    averageOverdueDays:
      overdueForAvg > 0 ? Math.round(overdueDaysSum / overdueForAvg) : 0,
    criticalOverdueCount,
    withDeliveryCount,
    withoutDeliveryCount: totalPositions - withDeliveryCount,
  };
}

export type TmcProcessStageStats = {
  key: "gpr" | "request" | "contract" | "delivery";
  label: string;
  planCount: number;
  factCount: number;
  overdueCount: number;
};

function stageOverdue(
  plan: string | null,
  fact: string | null,
  deviation: number | null,
  reportDate: Date,
): boolean {
  const planMs = parseIsoMs(plan);
  const factMs = parseIsoMs(fact);
  const reportMs = startOfDay(reportDate);
  if (deviation != null && deviation > 0 && factMs != null) return true;
  if (planMs != null && factMs != null && factMs > planMs) return true;
  if (planMs != null && factMs == null && planMs < reportMs) return true;
  return false;
}

export function computeTmcProcessChain(
  items: TMCItem[],
  reportDate: Date = new Date(),
): TmcProcessStageStats[] {
  const positions = tmcKpiPositions(items);

  let gprPlan = 0;
  let gprFact = 0;
  let reqPlan = 0;
  let reqFact = 0;
  let reqOver = 0;
  let conPlan = 0;
  let conFact = 0;
  let conOver = 0;
  let delPlan = 0;
  let delFact = 0;
  let delOver = 0;

  for (const item of positions) {
    if (item.gprStartDate) {
      gprPlan += 1;
      gprFact += 1; // дата начала по ГПР — плановая веха из источника
    }
    if (item.requestPlanDate) reqPlan += 1;
    if (item.requestFactDate) reqFact += 1;
    if (stageOverdue(item.requestPlanDate, item.requestFactDate, item.requestDeviationDays, reportDate)) {
      reqOver += 1;
    }
    if (item.contractPlanDate) conPlan += 1;
    if (hasContractFact(item)) conFact += 1;
    if (
      stageOverdue(
        item.contractPlanDate,
        item.contractFactDate,
        item.contractDeviationDays,
        reportDate,
      )
    ) {
      conOver += 1;
    }
    if (item.deliveryPlanDate || item.supplyPlanDate) delPlan += 1;
    if (hasDeliveryFact(item) || isTmcDeliveredPosition(item)) delFact += 1;
    if (isTmcDeliveryOverdue(item, reportDate)) delOver += 1;
  }

  return [
    { key: "gpr", label: "ГПР", planCount: gprPlan, factCount: gprFact, overdueCount: 0 },
    {
      key: "request",
      label: "Заявка",
      planCount: reqPlan,
      factCount: reqFact,
      overdueCount: reqOver,
    },
    {
      key: "contract",
      label: "Договор",
      planCount: conPlan,
      factCount: conFact,
      overdueCount: conOver,
    },
    {
      key: "delivery",
      label: "Поставка",
      planCount: delPlan,
      factCount: delFact,
      overdueCount: delOver,
    },
  ];
}

export type TmcCriticalPosition = {
  id: string;
  name: string;
  stage: string;
  planDate: string | null;
  factDate: string | null;
  deviationDays: number | null;
  statusRaw: string;
  statusCategory: TmcStatusCategory;
  statusLabel: string;
  kind: "late_delivery" | "missing_delivery";
};

export function computeTmcCriticalPositions(
  items: TMCItem[],
  reportDate: Date = new Date(),
  limit = 12,
): TmcCriticalPosition[] {
  const positions = tmcKpiPositions(items);
  const rows: TmcCriticalPosition[] = [];

  for (const item of positions) {
    const planDate = item.deliveryPlanDate ?? item.supplyPlanDate;
    const factDate = item.deliveryFactDate ?? item.supplyFactDate;
    const lateDays = tmcDeliveryLateDays(item, reportDate);
    const overdue = isTmcDeliveryOverdue(item, reportDate);
    if (!overdue && !(planDate && !factDate && !isTmcDeliveredPosition(item))) continue;

    const kind: TmcCriticalPosition["kind"] =
      factDate || isTmcDeliveredPosition(item) ? "late_delivery" : "missing_delivery";

    const deviationDays =
      item.deliveryDeviationDays != null
        ? item.deliveryDeviationDays
        : lateDays > 0
          ? lateDays
          : null;

    rows.push({
      id: item.id,
      name: item.name,
      stage: item.stage || item.gprStage,
      planDate,
      factDate,
      deviationDays,
      statusRaw: item.statusRaw,
      statusCategory: item.statusCategory,
      statusLabel: item.statusRaw?.trim()
        ? item.statusRaw.trim()
        : tmcStatusCategoryLabel(item.statusCategory),
      kind,
    });
  }

  rows.sort((a, b) => {
    const da = a.deviationDays ?? (a.kind === "missing_delivery" ? 10_000 : 0);
    const db = b.deviationDays ?? (b.kind === "missing_delivery" ? 10_000 : 0);
    if (db !== da) return db - da;
    if (a.kind !== b.kind) return a.kind === "missing_delivery" ? -1 : 1;
    return a.name.localeCompare(b.name, "ru");
  });

  return rows.slice(0, limit);
}

export type TmcStatusDistributionItem = {
  category: TmcStatusCategory;
  label: string;
  count: number;
  rawSamples: string[];
};

export function computeTmcStatusDistributionFromCsv(items: TMCItem[]): TmcStatusDistributionItem[] {
  const positions = tmcKpiPositions(items);
  const map = new Map<TmcStatusCategory, TmcStatusDistributionItem>();
  for (const cat of ["delivered", "partial", "plan", "no_fact"] as TmcStatusCategory[]) {
    map.set(cat, {
      category: cat,
      label: tmcStatusCategoryLabel(cat),
      count: 0,
      rawSamples: [],
    });
  }
  for (const item of positions) {
    const bucket = map.get(item.statusCategory)!;
    bucket.count += 1;
    const raw = item.statusRaw.trim();
    if (raw && !bucket.rawSamples.includes(raw) && bucket.rawSamples.length < 5) {
      bucket.rawSamples.push(raw);
    }
  }
  return [...map.values()].filter((x) => x.count > 0);
}

export type TmcLifecycleDonutSegment = {
  key: "delivered" | "partial" | "inProgress" | "overdue" | "notPurchased";
  label: string;
  value: number;
  color: string;
};

export function computeTmcLifecycleDonutSegments(
  items: TMCItem[],
  reportDate: Date = new Date(),
): TmcLifecycleDonutSegment[] {
  const positions = tmcKpiPositions(items);
  let delivered = 0;
  let partial = 0;
  let inProgress = 0;
  let overdue = 0;
  let notPurchased = 0;

  for (const item of positions) {
    if (item.statusCategory === "delivered") delivered += 1;
    else if (item.statusCategory === "partial") partial += 1;
    else if (isTmcDeliveryOverdue(item, reportDate)) overdue += 1;
    else if (isTmcNotPurchased(item)) notPurchased += 1;
    else if (isTmcInProgressPosition(item)) inProgress += 1;
    else notPurchased += 1;
  }

  return (
    [
      { key: "delivered" as const, label: "Поставлено", value: delivered, color: "#22c55e" },
      { key: "partial" as const, label: "Частично поставлено", value: partial, color: "#f59e0b" },
      { key: "inProgress" as const, label: "В работе", value: inProgress, color: "#3b82f6" },
      { key: "overdue" as const, label: "Просрочено", value: overdue, color: "#ef4444" },
      { key: "notPurchased" as const, label: "Не закуплено", value: notPurchased, color: "#94a3b8" },
    ] satisfies TmcLifecycleDonutSegment[]
  ).filter((s) => s.value > 0);
}

/** Цвет отклонения даты: + = проблема (красный), 0 = ок, − = раньше плана. */
export function tmcDateDeviationTone(
  days: number | null | undefined,
): "danger" | "ok" | "early" | "neutral" {
  if (days == null || !Number.isFinite(days)) return "neutral";
  if (days > 0) return "danger";
  if (days === 0) return "ok";
  return "early";
}

export function formatTmcDeviationDays(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days)) return "—";
  if (days > 0) return `+${days} дн.`;
  if (days < 0) return `${days} дн.`;
  return "0 дн.";
}

export function formatTmcIsoRu(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function isoToUtcNoonMs(iso: string): number | null {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const ms = new Date(`${t}T12:00:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function addCalendarDaysIso(iso: string, days: number): string | null {
  const ms = isoToUtcNoonMs(iso);
  if (ms == null) return null;
  const d = new Date(ms + days * DAY_MS);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Крайний срок подачи заявки = Дата начала по ГПР − Срок подачи заказа (дней).
 * Связь только по полям строки позиции (ID Код уже в item.sourceCode/itemCode).
 */
export function computeTmcRequestDeadlineIso(item: TMCItem): string | null {
  const gprStart = item.gprStartDate?.trim() || null;
  const lead = item.orderDeadlineDays;
  if (!gprStart || lead == null || !Number.isFinite(lead)) return null;
  return addCalendarDaysIso(gprStart, -Math.trunc(lead));
}

export type TmcRequestVsGprStatus =
  | "on_time"
  | "late"
  | "missing_overdue"
  | "deadline_pending"
  | "incomplete";

/** Полный статус цепочки ТМЦ → заявка → договор → ГПР. */
export type TmcSupplyChainStatus =
  | "on_time"
  | "request_late"
  | "missing_overdue"
  | "contract_late"
  | "not_supplied"
  | "deadline_pending"
  | "incomplete";

export type TmcRequestVsGprRow = {
  id: string;
  itemCode: string;
  stage: string;
  name: string;
  /** Наименование работы ГПР (если найдена связь). */
  workName: string | null;
  gprStartDate: string | null;
  gprFactStartDate: string | null;
  orderDeadlineDays: number | null;
  requestDeadlineDate: string | null;
  requestPlanDate: string | null;
  requestFactDate: string | null;
  /** Факт подачи − крайний срок (дни). */
  deviationDays: number | null;
  contractPlanDate: string | null;
  contractFactDate: string | null;
  contractDeviationDays: number | null;
  /** Факт начала − план начала ГПР (дни). */
  gprStartDeviationDays: number | null;
  status: TmcSupplyChainStatus;
  statusLabel: string;
  /** Категория для существующих фильтров блока. */
  filterStatus: TmcRequestVsGprStatus;
};

export type TmcRequestVsGprSummary = {
  total: number;
  onTime: number;
  late: number;
  missingOverdue: number;
  deadlinePending: number;
  incomplete: number;
  averageLateDays: number;
};

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

function resolveTmcWorkCode(item: TMCItem): string | null {
  const raw = (item.sourceCode || item.itemCode || "").trim();
  if (raw && isTmcWbsCode(raw)) {
    return normalizeGprCodeFinal(raw);
  }
  const parent = normalizeGprCodeFinal(item.parentWbsCode || "");
  return parent || null;
}

function buildGprTaskByCodeIndex(gprTasks: GPRTask[]): Map<string, GPRTask> {
  const map = new Map<string, GPRTask>();
  for (const task of gprTasks) {
    if (task.missingFromImport) continue;
    const code = normalizeGprCodeFinal(task.code);
    if (!code) continue;
    const prev = map.get(code);
    if (!prev) {
      map.set(code, task);
      continue;
    }
    if (!prev.planStart?.trim() && task.planStart?.trim()) {
      map.set(code, task);
    }
  }
  return map;
}

function computeRequestDeadlineFromGprPlan(
  gprPlanStartIso: string | null,
  orderDeadlineDays: number | null,
): string | null {
  if (!gprPlanStartIso || orderDeadlineDays == null || !Number.isFinite(orderDeadlineDays)) {
    return null;
  }
  return addCalendarDaysIso(gprPlanStartIso, -Math.trunc(orderDeadlineDays));
}

export function tmcSupplyChainStatusLabel(status: TmcSupplyChainStatus): string {
  if (status === "on_time") return "Выполнено в срок";
  if (status === "request_late") return "Отклонение подачи заявки";
  if (status === "missing_overdue") return "Не подано в срок";
  if (status === "contract_late") return "Отклонение договора";
  if (status === "not_supplied") return "ТМЦ не обеспечено";
  if (status === "deadline_pending") return "Срок не наступил";
  return "Нет данных";
}

export function tmcSupplyChainToFilterStatus(status: TmcSupplyChainStatus): TmcRequestVsGprStatus {
  if (status === "on_time") return "on_time";
  if (status === "missing_overdue") return "missing_overdue";
  if (status === "deadline_pending") return "deadline_pending";
  if (status === "incomplete") return "incomplete";
  return "late";
}

export function matchesTmcSupplyChainFilter(
  status: TmcSupplyChainStatus,
  filter: "all" | TmcRequestVsGprStatus,
): boolean {
  if (filter === "all") return true;
  return tmcSupplyChainToFilterStatus(status) === filter;
}

const SUPPLY_CHAIN_STATUS_SEVERITY: Record<TmcSupplyChainStatus, number> = {
  incomplete: 0,
  not_supplied: 1,
  missing_overdue: 2,
  request_late: 3,
  contract_late: 4,
  deadline_pending: 5,
  on_time: 6,
};

function pickWorstSupplyChainStatus(
  statuses: TmcSupplyChainStatus[],
): TmcSupplyChainStatus {
  let worst: TmcSupplyChainStatus = "on_time";
  for (const s of statuses) {
    if (SUPPLY_CHAIN_STATUS_SEVERITY[s] < SUPPLY_CHAIN_STATUS_SEVERITY[worst]) {
      worst = s;
    }
  }
  return worst;
}

function classifyRequestStage(
  requestDeadlineDate: string | null,
  requestFactDate: string | null,
  reportDate: Date,
): { status: TmcSupplyChainStatus; deviationDays: number | null } {
  if (!requestDeadlineDate) {
    return { status: "incomplete", deviationDays: null };
  }
  const deadlineMs = isoToUtcNoonMs(requestDeadlineDate);
  const reportMs = reportDateNoonMs(reportDate);

  if (requestFactDate) {
    const factMs = isoToUtcNoonMs(requestFactDate);
    if (factMs == null || deadlineMs == null) {
      return { status: "incomplete", deviationDays: null };
    }
    const deviationDays = Math.round((factMs - deadlineMs) / DAY_MS);
    if (deviationDays <= 0) {
      return { status: "on_time", deviationDays };
    }
    return { status: "request_late", deviationDays };
  }

  if (deadlineMs != null && deadlineMs < reportMs) {
    return {
      status: "missing_overdue",
      deviationDays: Math.round((reportMs - deadlineMs) / DAY_MS),
    };
  }

  return { status: "deadline_pending", deviationDays: null };
}

function classifyContractStage(
  contractPlanDate: string | null,
  contractFactDate: string | null,
  contractDeviationDaysStored: number | null,
  reportDate: Date,
): { status: TmcSupplyChainStatus; deviationDays: number | null } {
  if (!contractPlanDate) {
    return { status: "incomplete", deviationDays: null };
  }

  if (contractFactDate) {
    const deviationDays =
      contractDeviationDaysStored ??
      (contractPlanDate && contractFactDate
        ? calendarDaysBetweenIso(contractPlanDate, contractFactDate)
        : null);
    if (deviationDays == null) {
      return { status: "incomplete", deviationDays: null };
    }
    if (deviationDays > 0) {
      return { status: "contract_late", deviationDays };
    }
    return { status: "on_time", deviationDays };
  }

  const planMs = isoStartMs(contractPlanDate);
  const reportMs = reportDateNoonMs(reportDate);
  if (planMs != null && planMs < reportMs) {
    return {
      status: "contract_late",
      deviationDays: Math.round((reportMs - planMs) / DAY_MS),
    };
  }

  return { status: "deadline_pending", deviationDays: null };
}

function classifySupplyBeforeGprStage(
  contractFactDate: string | null,
  contractPlanDate: string | null,
  gprPlanStart: string | null,
  gprFactStart: string | null,
  reportDate: Date,
): TmcSupplyChainStatus {
  const reportMs = reportDateNoonMs(reportDate);
  const gprAnchorIso =
    gprFactStart ||
    (gprPlanStart && isoStartMs(gprPlanStart) != null && isoStartMs(gprPlanStart)! <= reportMs
      ? gprPlanStart
      : null);

  if (!gprAnchorIso) return "on_time";

  const anchorMs = isoStartMs(gprAnchorIso);
  if (anchorMs == null) return "on_time";

  if (contractFactDate) {
    const contractMs = isoStartMs(contractFactDate);
    if (contractMs != null && contractMs > anchorMs) {
      return "not_supplied";
    }
    return "on_time";
  }

  if (gprFactStart || (gprPlanStart && isoStartMs(gprPlanStart)! <= reportMs)) {
    return "not_supplied";
  }

  if (contractPlanDate && isoStartMs(contractPlanDate) != null && isoStartMs(contractPlanDate)! <= reportMs) {
    return "not_supplied";
  }

  return "on_time";
}

export function classifyTmcSupplyChain(
  item: TMCItem,
  gprTask: GPRTask | null,
  reportDate: Date,
): Omit<
  TmcRequestVsGprRow,
  "id" | "itemCode" | "stage" | "name" | "workName"
> {
  const gprPlanStart = gprTask?.planStart?.trim() || item.gprStartDate?.trim() || null;
  const gprFactStart = gprTask?.factStart?.trim() || null;
  const orderDeadlineDays = item.orderDeadlineDays;
  const requestPlanDate = item.requestPlanDate?.trim() || null;
  const requestFactDate = item.requestFactDate?.trim() || null;
  const contractPlanDate = item.contractPlanDate?.trim() || null;
  const contractFactDate = item.contractFactDate?.trim() || null;
  const contractDeviationDays = item.contractDeviationDays;

  const requestDeadlineDate =
    computeRequestDeadlineFromGprPlan(gprPlanStart, orderDeadlineDays) ??
    computeTmcRequestDeadlineIso(item);

  if (!gprPlanStart || orderDeadlineDays == null || !requestDeadlineDate) {
    return {
      gprStartDate: gprPlanStart,
      gprFactStartDate: gprFactStart,
      orderDeadlineDays,
      requestDeadlineDate,
      requestPlanDate,
      requestFactDate,
      deviationDays: null,
      contractPlanDate,
      contractFactDate,
      contractDeviationDays,
      gprStartDeviationDays:
        gprPlanStart && gprFactStart ? calendarDaysBetweenIso(gprPlanStart, gprFactStart) : null,
      status: "incomplete",
      statusLabel: tmcSupplyChainStatusLabel("incomplete"),
      filterStatus: "incomplete",
    };
  }

  const requestStage = classifyRequestStage(requestDeadlineDate, requestFactDate, reportDate);
  const contractStage = classifyContractStage(
    contractPlanDate,
    contractFactDate,
    contractDeviationDays,
    reportDate,
  );
  const supplyStage = classifySupplyBeforeGprStage(
    contractFactDate,
    contractPlanDate,
    gprPlanStart,
    gprFactStart,
    reportDate,
  );

  const status = pickWorstSupplyChainStatus([
    requestStage.status,
    contractStage.status,
    supplyStage,
  ]);

  return {
    gprStartDate: gprPlanStart,
    gprFactStartDate: gprFactStart,
    orderDeadlineDays,
    requestDeadlineDate,
    requestPlanDate,
    requestFactDate,
    deviationDays: requestStage.deviationDays,
    contractPlanDate,
    contractFactDate,
    contractDeviationDays: contractStage.deviationDays ?? contractDeviationDays,
    gprStartDeviationDays:
      gprPlanStart && gprFactStart ? calendarDaysBetweenIso(gprPlanStart, gprFactStart) : null,
    status,
    statusLabel: tmcSupplyChainStatusLabel(status),
    filterStatus: tmcSupplyChainToFilterStatus(status),
  };
}


const SUPPLY_CHAIN_ROW_SORT_ORDER: Record<TmcSupplyChainStatus, number> = {
  not_supplied: 0,
  missing_overdue: 1,
  request_late: 2,
  contract_late: 3,
  deadline_pending: 4,
  on_time: 5,
  incomplete: 6,
};

export function buildTmcRequestVsGprRows(
  items: TMCItem[],
  reportDate: Date = new Date(),
  gprTasks: GPRTask[] = [],
): TmcRequestVsGprRow[] {
  const gprByCode = buildGprTaskByCodeIndex(gprTasks);
  const rows: TmcRequestVsGprRow[] = [];
  for (const item of tmcKpiPositions(items)) {
    const workCode = resolveTmcWorkCode(item);
    const gprTask = workCode ? gprByCode.get(workCode) ?? null : null;
    const classified = classifyTmcSupplyChain(item, gprTask, reportDate);
    rows.push({
      id: item.id,
      itemCode: (item.sourceCode || item.itemCode || "").trim(),
      stage: (item.stage || item.gprStage || "").trim(),
      name: item.name.trim(),
      workName: gprTask?.name?.trim() || null,
      ...classified,
    });
  }

  rows.sort((a, b) => {
    const oa = SUPPLY_CHAIN_ROW_SORT_ORDER[a.status];
    const ob = SUPPLY_CHAIN_ROW_SORT_ORDER[b.status];
    if (oa !== ob) return oa - ob;
    if (
      a.status === "request_late" ||
      a.status === "missing_overdue" ||
      a.status === "contract_late" ||
      a.status === "not_supplied"
    ) {
      const da = a.deviationDays ?? a.contractDeviationDays ?? 0;
      const db = b.deviationDays ?? b.contractDeviationDays ?? 0;
      if (db !== da) return db - da;
    }
    const ga = a.gprStartDate ?? "9999-99-99";
    const gb = b.gprStartDate ?? "9999-99-99";
    if (ga !== gb) return ga.localeCompare(gb);
    return a.name.localeCompare(b.name, "ru");
  });

  return rows;
}

export function summarizeTmcRequestVsGpr(rows: TmcRequestVsGprRow[]): TmcRequestVsGprSummary {
  let onTime = 0;
  let late = 0;
  let missingOverdue = 0;
  let deadlinePending = 0;
  let incomplete = 0;
  let lateDaysSum = 0;
  let lateForAvg = 0;

  for (const row of rows) {
    switch (row.filterStatus) {
      case "on_time":
        onTime += 1;
        break;
      case "late":
        late += 1;
        if (row.deviationDays != null && row.deviationDays > 0) {
          lateDaysSum += row.deviationDays;
          lateForAvg += 1;
        } else if (row.contractDeviationDays != null && row.contractDeviationDays > 0) {
          lateDaysSum += row.contractDeviationDays;
          lateForAvg += 1;
        }
        break;
      case "missing_overdue":
        missingOverdue += 1;
        if (row.deviationDays != null && row.deviationDays > 0) {
          lateDaysSum += row.deviationDays;
          lateForAvg += 1;
        }
        break;
      case "deadline_pending":
        deadlinePending += 1;
        break;
      default:
        incomplete += 1;
        break;
    }
  }

  return {
    total: rows.length,
    onTime,
    late,
    missingOverdue,
    deadlinePending,
    incomplete,
    averageLateDays: lateForAvg > 0 ? Math.round(lateDaysSum / lateForAvg) : 0,
  };
}

/** Точка графика: ID работы ГПР → план/факт даты начала. */
export type GprWorkStartByCodePoint = {
  code: string;
  name: string;
  planStartIso: string | null;
  factStartIso: string | null;
  /** ms для оси Y; null = нет точки. */
  planStartMs: number | null;
  factStartMs: number | null;
  /** fact − plan (дни), только если обе даты есть. */
  deviationDays: number | null;
};

/** Строка таймлайна: цепочка ТМЦ → заявка → договор → начало работ ГПР. */
export type GprTmcWorkLifecycleRow = {
  /** Уникальный ключ строки (код работы или id позиции ТМЦ). */
  rowKey: string;
  code: string;
  workName: string;
  /** Наименования ТМЦ, связанные с работой. */
  tmcNames: string;
  planStartIso: string | null;
  factStartIso: string | null;
  requestDeadlineIso: string | null;
  requestFactIso: string | null;
  contractPlanIso: string | null;
  contractFactIso: string | null;
  orderDeadlineDays: number | null;
  /** Факт подачи − крайний срок (дни). */
  orderDeviationDays: number | null;
  /** Факт договора − план договора (дни). */
  contractDeviationDays: number | null;
  /** Факт начала − план начала (дни). */
  startDeviationDays: number | null;
  status: TmcSupplyChainStatus;
  statusLabel: string;
  filterStatus: TmcRequestVsGprStatus;
  planStartMs: number | null;
  factStartMs: number | null;
  requestDeadlineMs: number | null;
  requestFactMs: number | null;
  contractPlanMs: number | null;
  contractFactMs: number | null;
  /** id позиции ТМЦ — только режим «Все этапы». */
  tmcItemId: string | null;
};

export function constructionScopeToPlanFactPartKey(
  scope: ConstructionObjectScope,
): PlanFactWorkTypePartKey {
  if (scope === "project") return "project";
  if (scope === 2) return "parking";
  return "residential";
}

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

function compareGprWbsCodes(a: string, b: string): number {
  const as = a.split(".").map((p) => Number(p));
  const bs = b.split(".").map((p) => Number(p));
  const n = Math.max(as.length, bs.length);
  for (let i = 0; i < n; i += 1) {
    const av = as[i];
    const bv = bs[i];
    if (av == null) return -1;
    if (bv == null) return 1;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * Набор шифров работ, связанных с ТМЦ (для графика начала работ ГПР).
 *
 * Берём ID Код после одинаковой нормализации (хвостовая точка / пробелы / мусор):
 * - строки с валидным WBS в sourceCode/itemCode (и group, и position — в CSV
 *   укрупнённые этапы часто без «Наименование ТМЦ» и идут как group);
 * - для материалов с «-»/«?» — явный parentWbsCode из иерархии CSV.
 *
 * Сопоставление с ГПР: normalize(tmc) === normalize(gpr), без startsWith/includes.
 */
export function collectExactTmcGprWorkCodes(items: TMCItem[]): Set<string> {
  const codes = new Set<string>();

  const addRaw = (raw: string | null | undefined) => {
    const t = (raw ?? "").trim();
    if (!t || !isTmcWbsCode(t)) return;
    const code = normalizeGprCodeFinal(t);
    if (code) codes.add(code);
  };

  for (const item of items) {
    addRaw(item.sourceCode);
    addRaw(item.itemCode);
    addRaw(item.parentWbsCode);
  }
  return codes;
}

/**
 * График начала работ: X = ID ГПР, Y = даты planStart / factStart.
 * Режимы Упрощённо / Детально / Все этапы — через filterGprTasksForTmcStartChart.
 * Связь с ТМЦ: normalize(gpr.code) === normalize(tmc.workCode) (строгое равенство).
 */
export function buildGprWorkStartByCodeSeries(params: {
  gprTasks: GPRTask[];
  tmcItems: TMCItem[];
  barLevel: PlanFactTasksBarLevel;
  partKey: PlanFactWorkTypePartKey;
}): GprWorkStartByCodePoint[] {
  const lifecycle = buildGprTmcWorkLifecycleTimeline({
    ...params,
    reportDate: new Date(),
  });
  return lifecycle.map((row) => ({
    code: row.code,
    name: row.workName,
    planStartIso: row.planStartIso,
    factStartIso: row.factStartIso,
    planStartMs: row.planStartMs,
    factStartMs: row.factStartMs,
    deviationDays: row.startDeviationDays,
  }));
}

function buildTimelineRowFromChain(
  rowKey: string,
  code: string,
  workName: string,
  tmcNames: string,
  chain: Omit<TmcRequestVsGprRow, "id" | "itemCode" | "stage" | "name" | "workName">,
  tmcItemId: string | null,
): GprTmcWorkLifecycleRow {
  return {
    rowKey,
    code,
    workName,
    tmcNames,
    planStartIso: chain.gprStartDate,
    factStartIso: chain.gprFactStartDate,
    requestDeadlineIso: chain.requestDeadlineDate,
    requestFactIso: chain.requestFactDate,
    contractPlanIso: chain.contractPlanDate,
    contractFactIso: chain.contractFactDate,
    orderDeadlineDays: chain.orderDeadlineDays,
    orderDeviationDays: chain.deviationDays,
    contractDeviationDays: chain.contractDeviationDays,
    startDeviationDays: chain.gprStartDeviationDays,
    status: chain.status,
    statusLabel: chain.statusLabel,
    filterStatus: chain.filterStatus,
    planStartMs: isoStartMs(chain.gprStartDate),
    factStartMs: isoStartMs(chain.gprFactStartDate),
    requestDeadlineMs: isoStartMs(chain.requestDeadlineDate),
    requestFactMs: isoStartMs(chain.requestFactDate),
    contractPlanMs: isoStartMs(chain.contractPlanDate),
    contractFactMs: isoStartMs(chain.contractFactDate),
    tmcItemId,
  };
}

function aggregateLinkedPositionDates(
  linkedPositions: TMCItem[],
  gprTask: GPRTask | null,
  reportDate: Date,
): {
  chain: Omit<TmcRequestVsGprRow, "id" | "itemCode" | "stage" | "name" | "workName">;
  tmcNames: string;
} | null {
  if (linkedPositions.length === 0) return null;

  let worst: ReturnType<typeof classifyTmcSupplyChain> | null = null;
  const names = new Set<string>();
  let requestFactDate: string | null = null;
  let contractPlanDate: string | null = null;
  let contractFactDate: string | null = null;

  for (const item of linkedPositions) {
    if (item.name.trim()) names.add(item.name.trim());
    const chain = classifyTmcSupplyChain(item, gprTask, reportDate);
    if (
      !worst ||
      SUPPLY_CHAIN_STATUS_SEVERITY[chain.status] < SUPPLY_CHAIN_STATUS_SEVERITY[worst.status]
    ) {
      worst = chain;
    }
    const rf = item.requestFactDate?.trim() || null;
    if (rf && (!requestFactDate || rf < requestFactDate)) requestFactDate = rf;
    const cp = item.contractPlanDate?.trim() || null;
    if (cp && (!contractPlanDate || cp < contractPlanDate)) contractPlanDate = cp;
    const cf = item.contractFactDate?.trim() || null;
    if (cf && (!contractFactDate || cf > contractFactDate)) contractFactDate = cf;
  }

  if (!worst) return null;

  return {
    chain: {
      ...worst,
      requestFactDate: requestFactDate ?? worst.requestFactDate,
      contractPlanDate: contractPlanDate ?? worst.contractPlanDate,
      contractFactDate: contractFactDate ?? worst.contractFactDate,
    },
    tmcNames: [...names].join(" + "),
  };
}

export function tmcRequestVsGprStatusDisplayLabel(status: TmcRequestVsGprStatus): string {
  if (status === "on_time") return "Успели";
  if (status === "late") return "Опоздание";
  if (status === "missing_overdue") return "Не подано в срок";
  if (status === "deadline_pending") return "Срок не наступил";
  return "Нет данных";
}

/** ТМЦ, относящиеся к работе: точный ID Код или parentWbsCode === код работы. */
function tmcItemsLinkedToWorkCode(items: TMCItem[], workCode: string): TMCItem[] {
  const wc = normalizeGprCodeFinal(workCode);
  if (!wc) return [];
  return items.filter((item) => {
    const code = normalizeGprCodeFinal(item.sourceCode || item.itemCode || "");
    if (code === wc) return true;
    const parent = normalizeGprCodeFinal(item.parentWbsCode || "");
    return parent === wc;
  });
}

function groupKeyForBarLevel(
  workCode: string,
  barLevel: PlanFactTasksBarLevel,
): string | null {
  const norm = normalizeGprCodeFinal(workCode);
  if (!norm) return null;
  const parts = norm.split(".").filter(Boolean);
  if (barLevel === "simplified") {
    if (parts.length <= 3) return norm;
    return parts.slice(0, 3).join(".");
  }
  return norm;
}

function resolveGprTaskForGroup(
  gprByCode: Map<string, GPRTask>,
  groupCode: string,
  items: TMCItem[],
): GPRTask | null {
  const direct = gprByCode.get(normalizeGprCodeFinal(groupCode));
  if (direct) return direct;
  for (const item of items) {
    const wc = resolveTmcWorkCode(item);
    if (!wc) continue;
    const task = gprByCode.get(wc);
    if (task) return task;
  }
  return null;
}

function chainHasAnyDate(
  chain: Omit<TmcRequestVsGprRow, "id" | "itemCode" | "stage" | "name" | "workName">,
): boolean {
  return Boolean(
    chain.gprStartDate ||
      chain.gprFactStartDate ||
      chain.requestDeadlineDate ||
      chain.requestFactDate ||
      chain.contractPlanDate ||
      chain.contractFactDate,
  );
}

/**
 * Таймлайн цепочки ТМЦ → заявка → договор → ГПР.
 * Строки строятся из позиций ТМЦ (как таблица), с группировкой по режиму.
 */
export function buildGprTmcWorkLifecycleTimeline(params: {
  gprTasks: GPRTask[];
  tmcItems: TMCItem[];
  barLevel: PlanFactTasksBarLevel;
  partKey: PlanFactWorkTypePartKey;
  reportDate?: Date;
}): GprTmcWorkLifecycleRow[] {
  const reportDate = params.reportDate ?? new Date();
  const gprByCode = buildGprTaskByCodeIndex(params.gprTasks);

  if (params.barLevel === "full") {
    const rows: GprTmcWorkLifecycleRow[] = [];
    for (const item of tmcKpiPositions(params.tmcItems)) {
      const workCode = resolveTmcWorkCode(item);
      if (!workCode) continue;
      const gprTask = resolveGprTaskForGroup(gprByCode, workCode, [item]);
      const chain = classifyTmcSupplyChain(item, gprTask, reportDate);
      if (!chainHasAnyDate(chain)) continue;

      const code = (item.sourceCode || item.itemCode || workCode).trim();
      rows.push(
        buildTimelineRowFromChain(
          item.id,
          code,
          gprTask?.name?.trim() || item.stage || "",
          item.name.trim(),
          chain,
          item.id,
        ),
      );
    }
    rows.sort(
      (a, b) => compareGprWbsCodes(a.code, b.code) || a.tmcNames.localeCompare(b.tmcNames, "ru"),
    );
    return rows;
  }

  const groups = new Map<string, TMCItem[]>();
  for (const item of tmcKpiPositions(params.tmcItems)) {
    const workCode = resolveTmcWorkCode(item);
    if (!workCode) continue;
    const groupCode = groupKeyForBarLevel(workCode, params.barLevel);
    if (!groupCode) continue;
    const bucket = groups.get(groupCode);
    if (bucket) bucket.push(item);
    else groups.set(groupCode, [item]);
  }

  const rows: GprTmcWorkLifecycleRow[] = [];
  for (const [code, linkedPositions] of groups) {
    const gprTask = resolveGprTaskForGroup(gprByCode, code, linkedPositions);
    const aggregated = aggregateLinkedPositionDates(linkedPositions, gprTask, reportDate);
    if (!aggregated) continue;

    const { chain, tmcNames } = aggregated;
    if (!chainHasAnyDate(chain)) continue;

    rows.push(
      buildTimelineRowFromChain(
        code,
        code,
        gprTask?.name?.trim() || linkedPositions[0]?.stage?.trim() || "",
        tmcNames,
        chain,
        null,
      ),
    );
  }

  rows.sort((a, b) => compareGprWbsCodes(a.code, b.code));
  return rows;
}

/** Статус заявки для секции «Обеспечение ТМЦ (заявки)». */
export type TmcRequestProvisionStatus =
  | "on_time"
  | "late"
  | "missing"
  | "pending"
  | "incomplete";

/** Статус договора для секции «Заключение договоров». */
export type TmcContractProvisionStatus =
  | "on_time"
  | "late"
  | "missing"
  | "pending"
  | "incomplete";

export type TmcGprRiskLevel = "red" | "orange" | "green";

export function requestProvisionStatusLabel(status: TmcRequestProvisionStatus): string {
  if (status === "on_time") return "Подано в срок";
  if (status === "late") return "С опозданием";
  if (status === "missing") return "Не подано";
  if (status === "pending") return "Срок не наступил";
  return "Нет данных";
}

export function contractProvisionStatusLabel(status: TmcContractProvisionStatus): string {
  if (status === "on_time") return "В срок";
  if (status === "late") return "С опозданием";
  if (status === "missing") return "Не заключён";
  if (status === "pending") return "Срок не наступил";
  return "Нет данных";
}

export function classifyRequestProvisionStatus(
  requestDeadlineIso: string | null,
  requestFactIso: string | null,
  reportDate: Date,
): { status: TmcRequestProvisionStatus; label: string } {
  const stage = classifyRequestStage(requestDeadlineIso, requestFactIso, reportDate);
  const map: Record<TmcSupplyChainStatus, TmcRequestProvisionStatus> = {
    on_time: "on_time",
    request_late: "late",
    missing_overdue: "missing",
    deadline_pending: "pending",
    incomplete: "incomplete",
    contract_late: "incomplete",
    not_supplied: "incomplete",
  };
  const status = map[stage.status] ?? "incomplete";
  return { status, label: requestProvisionStatusLabel(status) };
}

export function classifyContractProvisionStatus(
  contractPlanIso: string | null,
  contractFactIso: string | null,
  contractDeviationDaysStored: number | null,
  reportDate: Date,
): { status: TmcContractProvisionStatus; label: string } {
  if (!contractPlanIso) {
    return { status: "incomplete", label: contractProvisionStatusLabel("incomplete") };
  }

  if (contractFactIso) {
    const deviationDays =
      contractDeviationDaysStored ??
      calendarDaysBetweenIso(contractPlanIso, contractFactIso);
    if (deviationDays != null && deviationDays > 0) {
      return { status: "late", label: contractProvisionStatusLabel("late") };
    }
    return { status: "on_time", label: contractProvisionStatusLabel("on_time") };
  }

  const planMs = isoStartMs(contractPlanIso);
  const reportMs = reportDateNoonMs(reportDate);
  if (planMs != null && planMs < reportMs) {
    return { status: "missing", label: contractProvisionStatusLabel("missing") };
  }

  return { status: "pending", label: contractProvisionStatusLabel("pending") };
}

export type TmcGprRiskRow = {
  rowKey: string;
  code: string;
  tmcNames: string;
  planStartIso: string | null;
  /** Дней от сегодня до планового начала ГПР. */
  daysToPlanStart: number | null;
  /** Запас/дефицит времени (−180…+180). */
  bufferDays: number;
  riskLevel: TmcGprRiskLevel;
  riskReason: string;
  supplyStatusLabel: string;
};

/** Позиции с риском срыва ГПР из-за ТМЦ (только red/orange). */
export function buildTmcGprRiskRows(
  lifecycleRows: GprTmcWorkLifecycleRow[],
  reportDate: Date,
): TmcGprRiskRow[] {
  const reportMs = reportDateNoonMs(reportDate);
  const out: TmcGprRiskRow[] = [];

  for (const row of lifecycleRows) {
    if (!row.planStartIso || row.planStartMs == null) continue;

    if (row.factStartMs != null && row.factStartMs <= reportMs) continue;

    const daysToPlanStart = Math.round((row.planStartMs - reportMs) / DAY_MS);
    const req = classifyRequestProvisionStatus(
      row.requestDeadlineIso,
      row.requestFactIso,
      reportDate,
    );
    const con = classifyContractProvisionStatus(
      row.contractPlanIso,
      row.contractFactIso,
      row.contractDeviationDays,
      reportDate,
    );

    let bufferDays = daysToPlanStart;
    const reasons: string[] = [];

    if (req.status === "missing" && row.requestDeadlineMs != null) {
      const overdue = Math.round((reportMs - row.requestDeadlineMs) / DAY_MS);
      bufferDays = Math.min(bufferDays, -overdue);
      reasons.push(`Заявка не подана (${overdue} дн. просрочки)`);
    } else if (req.status === "late" && row.orderDeviationDays != null && row.orderDeviationDays > 0) {
      bufferDays -= row.orderDeviationDays;
      reasons.push(`Заявка с опозданием (${row.orderDeviationDays} дн.)`);
    }

    if (con.status === "missing" && row.contractPlanMs != null) {
      const overdue = Math.round((reportMs - row.contractPlanMs) / DAY_MS);
      bufferDays = Math.min(bufferDays, -overdue);
      reasons.push(`Договор не заключён (${overdue} дн.)`);
    } else if (
      con.status === "late" &&
      row.contractDeviationDays != null &&
      row.contractDeviationDays > 0
    ) {
      bufferDays -= row.contractDeviationDays;
      reasons.push(`Договор с опозданием (${row.contractDeviationDays} дн.)`);
    }

    let riskLevel: TmcGprRiskLevel = "green";
    if (bufferDays < 0 || req.status === "missing" || con.status === "missing") {
      riskLevel = "red";
    } else if (bufferDays < 30 || req.status === "late" || con.status === "late") {
      riskLevel = "orange";
    }

    if (riskLevel === "green") continue;

    out.push({
      rowKey: row.rowKey,
      code: row.code,
      tmcNames: row.tmcNames,
      planStartIso: row.planStartIso,
      daysToPlanStart,
      bufferDays: Math.max(-180, Math.min(180, bufferDays)),
      riskLevel,
      riskReason: reasons.length > 0 ? reasons.join("; ") : "Недостаточный запас времени",
      supplyStatusLabel: [req.label, con.label].filter((x) => x !== "Нет данных").join(" · ") || req.label,
    });
  }

  out.sort((a, b) => a.bufferDays - b.bufferDays);
  return out;
}

/** Управленческий уровень риска обеспечения ТМЦ до начала ГПР. */
export type TmcGprSupplyRiskLevel = "disruption" | "risk" | "secured" | "waiting";

export type TmcGprSupplyRiskRow = {
  rowKey: string;
  gprCode: string;
  gprName: string;
  materialName: string;
  deadlineRequestIso: string | null;
  factRequestIso: string | null;
  contractPlanIso: string | null;
  contractFactIso: string | null;
  planGprStartIso: string | null;
  factGprStartIso: string | null;
  requestLeadTimeDays: number | null;
  riskLevel: TmcGprSupplyRiskLevel;
  /** РИСК СРЫВА / РИСК / ЗАПАС / ОЖИДАНИЕ */
  riskLabel: string;
  daysBuffer: number | null;
  riskReason: string;
  deadlineRequestMs: number | null;
  /** Факт обеспечения (заявка; для расчёта также учитывается договор). */
  factSupplyMs: number | null;
  planGprStartMs: number | null;
};

export type TmcGprSupplyRiskSummary = {
  disruption: number;
  risk: number;
  secured: number;
  waiting: number;
};

/** @deprecated Используйте TmcGprSupplyRiskRow */
export type TmcGprProvisionManagementRow = TmcGprSupplyRiskRow;
/** @deprecated */
export type TmcGprProvisionMgmtStatus = TmcGprSupplyRiskLevel;

const SUPPLY_RISK_BUFFER_THRESHOLD_DAYS = 30;

const SUPPLY_RISK_SORT_ORDER: Record<TmcGprSupplyRiskLevel, number> = {
  disruption: 0,
  risk: 1,
  waiting: 2,
  secured: 3,
};

export function supplyRiskLevelLabel(level: TmcGprSupplyRiskLevel): string {
  if (level === "disruption") return "РИСК СРЫВА";
  if (level === "risk") return "РИСК";
  if (level === "secured") return "ЗАПАС";
  return "ОЖИДАНИЕ";
}

/** Полная формулировка для tooltip. */
export function supplyRiskLevelTooltipLabel(level: TmcGprSupplyRiskLevel): string {
  if (level === "disruption") return "РИСК СРЫВА ГПР";
  if (level === "secured") return "ОБЕСПЕЧЕНО";
  return supplyRiskLevelLabel(level);
}

function resolveExpectedSupplyMs(
  requestFactMs: number | null,
  contractFactMs: number | null,
  contractPlanMs: number | null,
  reportDate: Date,
): number {
  if (requestFactMs != null) return requestFactMs;
  if (contractFactMs != null) return contractFactMs;
  if (contractPlanMs != null) return contractPlanMs;
  return reportDateNoonMs(reportDate);
}

function classifySupplyRisk(params: {
  requestDeadlineIso: string | null;
  requestFactIso: string | null;
  requestDeadlineMs: number | null;
  requestFactMs: number | null;
  contractPlanMs: number | null;
  contractFactMs: number | null;
  planGprStartMs: number | null;
  reportDate: Date;
}): {
  level: TmcGprSupplyRiskLevel;
  daysBuffer: number | null;
  reason: string;
} | null {
  const { planGprStartMs, reportDate } = params;
  if (planGprStartMs == null) return null;

  const todayMs = reportDateNoonMs(reportDate);
  const expectedMs = resolveExpectedSupplyMs(
    params.requestFactMs,
    params.contractFactMs,
    params.contractPlanMs,
    reportDate,
  );
  let daysBuffer = Math.round((planGprStartMs - expectedMs) / DAY_MS);

  const req = classifyRequestProvisionStatus(
    params.requestDeadlineIso,
    params.requestFactIso,
    reportDate,
  );

  const hasSupplyFact = params.requestFactMs != null || params.contractFactMs != null;
  const deadlineMs = params.requestDeadlineMs;

  if (
    !hasSupplyFact &&
    deadlineMs != null &&
    todayMs > deadlineMs &&
    req.status === "missing" &&
    daysBuffer >= 0
  ) {
    daysBuffer = -Math.round((todayMs - deadlineMs) / DAY_MS);
  }

  if (
    !hasSupplyFact &&
    deadlineMs != null &&
    todayMs <= deadlineMs &&
    req.status === "pending"
  ) {
    return {
      level: "waiting",
      daysBuffer: Math.round((planGprStartMs - todayMs) / DAY_MS),
      reason: "Срок подачи заявки ещё не наступил",
    };
  }

  if (daysBuffer < 0 || req.status === "missing") {
    let reason = "ТМЦ не обеспечено к контрольной дате";
    if (req.status === "missing") {
      reason = "Заявка не подана, контрольный срок прошёл";
    } else if (daysBuffer < 0) {
      reason = "Ожидаемое обеспечение выходит за начало ГПР";
    }
    return { level: "disruption", daysBuffer, reason };
  }

  if (daysBuffer <= SUPPLY_RISK_BUFFER_THRESHOLD_DAYS || req.status === "late") {
    const reason =
      req.status === "late"
        ? "Заявка подана с опозданием, запас до начала ГПР минимален"
        : "Минимальный запас до начала ГПР";
    return { level: "risk", daysBuffer, reason };
  }

  return {
    level: "secured",
    daysBuffer,
    reason: "Материал обеспечен, есть запас до начала ГПР",
  };
}

export function sortTmcGprSupplyRiskRows(rows: TmcGprSupplyRiskRow[]): TmcGprSupplyRiskRow[] {
  return [...rows].sort((a, b) => {
    const levelDiff =
      SUPPLY_RISK_SORT_ORDER[a.riskLevel] - SUPPLY_RISK_SORT_ORDER[b.riskLevel];
    if (levelDiff !== 0) return levelDiff;
    return (a.daysBuffer ?? 0) - (b.daysBuffer ?? 0);
  });
}

export function summarizeTmcGprSupplyRisk(rows: TmcGprSupplyRiskRow[]): TmcGprSupplyRiskSummary {
  const summary: TmcGprSupplyRiskSummary = {
    disruption: 0,
    risk: 0,
    secured: 0,
    waiting: 0,
  };
  for (const row of rows) {
    summary[row.riskLevel] += 1;
  }
  return summary;
}

/** Строки управленческой таблицы «Обеспечение ГПР материалами». */
export function buildTmcGprSupplyRiskRows(
  lifecycleRows: GprTmcWorkLifecycleRow[],
  reportDate: Date,
): TmcGprSupplyRiskRow[] {
  const out: TmcGprSupplyRiskRow[] = [];

  for (const row of lifecycleRows) {
    if (!row.planStartIso && !row.requestDeadlineIso) continue;

    const classified = classifySupplyRisk({
      requestDeadlineIso: row.requestDeadlineIso,
      requestFactIso: row.requestFactIso,
      requestDeadlineMs: row.requestDeadlineMs,
      requestFactMs: row.requestFactMs,
      contractPlanMs: row.contractPlanMs,
      contractFactMs: row.contractFactMs,
      planGprStartMs: row.planStartMs,
      reportDate,
    });
    if (!classified) continue;

    out.push({
      rowKey: row.rowKey,
      gprCode: row.code,
      gprName: row.workName || "—",
      materialName: row.tmcNames || "—",
      deadlineRequestIso: row.requestDeadlineIso,
      factRequestIso: row.requestFactIso,
      contractPlanIso: row.contractPlanIso,
      contractFactIso: row.contractFactIso,
      planGprStartIso: row.planStartIso,
      factGprStartIso: row.factStartIso,
      requestLeadTimeDays: row.orderDeadlineDays,
      riskLevel: classified.level,
      riskLabel: supplyRiskLevelLabel(classified.level),
      daysBuffer: classified.daysBuffer,
      riskReason: classified.reason,
      deadlineRequestMs: row.requestDeadlineMs,
      factSupplyMs: row.requestFactMs ?? row.contractFactMs,
      planGprStartMs: row.planStartMs,
    });
  }

  return sortTmcGprSupplyRiskRows(out);
}

/** @deprecated Используйте buildTmcGprSupplyRiskRows */
export function buildTmcGprProvisionManagementRows(
  lifecycleRows: GprTmcWorkLifecycleRow[],
  reportDate: Date,
): TmcGprSupplyRiskRow[] {
  return buildTmcGprSupplyRiskRows(lifecycleRows, reportDate);
}

export function formatDaysBufferLabel(days: number | null): string {
  if (days == null) return "—";
  const abs = Math.abs(days);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  let word = "дней";
  if (mod100 < 11 || mod100 > 14) {
    if (mod10 === 1) word = "день";
    else if (mod10 >= 2 && mod10 <= 4) word = "дня";
  }
  if (days > 0) return `+${abs} ${word}`;
  if (days < 0) return `−${abs} ${word}`;
  return `0 ${word}`;
}

/** @deprecated */
export const formatDaysToGprLabel = formatDaysBufferLabel;

/** Dev-диагностика первых N строк. */
export function logTmcGprProvisionManagementDiagnostic(
  rows: TmcGprSupplyRiskRow[],
  limit = 10,
): void {
  if (process.env.NODE_ENV === "production") return;
  const sample = rows.slice(0, limit).map((r) => ({
    gprCode: r.gprCode,
    gprName: r.gprName,
    materialName: r.materialName,
    deadlineRequest: r.deadlineRequestIso,
    factRequest: r.factRequestIso,
    planGprStart: r.planGprStartIso,
    factGprStart: r.factGprStartIso,
    requestLeadTimeDays: r.requestLeadTimeDays,
    riskLevel: r.riskLabel,
    daysBuffer: r.daysBuffer,
  }));
  console.group("[TMC] Обеспечение ГПР материалами — диагностика");
  console.table(sample);
  console.groupEnd();
}
