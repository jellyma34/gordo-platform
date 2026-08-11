/**
 * Единый слой TMC metrics:
 * raw/normalized items → applications / contracts / deliveries → summary (KPI).
 *
 * KPI-карточки и блоки «Динамика заявок / договоров / поставок» читают
 * одни и те же analytics-результаты без независимых правил подсчёта.
 */
import type { GPRTask } from "@/lib/gprUtils";
import { categorizeTmcStatus, type TMCItem } from "@/lib/tmcData";
import {
  buildTmcContractConclusionAnalytics,
  isTmcContractOnTime,
  type TmcContractConclusionAnalytics,
} from "@/lib/tmcContractDynamicsAnalytics";
import {
  buildTmcDeliveryDynamicsAnalytics,
  type TmcDeliveryDeviationBucketId,
  type TmcDeliveryDynamicsAnalytics,
  type TmcDeliveryDynamicsUnit,
} from "@/lib/tmcDeliveryDynamicsAnalytics";
import {
  hasContractFact,
  isTmcInProgressPosition,
  isTmcNotPurchased,
  isTmcOverdueAndNotPurchased,
  tmcKpiPositions,
} from "@/lib/tmcProcurementAnalytics";
import {
  buildTmcRequestDynamicsAnalytics,
  type TmcRequestDynamicsAnalytics,
} from "@/lib/tmcRequestDynamicsAnalytics";
/** Локальные цвета donut — те же, что TMC_KPI_DONUT_COLORS (без циклического импорта). */
const DONUT_COLORS = {
  deliveredOnTime: "#22c55e",
  deliveredLate: "#ef4444",
  inTransit: "#3b82f6",
  notPurchased: "#6b7280",
  risk: "#f59e0b",
  economy: "#22c55e",
  onBudget: "#3b82f6",
  overrun: "#ef4444",
  overdue: "#ef4444",
} as const;

export type TmcUnifiedKpiDonutSegment = {
  label: string;
  value: number;
  color: string;
};

export type TmcUnifiedKpiDonutDistributions = {
  deliveryStatus: TmcUnifiedKpiDonutSegment[];
  overdueStructure: TmcUnifiedKpiDonutSegment[];
  overdueReasons: TmcUnifiedKpiDonutSegment[];
  budgetDeviation: TmcUnifiedKpiDonutSegment[];
  /** Распределение по столбцу «Статус» CSV (без пустых значений). */
  statusDistribution: TmcUnifiedKpiDonutSegment[];
};

/** Совместимо с TmcProcurementKpi из presentation analytics. */
export type TmcUnifiedProcurementKpi = {
  planRub: number;
  factRub: number;
  procurementFactRub: number;
  receiptsFactRub: number;
  receiptsPlanRub: number;
  deliveryCount: number;
  totalItemCount: number;
  purchasedItemCount: number;
  purchasedItemPct: number;
  overdueAmongPurchasedCount: number;
  overdueNotStartedCount: number;
  avgCheckRub: number;
  deviationRub: number;
  deviationPct: number | null;
  overdueCount: number;
  overdueCostRub: number;
  remainingItemCount: number;
  overdueAmongRemainingCount: number;
  notPurchasedAmongRemainingCount: number;
  inProgressAmongRemainingCount: number;
  onTimeAmongRemainingCount: number;
  averageOverdueDays: number;
  plannedExecutionPct: number;
  actualExecutionPct: number;
};

/** Совместимо с TmcProcurementFinancialResult. */
export type TmcUnifiedFinancialResult = {
  economyRub: number;
  overrunRub: number;
  balanceRub: number;
  purchasedPlanRub: number;
  economySharePct: number;
  purchasedFactRub: number;
  deviationRub: number;
  deviationPct: number;
};

/** Совместимо с TmcRemainderCardCounts. */
export type TmcUnifiedRemainderCardCounts = {
  remainingItemCount: number;
  notStartedCount: number;
  tenderInProgressCount: number;
  inTransitCount: number;
  overdueCount: number;
  overdueNotPurchasedCount: number;
  notPurchasedOnTimeCount: number;
  inTransitDonutCount: number;
  activeWorkCount: number;
  donutSum: number;
};

