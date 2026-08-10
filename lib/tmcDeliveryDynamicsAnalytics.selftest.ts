/**
 * Self-test: сценарии бакетов «Динамика поставок».
 * Запуск: npx tsx lib/tmcDeliveryDynamicsAnalytics.selftest.ts
 */
import {
  buildTmcDeliveryDynamicsAnalytics,
  resolveTmcDeliveryFactIso,
  resolveTmcDeliveryPlanIso,
} from "./tmcDeliveryDynamicsAnalytics";
import { createEmptyTmcItem, type TMCItem } from "./tmcData";

function pos(partial: Partial<TMCItem> & { id: string }): TMCItem {
  const code = partial.itemCode ?? "2.05.01";
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
    contract: "",
    status: "план",
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
    deliveryPlanDate: "2025-09-20",
    deliveryFactDate: "2025-09-18",
  }),
  // 2. В плановую дату → В срок
  pos({
    id: "exact",
    deliveryPlanDate: "2025-10-10",
    deliveryFactDate: "2025-10-10",
  }),
  // 3. +5 дней → 4–7
  pos({
    id: "late5",
    deliveryPlanDate: "2025-11-01",
    deliveryFactDate: "2025-11-06",
  }),
  // 4. +20 дней → >14
  pos({
    id: "late20",
    deliveryPlanDate: "2025-12-01",
    deliveryFactDate: "2025-12-21",
  }),
  // 5. Нет факта, план впереди → Срок не наступил
  pos({
    id: "pending",
    deliveryPlanDate: "2026-12-15",
    deliveryFactDate: null,
  }),
  // 6. Нет факта, план прошёл → Не поставлено
  pos({
    id: "missing",
    deliveryPlanDate: "2025-10-01",
    deliveryFactDate: null,
  }),
  // 7. Дубликат id
  pos({
    id: "early",
    deliveryPlanDate: "2025-09-20",
    deliveryFactDate: "2025-09-18",
  }),
  // Без плановой даты — исключить
  pos({
    id: "no-plan",
    deliveryPlanDate: null,
    deliveryFactDate: "2025-09-01",
  }),
  // Без связи с ГПР — исключить
  pos({
    id: "no-gpr",
    itemCode: "-",
    sourceCode: "-",
    parentWbsCode: null,
    gprStartDate: null,
    deliveryPlanDate: "2025-09-05",
    deliveryFactDate: "2025-09-05",
  }),
  // Договор/заявка НЕ подменяют факт поставки
  pos({
    id: "contract-only",
    deliveryPlanDate: "2025-09-15",
    deliveryFactDate: null,
    contractFactDate: "2025-09-10",
    requestFactDate: "2025-09-08",
  }),
];

const analytics = buildTmcDeliveryDynamicsAnalytics(items, reportDate);

assert(analytics.units.length === 7, `expected 7 units, got ${analytics.units.length}`);
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
  byId.missing?.bucket === "not_delivered",
  `missing → not_delivered, got ${byId.missing?.bucket}`,
);
assert(
  byId["contract-only"]?.bucket === "not_delivered",
  "contract/request fact must not count as delivery",
);
assert(byId["contract-only"]?.actualDeliveryDate == null, "no delivery fact");

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
assert(late5.planDeliveryDate === "2025-11-01", `plan ${late5.planDeliveryDate}`);
assert(late5.actualDeliveryDate === "2025-11-06", `fact ${late5.actualDeliveryDate}`);

const nov = analytics.monthlyRows.find((r) => r.monthKey === "2025-11");
assert((nov?.plan ?? 0) >= 1, "Nov plan from late5");
assert((nov?.fact ?? 0) >= 1, "Nov fact from late5");

assert(analytics.factDeliveredCount === 4, `fact center ${analytics.factDeliveredCount}`);
assert(analytics.onTimeOverallPct === 50, `on-time pct ${analytics.onTimeOverallPct}`);

// Поля резолвера не берут договор
const fake = pos({
  id: "resolver",
  deliveryPlanDate: null,
  deliveryFactDate: null,
  supplyPlanDate: null,
  supplyFactDate: null,
  contractPlanDate: "2025-01-01",
  contractFactDate: "2025-01-02",
  requestPlanDate: "2025-01-01",
  requestFactDate: "2025-01-02",
});
assert(resolveTmcDeliveryPlanIso(fake) == null, "plan must ignore contract/request");
assert(resolveTmcDeliveryFactIso(fake) == null, "fact must ignore contract/request");

console.log("tmcDeliveryDynamicsAnalytics.selftest: OK");
