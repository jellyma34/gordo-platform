/**
 * Полная симуляция UI-цепочки (без React).
 * npx tsx scripts/tender-ui-pipeline-full-trace.ts
 */
import { File } from "node:buffer";
import { readFileSync } from "node:fs";

import { diffTendersImportScoped } from "../lib/tenderImportDiff";
import { importTenderCsvFile } from "../lib/tenderCsvImportUi";
import { saveTendersToLocalStorage } from "../lib/tenderImportPersistence";

async function main() {
  const bytes = readFileSync("data/tender-gpr-articles-149.csv");
  const file = new File([bytes], "tender-gpr-articles-149.csv", { type: "text/csv" });
  const items: import("../lib/tenderData").Tender[] = [];

  console.log("=== importTenderCsvFile ===");
  const { tenders: normalized, audit } = await importTenderCsvFile(file);
  console.log({
    stage: "1.after normalize",
    loaded: audit.loaded,
    invalid: audit.skipped,
    normalizedCount: normalized.length,
    firstCode: normalized[0]?.code ?? null,
  });

  if (normalized.length === 0) {
    console.warn("FIRST_ZERO_LOSS: normalize → normalized.length=0");
    return;
  }

  console.log("=== before diff ===");
  console.log({ normalizedCount: normalized.length, firstCode: normalized[0]?.code ?? null });

  const { result, stats } = diffTendersImportScoped(items, normalized, audit.parsedRows);
  console.log("=== after diff ===");
  console.log({
    added: stats.added,
    updated: stats.updated,
    unchanged: stats.unchanged,
    resultCount: result.length,
    firstCode: result[0]?.code ?? null,
  });

  console.log("=== before save (simulated) ===");
  console.log({ recordsToSave: result.length, firstRecord: result[0]?.code ?? null });

  if (typeof globalThis.localStorage === "undefined") {
    console.log("(localStorage недоступен в Node — save пропущен)");
  } else {
    saveTendersToLocalStorage("test-project", result);
    console.log({ savedCount: result.length });
  }

  console.log("\nUI labels would show:");
  console.log({
    "загружено (importAudit.loaded)": audit.loaded,
    "пропущено (importAudit.skipped)": audit.skipped,
    "в реестре (importStats.total)": stats.total,
  });
}

void main();