export type TmcMetricsSummary = {
  /** Позиции с плановой датой поставки и связью с ГПР (denominator поставок). */
  deliveryEligibleCount: number;
  /** Позиции с фактической датой поставки. */
  deliveryFactCount: number;
  /** Факт − план < 0. */
  deliveryEarlyCount: number;
  /** Факт − план === 0. */
  deliveryOnTimeExactCount: number;
  /** Факт − план > 0. */
  deliveryLateCount: number;
  /** Нет факта, план ещё не наступил. */
  deliveryPendingCount: number;
  /** Нет факта, план уже прошёл. */
  deliveryMissingCount: number;
  /** Остаток = eligible − fact. */
  deliveryRemainingCount: number;
  /** Среди остатка: закупка не начата. */
  remainingNotPurchasedCount: number;
  /** Среди остатка: процесс начат (заявка/договор), поставки нет. */
  remainingInProgressCount: number;
  /** Среди остатка: просрочена поставка (план прошёл, факта нет). */
  remainingOverdueCount: number;
  /**
   * Среди остатка: не закуплено и плановая дата закупки прошла
   * (тот же критерий, что «ПРОСРОЧЕНО» в «План на месяц»).
   */
  remainingOverdueNotPurchasedCount: number;
  /** Активная работа среди остатка (закупка начата, поставки ещё нет). */
  remainingActiveWorkCount: number;
  /** Средняя просрочка среди поставленных с опозданием (дни). */
  averageDeliveryLateDays: number;
  /** Средняя просрочка среди остатка без факта (дни до сегодня). */
  averageRemainingOverdueDays: number;
  /** Доля поставленных = fact / eligible, %. */
  deliveredSharePct: number;
  /** Доля просроченных поставок = late / eligible, %. */
  lateSharePct: number;
  /** Уникальных договоров с фактом заключения. */
  contractFactCount: number;
  /** Уникальных договоров в расчёте. */
  contractEligibleCount: number;
  /** Заявок с фактом подачи. */
  requestFactCount: number;
  /** Заявок с определённым планом. */
  requestEligibleCount: number;
};

export type TmcUnifiedMetrics = {
  applications: TmcRequestDynamicsAnalytics;
  contracts: TmcContractConclusionAnalytics;
  deliveries: TmcDeliveryDynamicsAnalytics;
  summary: TmcMetricsSummary;
  kpi: TmcUnifiedProcurementKpi;
  financialResult: TmcUnifiedFinancialResult;
  remainderCard: TmcUnifiedRemainderCardCounts;
  donutDistributions: TmcUnifiedKpiDonutDistributions;
  diagnostic: TmcMetricsDiagnosticTable;
};

export type TmcMetricsDiagnosticRow = {
  metric: "APPLICATIONS" | "CONTRACTS" | "DELIVERIES";
  total: number;
  eligible: number;
  onTime: number;
  late: number;
  noFact: number;
  notStarted: number;
};

export type TmcMetricsDiagnosticTable = TmcMetricsDiagnosticRow[];

function countBucket(
  units: TmcDeliveryDynamicsUnit[],
  bucket: TmcDeliveryDeviationBucketId,
): number {
  return units.filter((u) => u.bucket === bucket).length;
}

