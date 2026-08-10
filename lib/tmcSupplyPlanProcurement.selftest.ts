import {
  classifyTmcSupplyPlanMaterialStatus,
  computeTmcSupplyPlanMaterialStatusDistribution,
  enrichTmcItems,
  isTmcSupplyPlanPurchasedLate,
} from "./tmcPresentationAnalytics";
import {
  classifyTmcSupplyPlanProcurementStatus,
  computeSupplyPlanProcurementDiagnostics,
  createEmptyTmcItem,
  deriveTmcSupplyPlanProcurementStatus,
  syncTmcFinancials,
  type TMCItem,
} from "./tmcData";

const cases: [number, number, "notPurchased" | "partial" | "full"][] = [
  [10, 0, "notPurchased"],
  [10, 5, "partial"],
  [10, 10, "full"],
  [10, 15, "full"],
  [0, 3, "full"],
];

for (const [plan, ordered, expected] of cases) {
  const got = deriveTmcSupplyPlanProcurementStatus(plan, ordered);
  if (got !== expected) {
    throw new Error(`derive(${plan}, ${ordered}) expected ${expected}, got ${got}`);
  }
}

const baseItem = (overrides: Partial<TMCItem>): TMCItem =>
  createEmptyTmcItem("residential", {
    id: "t1",
    itemCode: "2.05.01.001",
    name: "Test",
    gprStage: "Строительство зданий и сооружений",
    unit: "шт",
    volumePlan: 10,
    volumeFact: 0,
    plannedQuantity: 10,
    actualQuantity: 0,
    ...overrides,
  });

if (classifyTmcSupplyPlanProcurementStatus(baseItem({})) !== "notPurchased") {
  throw new Error("Expected notPurchased for zero ordered volume");
}

const diag = computeSupplyPlanProcurementDiagnostics([
  baseItem({ volumeFact: 0, actualQuantity: 0 }),
  baseItem({ id: "t2", volumeFact: 5, actualQuantity: 5 }),
  baseItem({ id: "t3", volumeFact: 10, actualQuantity: 10, statusCategory: "delivered", status: "поставлено" }),
]);

if (diag.totalMaterials !== 3) throw new Error(`totalMaterials expected 3, got ${diag.totalMaterials}`);
if (diag.notPurchased !== 1) throw new Error(`notPurchased expected 1, got ${diag.notPurchased}`);
if (diag.partiallyPurchased !== 1) {
  throw new Error(`partiallyPurchased expected 1, got ${diag.partiallyPurchased}`);
}
if (diag.fullyPurchased !== 1) throw new Error(`fullyPurchased expected 1, got ${diag.fullyPurchased}`);
if (diag.totalPlanCostRub !== 0) {
  throw new Error(`totalPlanCostRub expected 0 (no price in new model), got ${diag.totalPlanCostRub}`);
}
if (diag.totalFactCostRub !== 0) {
  throw new Error(`totalFactCostRub expected 0 (no price in new model), got ${diag.totalFactCostRub}`);
}

const today = new Date("2026-07-13T12:00:00");
const fullOnTime = enrichTmcItems([
  baseItem({ id: "d1", volumeFact: 10, supplyPlanDate: "2026-06-01", supplyFactDate: "2026-06-01" }),
])[0]!;
const partialLate = enrichTmcItems([
  baseItem({
    id: "d2",
    volumeFact: 5,
    supplyPlanDate: "2026-06-01",
    supplyFactDate: "2026-06-10",
  }),
])[0]!;
const fullLateByOverdue = enrichTmcItems([
  baseItem({ id: "d3", volumeFact: 10, supplyPlanDate: "2026-01-01", supplyFactDate: null }),
])[0]!;
const notPurchased = enrichTmcItems([baseItem({ id: "d4", volumeFact: 0 })])[0]!;

if (classifyTmcSupplyPlanMaterialStatus(fullOnTime, today) !== "fullyPurchased") {
  throw new Error("Expected fullyPurchased for on-time full delivery");
}
if (classifyTmcSupplyPlanMaterialStatus(partialLate, today) !== "purchasedLate") {
  throw new Error("Expected purchasedLate for partial with late fact date");
}
if (classifyTmcSupplyPlanMaterialStatus(fullLateByOverdue, today) !== "purchasedLate") {
  throw new Error("Expected purchasedLate for full volume with overdue plan date");
}
if (classifyTmcSupplyPlanMaterialStatus(notPurchased, today) !== "notPurchased") {
  throw new Error("Expected notPurchased for zero ordered volume");
}
if (!isTmcSupplyPlanPurchasedLate(partialLate, today)) {
  throw new Error("partialLate should be late");
}
if (isTmcSupplyPlanPurchasedLate(fullOnTime, today)) {
  throw new Error("fullOnTime should not be late");
}

const distribution = computeTmcSupplyPlanMaterialStatusDistribution(
  [fullOnTime, partialLate, fullLateByOverdue, notPurchased],
  today,
);
if (distribution.deliveredCount !== distribution.fullyPurchased) {
  throw new Error("deliveredCount must equal fullyPurchased");
}
if (distribution.statusSum !== 4) {
  throw new Error(`statusSum expected 4, got ${distribution.statusSum}`);
}
if (distribution.fullyPurchased !== 1) {
  throw new Error(`fullyPurchased expected 1, got ${distribution.fullyPurchased}`);
}

console.log("tmcSupplyPlanProcurement.selftest: OK", diag);
