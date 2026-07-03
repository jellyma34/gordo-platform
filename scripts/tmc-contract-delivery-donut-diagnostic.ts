/**
 * Диагностика donut «ПОСТАВЛЕНО»: база = countTmcRequestFactsThroughToday (27).
 * npx tsx scripts/tmc-contract-delivery-donut-diagnostic.ts
 */
import fs from "fs";

import type { TMCItem } from "../lib/tmcData";
import {
  countTmcRequestFactsThroughToday,
  enrichTmcItems,
  isTmcDeliveryFact,
  isTmcRequestFactThroughToday,
  tmcDeviationDays,
  tmcSupplyDeliveryDeviationDays,
} from "../lib/tmcPresentationAnalytics";

type Bucket = "deliveredOnTime" | "deliveredLate" | "inTransit";

function classifyContractDeliveryDonut(
  item: ReturnType<typeof enrichTmcItems>[number],
  today: Date,
): Bucket | null {
  if (!isTmcRequestFactThroughToday(item, today)) return null;
  if (isTmcDeliveryFact(item)) {
    const deviationDays =
      tmcSupplyDeliveryDeviationDays(item) ?? tmcDeviationDays(item);
    if (deviationDays !== null && deviationDays > 0) return "deliveredLate";
    return "deliveredOnTime";
  }
  return "inTransit";
}

const jsonPath = "data/tmc-import-default.json";
const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as { items: TMCItem[] };
const today = new Date();
const enriched = enrichTmcItems(raw.items ?? [], today);

const contractCount = countTmcRequestFactsThroughToday(enriched, today);
const byBucket: Record<Bucket, typeof enriched> = {
  deliveredOnTime: [],
  deliveredLate: [],
  inTransit: [],
};

for (const item of enriched) {
  const b = classifyContractDeliveryDonut(item, today);
  if (b) byBucket[b].push(item);
}

const onTime = byBucket.deliveredOnTime.length;
const late = byBucket.deliveredLate.length;
const inTransit = byBucket.inTransit.length;
const sum = onTime + late + inTransit;

console.log("=".repeat(72));
console.log("TMC CONTRACT DELIVERY DONUT — PRE-CHANGE DIAGNOSTIC");
console.log("=".repeat(72));
console.log("\n## Сегменты\n");
console.table({
  countTmcRequestFactsThroughToday: contractCount,
  deliveredOnTime: onTime,
  deliveredLate: late,
  inTransit,
  sum,
  matches_contract: sum === contractCount,
});

console.log("\n## Проверка\n");
console.log(
  `contractCount (${contractCount}) == onTime + late + inTransit (${onTime}+${late}+${inTransit}=${sum})?`,
  contractCount === sum,
);

console.log("\n## В пути — ID позиций\n");
console.table(
  byBucket.inTransit.map((i) => ({
    id: i.id,
    code: i.itemCode,
    name: i.name.slice(0, 50),
    contractFactDate: i.contractFactDate,
    supplyFactDate: i.supplyFactDate ?? "—",
    factCost: i.factCost,
    volumeFact: i.volumeFact,
    status: i.status,
  })),
);
