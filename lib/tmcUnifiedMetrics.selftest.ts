/**
 * Self-test: KPI ↔ динамика используют один набор delivery/request/contract units.
 * Запуск: npx tsx lib/tmcUnifiedMetrics.selftest.ts
 */
import { categorizeTmcStatus, createEmptyTmcItem, type TMCItem } from "./tmcData";
import { buildTmcMetrics } from "./tmcUnifiedMetrics";

function pos(partial: Partial<TMCItem> & { id: string }): TMCItem {
  const code = partial.itemCode ?? "2.05.01";
  const statusRaw =
    partial.statusRaw ??
    (typeof partial.status === "string" ? partial.status : "план");
  return createEmptyTmcItem("residential", {
    id: partial.id,
    itemCode: code,
    sourceCode: partial.sourceCode ?? code,
    parentWbsCode: "parentWbsCode" in partial ? (partial.parentWbsCode ?? null) : null,
    name: partial.name ?? partial.id,
    gprStage: "Строительство",
    unit: "шт",
    volumePlan: 1,
    volumeFact: 0,
    plannedQuantity: 1,
    actualQuantity: 0,
    supplier: "",
    contract: partial.contract ?? "",
    status: partial.status ?? "план",
    statusRaw,
    statusCategory: partial.statusCategory ?? categorizeTmcStatus(statusRaw),
    supplyPlanDate: null,
    supplyFactDate: null,
    contractPlanDate: partial.contractPlanDate ?? null,
    contractFactDate: partial.contractFactDate ?? null,
    gprStartDate: "gprStartDate" in partial ? (partial.gprStartDate ?? null) : "2025-09-17",
    deliveryPlanDate: partial.deliveryPlanDate ?? null,
    deliveryFactDate: partial.deliveryFactDate ?? null,
    deliveryDeviationDays: partial.deliveryDeviationDays ?? null,
    requestFactDate: partial.requestFactDate ?? null,
    requestPlanDate: partial.requestPlanDate ?? null,
    orderDeadlineDays: partial.orderDeadlineDays ?? 30,
  });
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const reportDate = new Date(2026, 7, 10, 12, 0, 0);

const items: TMCItem[] = [
  pos({
    id: "d-early",
    deliveryPlanDate: "2025-09-20",
    deliveryFactDate: "2025-09-18",
    status: "поставлено",
    statusCategory: "delivered",
  }),
  pos({
    id: "d-late",
    deliveryPlanDate: "2025-11-01",
    deliveryFactDate: "2025-11-06",
    status: "поставлено",
    statusCategory: "delivered",
  }),
  pos({
    id: "d-missing",
    deliveryPlanDate: "2025-10-01",
    deliveryFactDate: null,
    // status говорит «поставлено», но факта даты нет — KPI не должен считать поставленным
    status: "поставлено",
    statusCategory: "delivered",
    actualQuantity: 5,
  }),
  pos({
    id: "d-pending",
    deliveryPlanDate: "2026-12-15",
    deliveryFactDate: null,
  }),
  pos({
    id: "no-plan-status-delivered",
    deliveryPlanDate: null,
    deliveryFactDate: null,
    status: "поставлено",
    statusCategory: "delivered",
    actualQuantity: 10,
  }),
  pos({
    id: "c1",
    contract: "ДГ-1",
    contractPlanDate: "2025-09-01",
    contractFactDate: "2025-09-01",
    deliveryPlanDate: "2025-09-10",
    deliveryFactDate: "2025-09-10",
  }),
];

const metrics = buildTmcMetrics(items, reportDate, []);

assert(
  metrics.kpi.deliveryCount === metrics.deliveries.factDeliveredCount,
  `KPI deliveryCount ${metrics.kpi.deliveryCount} !== dynamics ${metrics.deliveries.factDeliveredCount}`,
);
assert(
  metrics.kpi.totalItemCount === metrics.deliveries.units.length,
  `KPI total ${metrics.kpi.totalItemCount} !== eligible ${metrics.deliveries.units.length}`,
);
assert(
  metrics.kpi.deliveryCount === 3,
  `expected 3 delivered (early, late, c1), got ${metrics.kpi.deliveryCount}`,
);
assert(
  metrics.kpi.totalItemCount === 5,
  `expected 5 eligible (excl no-plan), got ${metrics.kpi.totalItemCount}`,
);
assert(
  metrics.summary.deliveryMissingCount === 1,
  `status-without-fact must be not_delivered, got missing=${metrics.summary.deliveryMissingCount}`,
);
assert(
  metrics.financialResult.overrunRub === metrics.summary.deliveryLateCount,
  "financial late !== summary late",
);
assert(
  metrics.financialResult.economyRub === metrics.summary.deliveryEarlyCount,
  "financial early !== summary early",
);
assert(
  metrics.remainderCard.remainingItemCount === metrics.kpi.remainingItemCount,
  "remainder !== kpi remaining",
);
assert(
  metrics.summary.contractFactCount === metrics.contracts.factConcludedCount,
  "contract KPI !== dynamics",
);

const donutSum = metrics.donutDistributions.deliveryStatus.reduce((s, x) => s + x.value, 0);
assert(
  donutSum === metrics.kpi.totalItemCount,
  `delivery donut ${donutSum} !== eligible ${metrics.kpi.totalItemCount}`,
);

const statusSum = metrics.donutDistributions.statusDistribution.reduce((s, x) => s + x.value, 0);
assert(statusSum > 0, "status distribution should count filled CSV statuses");
assert(
  !metrics.donutDistributions.statusDistribution.some((s) => s.label === "Нет факта"),
  "empty/no_fact statuses must be excluded from status distribution",
);

console.log("tmcUnifiedMetrics.selftest: OK");
console.table(metrics.diagnostic);