function buildSummary(
  items: TMCItem[],
  deliveries: TmcDeliveryDynamicsAnalytics,
  contracts: TmcContractConclusionAnalytics,
  applications: TmcRequestDynamicsAnalytics,
  reportDate: Date,
): TmcMetricsSummary {
  const byId = new Map(items.map((i) => [i.id, i]));
  const units = deliveries.units;

  let early = 0;
  let onTimeExact = 0;
  let late = 0;
  let lateDaysSum = 0;
  for (const u of units) {
    if (u.deviationDays == null) continue;
    if (u.deviationDays < 0) early += 1;
    else if (u.deviationDays > 0) {
      late += 1;
      lateDaysSum += u.deviationDays;
    } else onTimeExact += 1;
  }

  const pending = countBucket(units, "pending");
  const missing = countBucket(units, "not_delivered");
  const remainingUnits = units.filter((u) => !u.actualDeliveryDate);

  let remainingNotPurchased = 0;
  let remainingInProgress = 0;
  let remainingOverdueDaysSum = 0;
  let remainingOverdueForAvg = 0;
  let remainingOverdueNotPurchased = 0;
  const reportMs = new Date(
    reportDate.getFullYear(),
    reportDate.getMonth(),
    reportDate.getDate(),
    12,
    0,
    0,
  ).getTime();

  for (const u of remainingUnits) {
    const item = byId.get(u.id);
    const notPurchased = item ? isTmcNotPurchased(item) : true;
    const inProgress = item
      ? (isTmcInProgressPosition(item) || hasContractFact(item)) && !notPurchased
      : false;

    if (u.bucket === "not_delivered") {
      const planMs = new Date(`${u.planDeliveryDate}T12:00:00`).getTime();
      if (!Number.isNaN(planMs) && planMs < reportMs) {
        remainingOverdueDaysSum += Math.round((reportMs - planMs) / 86400000);
        remainingOverdueForAvg += 1;
      }
    }

    if (notPurchased) {
      remainingNotPurchased += 1;
      if (item && isTmcOverdueAndNotPurchased(item, reportDate)) {
        remainingOverdueNotPurchased += 1;
      }
    } else if (inProgress) remainingInProgress += 1;
  }

  const eligible = units.length;
  const fact = deliveries.factDeliveredCount;
  const remaining = remainingUnits.length;

  return {
    deliveryEligibleCount: eligible,
    deliveryFactCount: fact,
    deliveryEarlyCount: early,
    deliveryOnTimeExactCount: onTimeExact,
    deliveryLateCount: late,
    deliveryPendingCount: pending,
    deliveryMissingCount: missing,
    deliveryRemainingCount: remaining,
    remainingNotPurchasedCount: remainingNotPurchased,
    remainingInProgressCount: remainingInProgress,
    remainingOverdueCount: missing,
    remainingOverdueNotPurchasedCount: remainingOverdueNotPurchased,
    remainingActiveWorkCount: remainingInProgress,
    averageDeliveryLateDays: late > 0 ? Math.round(lateDaysSum / late) : 0,
    averageRemainingOverdueDays:
      remainingOverdueForAvg > 0
        ? Math.round(remainingOverdueDaysSum / remainingOverdueForAvg)
        : 0,
    deliveredSharePct: eligible > 0 ? Math.round((fact / eligible) * 1000) / 10 : 0,
    lateSharePct: eligible > 0 ? Math.round((late / eligible) * 1000) / 10 : 0,
    contractFactCount: contracts.factConcludedCount,
    contractEligibleCount: Math.max(
      contracts.uniqueContracts.length,
      contracts.deviationSegments.reduce((s, x) => s + x.count, 0),
    ),
    requestFactCount: applications.factSubmittedCount,
    requestEligibleCount: applications.units.length,
  };
}

function buildKpiFromSummary(summary: TmcMetricsSummary): TmcUnifiedProcurementKpi {
  const deliveryPct = summary.deliveredSharePct;
  return {
    planRub: 0,
    factRub: 0,
    procurementFactRub: 0,
    receiptsFactRub: 0,
    receiptsPlanRub: 0,
    deliveryCount: summary.deliveryFactCount,
    totalItemCount: summary.deliveryEligibleCount,
    purchasedItemCount: summary.deliveryFactCount,
    purchasedItemPct: deliveryPct,
    overdueAmongPurchasedCount: summary.deliveryLateCount,
    overdueNotStartedCount: summary.deliveryMissingCount,
    avgCheckRub: 0,
    deviationRub: summary.deliveryLateCount - summary.deliveryEarlyCount,
    deviationPct: summary.lateSharePct,
    overdueCount: summary.deliveryLateCount + summary.deliveryMissingCount,
    overdueCostRub: 0,
    remainingItemCount: summary.deliveryRemainingCount,
    overdueAmongRemainingCount: summary.remainingOverdueCount,
    notPurchasedAmongRemainingCount: summary.remainingNotPurchasedCount,
    inProgressAmongRemainingCount: summary.remainingInProgressCount,
    onTimeAmongRemainingCount: summary.deliveryPendingCount,
    averageOverdueDays: summary.averageRemainingOverdueDays,
    plannedExecutionPct: deliveryPct,
    actualExecutionPct: deliveryPct,
  };
}

function buildFinancialFromSummary(summary: TmcMetricsSummary): TmcUnifiedFinancialResult {
  const deviationRub = summary.deliveryLateCount - summary.deliveryEarlyCount;
  return {
    economyRub: summary.deliveryEarlyCount,
    overrunRub: summary.deliveryLateCount,
    balanceRub: summary.deliveryEarlyCount - summary.deliveryLateCount,
    purchasedPlanRub: summary.deliveryEligibleCount,
    economySharePct:
      summary.deliveryEligibleCount > 0
        ? Math.round((summary.deliveryEarlyCount / summary.deliveryEligibleCount) * 1000) / 10
        : 0,
    purchasedFactRub: summary.deliveryFactCount,
    deviationRub,
    deviationPct: summary.lateSharePct,
  };
}

