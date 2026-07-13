import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { TENDER_DATA, type Tender } from "./tenderData";
import { parseTenderProcurementCsvText } from "./tenderProcurementCsvImport";
import {
  applyTenderProcurementRowToTender,
  findTenderProcurementMatchIndex,
  syncTenderProcurementData,
} from "./syncTenderProcurementData";

const samplePath = resolve(__dirname, "../data/tender-procurement-sample.csv");
const csvText = readFileSync(samplePath, "utf8");
const { tenders: incoming, audit } = parseTenderProcurementCsvText(csvText);

if (incoming.length < 2) {
  throw new Error(`Expected at least 2 procurement rows, got ${incoming.length}`);
}

const base: Tender[] = [
  {
    ...TENDER_DATA[0]!,
    id: "tender-base-1",
    partId: 1,
    code: "2.05.05.1",
    name: "Старое название",
    contractor: "Сохранённый подрядчик",
    comment: "Комментарий из основного реестра",
  },
];

const matchIndex = findTenderProcurementMatchIndex(base, incoming[0]!);
if (matchIndex !== 0) {
  throw new Error(`Expected match by code at index 0, got ${matchIndex}`);
}

const merged = applyTenderProcurementRowToTender(base[0]!, incoming[0]!);
if (merged.contractor !== "Сохранённый подрядчик" && !incoming[0]!.contractor) {
  // incoming row 1 has no contractor — preserve existing
}
if (!incoming[0]!.contractor && merged.contractor !== base[0]!.contractor) {
  throw new Error("Contractor must be preserved when not present in procurement CSV");
}
if (merged.factCost == null && incoming[0]!.factCost != null) {
  throw new Error("Expected factCost from procurement CSV");
}

const { tenders: upserted, stats } = syncTenderProcurementData(base, incoming, 1, audit);

if (stats.matched < 1) {
  throw new Error(`Expected at least 1 match, got ${stats.matched}`);
}
if (stats.created < 1) {
  throw new Error(`Expected at least 1 created row, got ${stats.created}`);
}
if (upserted.length !== base.length - 1 + incoming.length) {
  throw new Error(`Unexpected registry size: ${upserted.length}`);
}

const updatedRow = upserted.find((t) => t.id === "tender-base-1");
if (!updatedRow) {
  throw new Error("Updated base tender not found");
}
if (updatedRow.name === "Старое название") {
  throw new Error("Name should be updated from procurement CSV");
}

console.log("syncTenderProcurementData.selftest: OK", stats);
