/**
 * Сквозная проверка: CSV → bulk-import → PostgreSQL → GET API.
 * Запуск: npx tsx scripts/e2e-construction-local.ts
 */
import fs from "fs";
import path from "path";

const API = process.env.E2E_API_URL || "http://127.0.0.1:8080";
process.env.NEXT_PUBLIC_API_URL = API;

const root = process.cwd();

async function main() {
  const { loginRequest } = await import("../lib/auth");
  const {
    bulkImportGprTasksToDb,
    bulkImportTendersToDb,
    bulkImportTmcToDb,
    listGprTasksFromDb,
    listTendersFromDb,
    listTmcFromDb,
  } = await import("../lib/constructionApi");
  const { mergeGprTasksFromReportCsv } = await import("../lib/gprTasksMergeFromReportCsv");
  const { normalizeTenderCsvRowsWithAudit, parseTenderCsvText } = await import("../lib/tenderCsvImport");
  type TMCItem = import("../lib/tmcData").TMCItem;

  console.log("API:", API);

  const auth = await loginRequest("marislova34@gmail.com", "1234");
  const token = auth.token;
  console.log("LOGIN OK:", auth.user.email, auth.user.role);

  // ─── GPR CSV ─────────────────────────────────────────────────────────────
  const { decodeCsvBytesWithBestEncoding } = await import("../lib/csvTextEncoding");
  const gprCsvPath = path.join(root, "data/gpr-report-sample.csv");
  const gprCsv = decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync(gprCsvPath)));
  const { tasks: gprTasks, stats: gprStats } = mergeGprTasksFromReportCsv([], gprCsv, { forcedPartId: 1 });
  console.log("\n[GPR CSV]", gprCsvPath);
  console.log("  parsed rows:", gprStats.parsedRowCount, "tasks:", gprTasks.length);
  const gprSaved = await bulkImportGprTasksToDb(token, gprTasks);
  console.log("  bulk-import saved:", gprSaved.length);

  // ─── Tender CSV ──────────────────────────────────────────────────────────
  const tenderCsvPath = path.join(root, "data/tender-import-sample.csv");
  const tenderCsv = fs.readFileSync(tenderCsvPath, "utf8");
  const tenderParsed = parseTenderCsvText(tenderCsv);
  const { tenders } = normalizeTenderCsvRowsWithAudit(tenderParsed.rows, tenderParsed.headers, {
    layout: tenderParsed.layout,
    dataStartFileRow: tenderParsed.dataStartFileRow,
  });
  console.log("\n[Tender CSV]", tenderCsvPath);
  console.log("  tenders:", tenders.length);
  const tenderSaved = await bulkImportTendersToDb(token, tenders);
  console.log("  bulk-import saved:", tenderSaved.length);

  // ─── TMC (минимальный тестовый набор, без CSV-образца в repo) ───────────
  const tmcItems: TMCItem[] = [
    {
      id: "tmc-e2e-001",
      itemCode: "2.05.01.1",
      name: "E2E тестовая позиция ТМЦ",
      gprStage: "2.05",
      unit: "шт",
      volumePlan: 10,
      volumeFact: 5,
      pricePlan: 1000,
      priceFact: 1100,
      totalPlan: 10000,
      totalFact: 5500,
      supplier: "E2E Supplier",
      contract: "DOG-001",
      status: "план",
      planCost: 10000,
      factCost: 5500,
      supplyPlanDate: "2026-06-01",
      supplyFactDate: null,
      contractPlanDate: "2026-05-15",
      contractFactDate: null,
      projectPart: "residential",
    },
  ];
  console.log("\n[TMC test payload]");
  console.log("  items:", tmcItems.length);
  const tmcSaved = await bulkImportTmcToDb(token, tmcItems);
  console.log("  bulk-import saved:", tmcSaved.length);

  // ─── GET API ─────────────────────────────────────────────────────────────
  const gprList = await listGprTasksFromDb(token);
  const tenderList = await listTendersFromDb(token);
  const tmcList = await listTmcFromDb(token);

  console.log("\n=== GET after import ===");
  console.log("GET /gpr/tasks ->", gprList.length, "items");
  console.log("  sample:", JSON.stringify(gprList.slice(0, 2).map((t) => ({ id: t.id, code: t.code, name: t.name, partId: t.partId })), null, 2));
  console.log("GET /tender ->", tenderList.length, "items");
  console.log("  sample:", JSON.stringify(tenderList.map((t) => ({ id: t.id, code: t.code, name: t.name, partId: t.partId })), null, 2));
  console.log("GET /tmc ->", tmcList.length, "items");
  console.log("  sample:", JSON.stringify(tmcList.map((t) => ({ id: t.id, name: t.name, projectPart: t.projectPart })), null, 2));

  if (gprList.length === 0 || tenderList.length === 0 || tmcList.length === 0) {
    console.error("\nE2E FAILED: empty GET response after bulk-import");
    process.exit(1);
  }
  console.log("\nE2E OK: CSV -> bulk-import -> GET all non-empty");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