function buildRemainderFromSummary(summary: TmcMetricsSummary): TmcUnifiedRemainderCardCounts {
  const overdueNotPurchasedCount = summary.remainingOverdueNotPurchasedCount;
  const notPurchasedOnTimeCount = Math.max(
    0,
    summary.remainingNotPurchasedCount - overdueNotPurchasedCount,
  );
  const inTransitDonutCount = Math.max(
    0,
    summary.deliveryRemainingCount - overdueNotPurchasedCount - notPurchasedOnTimeCount,
  );

  return {
    remainingItemCount: summary.deliveryRemainingCount,
    notStartedCount: summary.remainingNotPurchasedCount,
    tenderInProgressCount: 0,
    inTransitCount: summary.remainingInProgressCount,
    overdueCount: summary.remainingOverdueCount,
    overdueNotPurchasedCount,
    notPurchasedOnTimeCount,
    inTransitDonutCount,
    activeWorkCount: summary.remainingActiveWorkCount,
    donutSum: overdueNotPurchasedCount + notPurchasedOnTimeCount + inTransitDonutCount,
  };
}

function buildDeliveryStatusDonut(summary: TmcMetricsSummary): TmcUnifiedKpiDonutSegment[] {
  const segments: TmcUnifiedKpiDonutSegment[] = [
    {
      label: "В срок",
      value: summary.deliveryEarlyCount + summary.deliveryOnTimeExactCount,
      color: DONUT_COLORS.deliveredOnTime,
    },
    {
      label: "С опозданием",
      value: summary.deliveryLateCount,
      color: DONUT_COLORS.deliveredLate,
    },
    {
      label: "Срок не наступил",
      value: summary.deliveryPendingCount,
      color: DONUT_COLORS.risk,
    },
    {
      label: "Нет факта",
      value: summary.deliveryMissingCount,
      color: DONUT_COLORS.notPurchased,
    },
  ];
  return segments.filter((s) => s.value > 0);
}

function buildRemainderDonut(remainder: TmcUnifiedRemainderCardCounts): TmcUnifiedKpiDonutSegment[] {
  const segments: TmcUnifiedKpiDonutSegment[] = [
    {
      label: "Просрочено",
      value: remainder.overdueNotPurchasedCount,
      color: DONUT_COLORS.overdue,
    },
    {
      label: "Не закуплено",
      value: remainder.notPurchasedOnTimeCount,
      color: DONUT_COLORS.notPurchased,
    },
    {
      label: "В пути",
      value: remainder.inTransitDonutCount,
      color: DONUT_COLORS.inTransit,
    },
  ];
  return segments.filter((s) => s.value > 0);
}

function buildDeviationDonut(summary: TmcMetricsSummary): TmcUnifiedKpiDonutSegment[] {
  const segments: TmcUnifiedKpiDonutSegment[] = [
    {
      label: "Раньше плана",
      value: summary.deliveryEarlyCount,
      color: DONUT_COLORS.economy,
    },
    {
      label: "В срок",
      value: summary.deliveryOnTimeExactCount,
      color: DONUT_COLORS.onBudget,
    },
    {
      label: "Позже плана",
      value: summary.deliveryLateCount,
      color: DONUT_COLORS.overrun,
    },
    {
      label: "Нет факта",
      value: summary.deliveryMissingCount + summary.deliveryPendingCount,
      color: DONUT_COLORS.notPurchased,
    },
  ];
  return segments.filter((s) => s.value > 0);
}

/**
 * Распределение заполненных статусов CSV («Статус»).
 * Пустые значения не входят; нормализация регистра/написания — categorizeTmcStatus.
 */
function buildStatusDistributionDonut(items: TMCItem[]): TmcUnifiedKpiDonutSegment[] {
  let delivered = 0;
  let partial = 0;
  let plan = 0;

  for (const item of items) {
    const raw = item.statusRaw?.trim();
    if (!raw) continue;
    const cat = categorizeTmcStatus(raw);
    if (cat === "delivered") delivered += 1;
    else if (cat === "partial") partial += 1;
    else if (cat === "plan") plan += 1;
  }

  return [
    { label: "Поставлено", value: delivered, color: DONUT_COLORS.deliveredOnTime },
    { label: "Поставлено частично", value: partial, color: DONUT_COLORS.risk },
    { label: "План", value: plan, color: DONUT_COLORS.notPurchased },
  ].filter((s) => s.value > 0);
}

