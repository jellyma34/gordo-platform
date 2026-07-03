/**
 * Диагностика расхождения KPI «Поставлено» vs donut карточки.
 * npx tsx scripts/tmc-delivery-donut-diagnostic.ts
 */
import fs from "fs";

import type { TMCItem } from "../lib/tmcData";
import {
  classifyTmcDeliveryPipelineBucket,
  classifyTmcPipelineStatus,
  classifyTmcPurchasedDeliveryBucket,
  computeTmcDeliveryPipelineCounts,
  computeTmcProcurementKpi,
  computeTmcDeliveredDeliveryDonutCounts,
  computeTmcKpiDonutDistributions,
  enrichTmcItems,
  isTmcDeliveryFact,
  isTmcDeliveredSupplyStatus,
  isTmcPurchasedPosition,
  hasTmcSupplyFactDate,
} from "../lib/tmcPresentationAnalytics";

const jsonPath = "data/tmc-import-default.json";
const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as { items: TMCItem[] };
const today = new Date();
const enriched = enrichTmcItems(raw.items ?? [], today);
const kpi = computeTmcProcurementKpi(enriched, today, []);
const donut = computeTmcDeliveredDeliveryDonutCounts(enriched);
const dist = computeTmcKpiDonutDistributions(enriched, {}, today, []);
const segSum = dist.deliveryStatus.reduce((s, x) => s + x.value, 0);
const pipeline = computeTmcDeliveryPipelineCounts(enriched);

const deliveryCount = kpi.deliveryCount;

type Bucket = "deliveredOnTime" | "deliveredLate" | "inTransit" | "cancelled" | null;

const byBucket = new Map<Exclude<Bucket, null>, typeof enriched>();
for (const b of ["deliveredOnTime", "deliveredLate", "inTransit", "cancelled"] as const) {
  byBucket.set(b, []);
}

const notPurchasedForDonut: typeof enriched = [];

for (const item of enriched) {
  const bucket = classifyTmcPurchasedDeliveryBucket(item);
  if (bucket === null) {
    notPurchasedForDonut.push(item);
  } else {
    byBucket.get(bucket)!.push(item);
  }
}

const deliveredItems = enriched.filter((i) => classifyTmcPipelineStatus(i, [], today) === "delivered");
const deliveryFactItems = enriched.filter(isTmcDeliveryFact);
const csvDeliveredItems = enriched.filter(isTmcDeliveredSupplyStatus);
const purchasedItems = enriched.filter(isTmcPurchasedPosition);

function summarize(items: typeof enriched) {
  return items.map((i) => ({
    code: i.itemCode,
    name: i.name.slice(0, 45),
    status: i.status,
    traffic: i.traffic,
    supplyFactDate: i.supplyFactDate ?? "—",
    supplyPlanDate: i.supplyPlanDate ?? "—",
    factCost: i.factCost,
    volumeFact: i.volumeFact,
    pipelineBucket: classifyTmcDeliveryPipelineBucket(i),
    purchasedDonutBucket: classifyTmcPurchasedDeliveryBucket(i),
    isDeliveryFact: isTmcDeliveryFact(i),
    isPurchased: isTmcPurchasedPosition(i),
    hasSupplyFactDate: hasTmcSupplyFactDate(i),
  }));
}

console.log("=".repeat(72));
console.log("TMC DELIVERY KPI vs DONUT DIAGNOSTIC");
console.log("=".repeat(72));

console.log("\n## Сводка счётчиков\n");
console.table({
  deliveryCount_KPI: deliveryCount,
  delivered_pipeline_status: deliveredItems.length,
  isTmcDeliveryFact: deliveryFactItems.length,
  isTmcDeliveredSupplyStatus_CSV: csvDeliveredItems.length,
  purchasedItemCount: kpi.purchasedItemCount,
  isTmcPurchasedPosition: purchasedItems.length,
  donut_deliveredTotal: donut.deliveredTotal,
  donut_deliveredOnTime: donut.deliveredOnTime,
  donut_deliveredLate: donut.deliveredLate,
  donut_noData: donut.noData,
  donut_sum: donut.donutSum,
  ui_segment_sum: segSum,
  deliveryCount_equals_donutSum: deliveryCount === donut.donutSum,
  deliveryCount_equals_segmentSum: deliveryCount === segSum,
  pipeline_deliveredKpi: pipeline.deliveredKpi,
  pipeline_inTransit: pipeline.inTransit,
});

