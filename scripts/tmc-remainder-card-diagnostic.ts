/**
 * Диагностика остатка карточки «В работе».
 * npx tsx scripts/tmc-remainder-card-diagnostic.ts
 */
import fs from "fs";

import type { Tender } from "../lib/tenderData";
import type { TMCItem } from "../lib/tmcData";
import {
  classifyTmcContractDeliveryDonutBucket,
  classifyTmcPipelineStatus,
  computeTmcContractDeliveryDonutCounts,
  computeTmcProcurementKpi,
  computeTmcRemainderCardCounts,
  enrichTmcItems,
  isTmcDeliveryFact,
} from "../lib/tmcPresentationAnalytics";

const jsonPath = "data/tmc-import-default.json";
const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as { items: TMCItem[] };
const today = new Date();
const tenderRaw = JSON.parse(fs.readFileSync("data/tender-import-default.json", "utf8")) as {
  tenders: Tender[];
};
const tenders = tenderRaw.tenders ?? [];
const enriched = enrichTmcItems(raw.items ?? [], today);
const kpi = computeTmcProcurementKpi(enriched, today, tenders);
const remainderCard = computeTmcRemainderCardCounts(enriched, tenders, today);
const contractDonut = computeTmcContractDeliveryDonutCounts(enriched, today);

const remaining = enriched.filter((i) => !isTmcDeliveryFact(i));

const pipelineRemainder: Record<string, number> = {};
for (const item of remaining) {
  const s = classifyTmcPipelineStatus(item, tenders, today);
  pipelineRemainder[s] = (pipelineRemainder[s] ?? 0) + 1;
}

const inTransitAmongRemaining = remaining.filter(
  (i) => classifyTmcContractDeliveryDonutBucket(i, today) === "inTransit",
);

const proposed = {
  notStarted: pipelineRemainder.tenderNotAnnounced ?? 0,
  tenderInProgress: pipelineRemainder.tenderInProgress ?? 0,
  inTransit: inTransitAmongRemaining.length,
  overdue: pipelineRemainder.deliveryOverdue ?? 0,
  contractNotSigned: pipelineRemainder.contractNotSigned ?? 0,
  orderPlaced: pipelineRemainder.orderPlaced ?? 0,
};

const inWorkProposed =
  proposed.tenderInProgress + proposed.inTransit + proposed.overdue;

console.log("=".repeat(72));
console.log("TMC REMAINDER CARD DIAGNOSTIC");
console.log("=".repeat(72));
console.table({
  total: enriched.length,
  delivered: kpi.deliveryCount,
  remaining: kpi.remainingItemCount,
  remaining_calc: enriched.length - kpi.deliveryCount,
});
console.log("\n## Pipeline breakdown (remaining only)\n");
console.table(pipelineRemainder);
console.log("\n## Current KPI fields\n");
console.table({
  overdueAmongRemainingCount: kpi.overdueAmongRemainingCount,
  inProgressAmongRemainingCount: kpi.inProgressAmongRemainingCount,
  notPurchasedAmongRemainingCount: kpi.notPurchasedAmongRemainingCount,
});
console.log("\n## Proposed partition\n");
console.table({
  ...proposed,
  inWork_sum: inWorkProposed,
  partition_sum:
    proposed.notStarted +
    proposed.tenderInProgress +
    proposed.inTransit +
    proposed.overdue,
  matches_remaining:
    proposed.notStarted +
      proposed.tenderInProgress +
      proposed.inTransit +
      proposed.overdue ===
    kpi.remainingItemCount,
});
console.log("\n## In transit IDs (remaining)\n");
console.table(
  inTransitAmongRemaining.map((i) => ({
    id: i.id,
    code: i.itemCode,
    name: i.name.slice(0, 40),
    pipeline: classifyTmcPipelineStatus(i, tenders, today),
    contractFactDate: i.contractFactDate,
  })),
);
console.log("\n## contractNotSigned + orderPlaced among remaining\n");
const other = remaining.filter((i) => {
  const s = classifyTmcPipelineStatus(i, tenders, today);
  return s === "contractNotSigned" || s === "orderPlaced";
});
console.log("count:", other.length);
if (other.length) {
  console.table(
    other.map((i) => ({
      id: i.id,
      code: i.itemCode,
      pipeline: classifyTmcPipelineStatus(i, tenders, today),
      inTransitBucket: classifyTmcContractDeliveryDonutBucket(i, today),
      contractFactDate: i.contractFactDate,
    })),
  );
}

const notAnnouncedRemaining = remaining.filter(
  (i) => classifyTmcPipelineStatus(i, tenders, today) === "tenderNotAnnounced",
);
const notAnnouncedNoContract = notAnnouncedRemaining.filter(
  (i) => !i.contractFactDate?.trim(),
);
console.log("\n## notAnnounced variants\n");
console.table({
  tenderNotAnnounced: notAnnouncedRemaining.length,
  notAnnounced_noContractFact: notAnnouncedNoContract.length,
  notAnnounced_minus_inTransit: notAnnouncedRemaining.length - inTransitAmongRemaining.length,
});


console.log("\n## Remainder card (implementation)\n");
console.table(remainderCard);
console.log(
  "remaining === donutSum?",
  remainderCard.remainingItemCount === remainderCard.donutSum,
);
console.log(
  "activeWork = tender + inTransit + overdue?",
  remainderCard.activeWorkCount ===
    remainderCard.tenderInProgressCount +
      remainderCard.inTransitCount +
      remainderCard.overdueCount,
);
console.log(
  "donut = overdueNotPurchased + notPurchased + inTransit?",
  remainderCard.donutSum ===
    remainderCard.overdueNotPurchasedCount +
      remainderCard.notPurchasedOnTimeCount +
      remainderCard.inTransitDonutCount,
);
console.log(
  "notStarted = overdueNotPurchased + notPurchasedOnTime?",
  remainderCard.notStartedCount ===
    remainderCard.overdueNotPurchasedCount + remainderCard.notPurchasedOnTimeCount,
);