function buildDiagnostic(
  applications: TmcRequestDynamicsAnalytics,
  contracts: TmcContractConclusionAnalytics,
  deliveries: TmcDeliveryDynamicsAnalytics,
  summary: TmcMetricsSummary,
  controlledTotal: number,
): TmcMetricsDiagnosticTable {
  const appOnTime = applications.units.filter((u) => u.bucket === "on_time").length;
  const appLate = applications.units.filter(
    (u) =>
      u.bucket === "days_1_3" ||
      u.bucket === "days_4_7" ||
      u.bucket === "days_8_14" ||
      u.bucket === "days_over_14",
  ).length;
  const appNoFact = applications.units.filter((u) => u.bucket === "not_submitted").length;
  const appPending = applications.units.filter((u) => u.bucket === "pending").length;

  const conOnTime = contracts.uniqueContracts.filter(isTmcContractOnTime).length;
  const conLate = Math.max(0, contracts.factConcludedCount - conOnTime);
  const conNoFact = contracts.deviationSegments
    .filter((s) => s.bucket === "not_concluded")
    .reduce((s, x) => s + x.count, 0);
  const conPending = contracts.deviationSegments
    .filter((s) => s.bucket === "pending")
    .reduce((s, x) => s + x.count, 0);

  return [
    {
      metric: "APPLICATIONS",
      total: controlledTotal,
      eligible: summary.requestEligibleCount,
      onTime: appOnTime,
      late: appLate,
      noFact: appNoFact,
      notStarted: appPending,
    },
    {
      metric: "CONTRACTS",
      total: controlledTotal,
      eligible: summary.contractEligibleCount,
      onTime: conOnTime,
      late: conLate,
      noFact: conNoFact,
      notStarted: conPending,
    },
    {
      metric: "DELIVERIES",
      total: controlledTotal,
      eligible: summary.deliveryEligibleCount,
      onTime: summary.deliveryEarlyCount + summary.deliveryOnTimeExactCount,
      late: summary.deliveryLateCount,
      noFact: summary.deliveryMissingCount,
      notStarted: summary.deliveryPendingCount,
    },
  ];
}

/**
 * Единая сборка метрик ТМЦ для KPI и аналитических блоков.
 * `today` / `reportDate` — динамическая дата приложения (без hardcoded годов).
 */
export function buildTmcMetrics(
  items: TMCItem[],
  reportDate: Date = new Date(),
  gprTasks: GPRTask[] = [],
): TmcUnifiedMetrics {
  const controlled = tmcKpiPositions(items);
  const applications = buildTmcRequestDynamicsAnalytics(controlled, reportDate, gprTasks);
  const contracts = buildTmcContractConclusionAnalytics(controlled, reportDate);
  const deliveries = buildTmcDeliveryDynamicsAnalytics(controlled, reportDate);
  const summary = buildSummary(controlled, deliveries, contracts, applications, reportDate);
  const kpi = buildKpiFromSummary(summary);
  const financialResult = buildFinancialFromSummary(summary);
  const remainderCard = buildRemainderFromSummary(summary);
  const donutDistributions: TmcUnifiedKpiDonutDistributions = {
    deliveryStatus: buildDeliveryStatusDonut(summary),
    overdueStructure: [
      {
        label: "Просрочено",
        value: remainderCard.overdueNotPurchasedCount,
        color: DONUT_COLORS.overdue,
      },
      {
        label: "Не закуплено",
        value: remainderCard.notPurchasedOnTimeCount,
        color: DONUT_COLORS.notPurchased,
      },
      {
        label: "В работе",
        value: remainderCard.inTransitDonutCount,
        color: DONUT_COLORS.deliveredOnTime,
      },
    ],
    overdueReasons: buildRemainderDonut(remainderCard),
    budgetDeviation: buildDeviationDonut(summary),
    statusDistribution: buildStatusDistributionDonut(controlled),
  };

  return {
    applications,
    contracts,
    deliveries,
    summary,
    kpi,
    financialResult,
    remainderCard,
    donutDistributions,
    diagnostic: buildDiagnostic(
      applications,
      contracts,
      deliveries,
      summary,
      controlled.length,
    ),
  };
}

/** Dev-диагностика согласованности KPI ↔ динамики. */
export function logTmcUnifiedMetricsDiagnostic(metrics: TmcUnifiedMetrics): void {
  if (process.env.NODE_ENV === "production") return;
  console.group("[TMC] Unified metrics — KPI ↔ динамика");
  console.table(metrics.diagnostic);
  console.log({
    kpiDelivery: `${metrics.kpi.deliveryCount}/${metrics.kpi.totalItemCount}`,
    dynamicsDelivery: `${metrics.deliveries.factDeliveredCount}/${metrics.deliveries.units.length}`,
    kpiContracts: `${metrics.summary.contractFactCount}/${metrics.summary.contractEligibleCount}`,
    dynamicsContracts: `${metrics.contracts.factConcludedCount}/${metrics.contracts.uniqueContracts.length}`,
    kpiRequests: `${metrics.summary.requestFactCount}/${metrics.summary.requestEligibleCount}`,
    dynamicsRequests: `${metrics.applications.factSubmittedCount}/${metrics.applications.units.length}`,
  });
  console.groupEnd();
}
