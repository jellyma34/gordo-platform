/**
 * Self-test: сценарии бакетов «Динамика заявок».
 * Запуск: npx tsx lib/tmcRequestDynamicsAnalytics.selftest.ts
 */
import { buildTmcRequestDynamicsAnalytics } from "./tmcRequestDynamicsAnalytics";
import { createEmptyTmcItem, type TMCItem } from "./tmcData";

function pos(partial: Partial<TMCItem> & { id: string }): TMCItem {
  return createEmptyTmcItem("residential", {
    id: partial.id,
    itemCode: partial.itemCode ?? "2.05.01",
    name: partial.name ?? partial.id,
    gprStage: "Строительство",
    unit: "шт",
    volumePlan: 1,
    volumeFact: 0,
    plannedQuantity: 1,
    actualQuantity: 0,
    supplier: "",
    contract: "",
    status: "план",
    supplyPlanDate: null,
    supplyFactDate: null,
    contractPlanDate: null,
    contractFactDate: null,
    gprStartDate: partial.gprStartDate ?? null,
    orderDeadlineDays: partial.orderDeadlineDays ?? null,
    requestFactDate: partial.requestFactDate ?? null,
    requestPlanDate: partial.requestPlanDate ?? null,
  });
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const reportDate = new Date(2026, 7, 10, 12, 0, 0); // 10 Aug 2026

const items: TMCItem[] = [
  // 1. Раньше плана → В срок
  pos({
    id: "early",
    gprStartDate: "2025-09-17",
    orderDeadlineDays: 30, // plan = 2025-08-18
    requestFactDate: "2025-08-15",
  }),
  // 2. В плановую дату → В срок
  pos({
    id: "exact",
    gprStartDate: "2025-10-20",
    orderDeadlineDays: 30, // plan = 2025-09-20
    requestFactDate: "2025-09-20",
  }),
  // 3. +5 дней → 4–7
  pos({
    id: "late5",
    gprStartDate: "2025-11-15",
    orderDeadlineDays: 30, // plan = 2025-10-16
    requestFactDate: "2025-10-21",
  }),
  // 4. +20 дней → >14
  pos({
    id: "late20",
    gprStartDate: "2025-12-20",
    orderDeadlineDays: 30, // plan = 2025-11-20
    requestFactDate: "2025-12-10",
  }),
  // 5. Нет факта, план впереди → Срок не наступил
  pos({
    id: "pending",
    gprStartDate: "2027-01-15",
    orderDeadlineDays: 30, // plan = 2026-12-16
    requestFactDate: null,
  }),
  // 6. Нет факта, план прошёл → Не поданы
  pos({
    id: "missing",
    gprStartDate: "2025-10-29",
    orderDeadlineDays: 60, // plan = 2025-08-30
    requestFactDate: null,
  }),
  // 7. Дубликат id не должен появиться (тот же id)
  pos({
    id: "early",
    gprStartDate: "2025-09-17",
    orderDeadlineDays: 30,
    requestFactDate: "2025-08-15",
  }),
  // Без плановой даты — исключить
  pos({
    id: "no-plan",
    gprStartDate: null,
    orderDeadlineDays: null,
    requestFactDate: "2025-09-01",
  }),
];

const analytics = buildTmcRequestDynamicsAnalytics(items, reportDate, []);

assert(analytics.units.length === 6, `expected 6 units, got ${analytics.units.length}`);
assert(
  analytics.units.filter((u) => u.id === "early").length === 1,
  "duplicate id counted twice",
);

const byId = Object.fromEntries(analytics.units.map((u) => [u.id, u]));
assert(byId.early?.bucket === "on_time", `early → on_time, got ${byId.early?.bucket}`);
assert(byId.exact?.bucket === "on_time", `exact → on_time, got ${byId.exact?.bucket}`);
assert(byId.late5?.bucket === "days_4_7", `late5 → days_4_7, got ${byId.late5?.bucket}`);
assert(byId.late5?.deviationDays === 5, `late5 deviation 5, got ${byId.late5?.deviationDays}`);
assert(byId.late20?.bucket === "days_over_14", `late20 → >14, got ${byId.late20?.bucket}`);
assert(byId.pending?.bucket === "pending", `pending → pending, got ${byId.pending?.bucket}`);
assert(
  byId.missing?.bucket === "not_submitted",
  `missing → not_submitted, got ${byId.missing?.bucket}`,
);

assert(analytics.monthlyRows[0]?.monthKey === "2025-09", "chart must start Sep 2025");
assert(
  !analytics.monthlyRows.some((r) => r.monthKey.startsWith("2024")),
  "must not include 2024",
);
assert(
  analytics.monthlyRows[analytics.monthlyRows.length - 1]?.monthKey === "2026-08",
  "chart end must be current month Aug 2026",
);

const late5 = byId.late5!;
assert(late5.planApplicationDate === "2025-10-16", `plan date ${late5.planApplicationDate}`);
assert(late5.actualApplicationDate === "2025-10-21", `fact date ${late5.actualApplicationDate}`);

const planOct = analytics.monthlyRows.find((r) => r.monthKey === "2025-10");
assert((planOct?.plan ?? 0) >= 1, "Oct 2025 should have plan count from late5 plan date");
assert((planOct?.fact ?? 0) >= 1, "Oct 2025 should have fact count from late5 fact date");

assert(analytics.factSubmittedCount === 4, `fact center ${analytics.factSubmittedCount}`);
assert(analytics.onTimeOverallPct === 50, `on-time pct ${analytics.onTimeOverallPct}`);

console.log("tmcRequestDynamicsAnalytics.selftest: OK");
