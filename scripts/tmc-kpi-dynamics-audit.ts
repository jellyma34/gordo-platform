/**
 * Аудит расхождений KPI vs динамики заявок/договоров/поставок.
 * npx tsx scripts/tmc-kpi-dynamics-audit.ts [path-to-csv]
 */
import fs from "fs";
import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { normalizeTmcCsvRows, parseTmcCsvText } from "../lib/tmcCsvImport";
import { enrichTmcItems } from "../lib/tmcPresentationAnalytics";
import { buildTmcMetrics } from "../lib/tmcUnifiedMetrics";
import {
  isTmcControlledPosition,
  normalizeTmcRowLoose,
  type TMCItem,
} from "../lib/tmcData";

function loadItems(argvPath?: string): TMCItem[] {
  if (argvPath) {
    const text = decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync(argvPath)));
    const parsed = parseTmcCsvText(text);
    return normalizeTmcCsvRows(parsed.rows, parsed.headers);
  }

  const jsonPath = "data/tmc-import-default.json";
  if (fs.existsSync(jsonPath)) {
    const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const rows = Array.isArray(raw) ? raw : (raw.items ?? raw.data ?? []);
    return rows.map(normalizeTmcRowLoose).filter((x: TMCItem | null): x is TMCItem => x !== null);
  }

  const csvPath = "data/tmc-new-sample.csv";
  const text = decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync(csvPath)));
  const parsed = parseTmcCsvText(text);
  return normalizeTmcCsvRows(parsed.rows, parsed.headers);
}

const items = loadItems(process.argv[2]);
const today = new Date();
const controlled = items.filter(isTmcControlledPosition);
const enriched = enrichTmcItems(controlled, today);
const metrics = buildTmcMetrics(enriched, today, []);

console.log(
  JSON.stringify(
    {
      today: today.toISOString().slice(0, 10),
      controlled: enriched.length,
      diagnostic: metrics.diagnostic,
      KPI: {
        delivery: `${metrics.kpi.deliveryCount}/${metrics.kpi.totalItemCount}`,
        remaining: `${metrics.remainderCard.activeWorkCount}/${metrics.kpi.remainingItemCount}`,
        early: metrics.financialResult.economyRub,
        late: metrics.financialResult.overrunRub,
        factPlan: [
          metrics.financialResult.purchasedFactRub,
          metrics.financialResult.purchasedPlanRub,
        ],
        contracts: `${metrics.summary.contractFactCount}/${metrics.summary.contractEligibleCount}`,
        requests: `${metrics.summary.requestFactCount}/${metrics.summary.requestEligibleCount}`,
      },
      DELIVERY: {
        eligible: metrics.deliveries.units.length,
        withFact: metrics.deliveries.factDeliveredCount,
        buckets: Object.fromEntries(
          metrics.deliveries.deviationSegments.map((s) => [s.bucket, s.count]),
        ),
      },
      REQUEST: {
        eligible: metrics.applications.units.length,
        withFact: metrics.applications.factSubmittedCount,
        buckets: Object.fromEntries(
          metrics.applications.deviationSegments.map((s) => [s.bucket, s.count]),
        ),
      },
      CONTRACT: {
        unique: metrics.contracts.uniqueContracts.length,
        withFact: metrics.contracts.factConcludedCount,
        buckets: Object.fromEntries(
          metrics.contracts.deviationSegments.map((s) => [s.bucket, s.count]),
        ),
      },
    },
    null,
    2,
  ),
);

console.log("\n=== MISMATCH CHECK ===");
const checks = [
  ["delivery fact", metrics.kpi.deliveryCount, metrics.deliveries.factDeliveredCount],
  ["delivery eligible", metrics.kpi.totalItemCount, metrics.deliveries.units.length],
  ["contracts fact", metrics.summary.contractFactCount, metrics.contracts.factConcludedCount],
  ["requests fact", metrics.summary.requestFactCount, metrics.applications.factSubmittedCount],
] as const;
for (const [label, a, b] of checks) {
  console.log(`${label}: ${a} vs ${b}`, a === b ? "OK" : "DIFF");
}
