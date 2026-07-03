import fs from "fs";
import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { isValidTmcRow, normalizeTmcCsvRows, parseTmcCsvText } from "../lib/tmcCsvImport";
import { computeTmcProcurementKpi, enrichTmcItems } from "../lib/tmcPresentationAnalytics";

const path = process.argv[2] ?? "C:\\Users\\m.suslova\\Downloads\\Тмц_Май.csv";
const text = decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync(path)));
const { rows, headers } = parseTmcCsvText(text);
const items = normalizeTmcCsvRows(rows, headers);

console.log("parser rows", rows.length, "normalized", items.length);
const junk = rows.filter((r) => !isValidTmcRow(r));
console.log("invalid parser rows (pre carry-forward):", junk.length);
for (const [i, r] of junk.entries()) {
  const name = r[headers[2] ?? ""] ?? "";
  console.log(i + 1, JSON.stringify(String(name)));
}

for (const todayIso of ["2026-05-31", "2026-07-03"]) {
  const today = new Date(`${todayIso}T12:00:00`);
  const kpi = computeTmcProcurementKpi(enrichTmcItems(items, today), today, []);
  console.log(`\nKPI @ ${todayIso}:`, {
    delivery: kpi.deliveryCount,
    purchased: kpi.purchasedItemCount,
    notPurchased: kpi.notPurchasedAmongRemainingCount,
    inProgress: kpi.inProgressAmongRemainingCount,
    overdueRemaining: kpi.overdueAmongRemainingCount,
    avgOverdue: kpi.averageOverdueDays,
  });
}
