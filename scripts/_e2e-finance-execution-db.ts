/**
 * E2E: parse бюджет_Май.csv → PUT /finance/execution-imports → GET verify.
 * Usage: DATABASE optional; pass token as argv[2].
 */
import fs from "node:fs";
import path from "node:path";
import iconv from "iconv-lite";

import { parseFinanceCsvTextToRawRows } from "../lib/financeCsvFormat";
import { importFinanceBudgetExecutionCsvFromRawRows } from "../lib/financeBudgetExecutionCsvImport";

const API = process.env.API_URL || "http://127.0.0.1:8000";
const token = process.argv[2];
const projectId = process.argv[3] || "default";

if (!token) {
  console.error("Usage: tsx scripts/_e2e-finance-execution-db.ts <JWT> [projectId]");
  process.exit(1);
}

async function main() {
  const dl = path.join(process.env.USERPROFILE ?? "", "Downloads");
  const buf = fs.readFileSync(path.join(dl, "бюджет_Май.csv"));
  const text = iconv.decode(buf, "win1251");
  const rawRows = parseFinanceCsvTextToRawRows(text);

  const prev = { log: console.log, warn: console.warn, table: console.table, trace: console.trace };
  console.log = () => {};
  console.warn = () => {};
  console.table = () => {};
  console.trace = () => {};
  const { snapshot, audit } = importFinanceBudgetExecutionCsvFromRawRows(rawRows, "бюджет_Май.csv");
  console.log = prev.log;
  console.warn = prev.warn;
  console.table = prev.table;
  console.trace = prev.trace;

  const payload = {
    ...snapshot,
    updatedAt: new Date().toISOString(),
  };

  const putRes = await fetch(`${API}/finance/execution-imports`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ projectId, payload }),
  });
  const putText = await putRes.text();
  console.log("PUT status", putRes.status);
  console.log("PUT body", putText.slice(0, 500));

  const getRes = await fetch(
    `${API}/finance/execution-imports?projectId=${encodeURIComponent(projectId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const getJson = await getRes.json();
  console.log("GET status", getRes.status);
  console.log(
    JSON.stringify(
      {
        foundMetrics: audit.foundMetrics,
        expenses: snapshot.kpi.expenses,
        segments: snapshot.expenseChart?.segments?.length ?? 0,
        getExpenses: getJson?.payload?.kpi?.expenses ?? null,
        getSegments: getJson?.payload?.expenseChart?.segments?.length ?? null,
        getProjectId: getJson?.projectId,
        updatedAt: getJson?.updatedAt,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(process.cwd(), "scripts", "_e2e-execution-get.json"),
    JSON.stringify(getJson, null, 2),
    "utf8",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