console.log("\n## Проверки равенств\n");
const onTime = donut.deliveredOnTime;
const late = donut.deliveredLate;
const inTransit = donut.inTransit;

console.log(
  `deliveryCount (${deliveryCount}) == deliveredOnTime + deliveredLate (${onTime} + ${late} = ${onTime + late})?`,
  deliveryCount === onTime + late,
);
console.log(
  `deliveryCount (${deliveryCount}) == onTime + late + inTransit (${onTime} + ${late} + ${inTransit} = ${onTime + late + inTransit})?`,
  deliveryCount === onTime + late + inTransit,
);
console.log(
  `purchasedTotal (${donut.purchasedTotal}) == onTime + late + inTransit?`,
  donut.purchasedTotal === onTime + late + inTransit,
);
console.log(
  `pipeline deliveredKpi (${pipeline.deliveredKpi}) == deliveryCount (${deliveryCount})?`,
  pipeline.deliveredKpi === deliveryCount,
);

console.log("\n## Критерии\n");
console.log("deliveryCount: classifyTmcPipelineStatus === 'delivered' → isTmcDeliveryFact (factCost>0 AND (supplyFactDate OR volumeFact>0))");
console.log("donut сегменты: classifyTmcPurchasedDeliveryBucket → только isTmcPurchasedPosition (traffic green|yellow|red)");
console.log("  deliveredOnTime/late: hasTmcSupplyFactDate + deviation по supplyPlan/supplyFact");
console.log("  inTransit: isTmcPurchasedPosition БЕЗ supplyFactDate → classifyTmcPurchasedDeliveryBucket :4225");

console.log("\n## Пересечение donut-сегментов с deliveryCount\n");
for (const [bucket, items] of byBucket) {
  const inDelivery = items.filter((i) => isTmcDeliveryFact(i));
  const notInDelivery = items.filter((i) => !isTmcDeliveryFact(i));
  console.log(`\n### ${bucket}: ${items.length} позиций (в deliveryCount: ${inDelivery.length}, вне: ${notInDelivery.length})`);
  if (notInDelivery.length > 0) {
    console.log("Вне deliveryCount:");
    console.table(summarize(notInDelivery));
  }
}

const inDeliveryNotInDonut = deliveryFactItems.filter((i) => classifyTmcPurchasedDeliveryBucket(i) === null);
console.log(`\n## В deliveryCount, но НЕ в donut (не isTmcPurchasedPosition): ${inDeliveryNotInDonut.length}`);
if (inDeliveryNotInDonut.length) console.table(summarize(inDeliveryNotInDonut));

const onTimeLateItems = [...byBucket.get("deliveredOnTime")!, ...byBucket.get("deliveredLate")!];
const onTimeLateNotDelivery = onTimeLateItems.filter((i) => !isTmcDeliveryFact(i));
console.log(`\n## В donut onTime+late, но НЕ в deliveryCount: ${onTimeLateNotDelivery.length}`);
if (onTimeLateNotDelivery.length) console.table(summarize(onTimeLateNotDelivery));

const inTransitItems = byBucket.get("inTransit")!;
console.log(`\n## Все inTransit (${inTransitItems.length}) — первое место: classifyTmcPurchasedDeliveryBucket :4225`);
console.table(summarize(inTransitItems));

console.log("\n## Альтернативная воронка (computeTmcDeliveryPipelineCounts) — НЕ используется в UI donut\n");
console.table({
  deliveredOnTime: pipeline.deliveredOnTime,
  deliveredLate: pipeline.deliveredLate,
  inTransit: pipeline.inTransit,
  notPurchased: pipeline.notPurchased,
  deliveredKpi: pipeline.deliveredKpi,
  matches_deliveryCount: pipeline.deliveredKpi === deliveryCount,
  sum_all: pipeline.donutSum,
});
