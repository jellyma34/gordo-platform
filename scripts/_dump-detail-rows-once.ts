import fs from "node:fs";
import path from "node:path";
import iconv from "iconv-lite";

import { detectFinanceCsvFormat } from "../lib/financeCsvImport";
import { parseFinanceCsvTextToRawRows } from "../lib/financeCsvFormat";
import { importFinanceBudgetExecutionCsvFromRawRows } from "../lib/financeBudgetExecutionCsvImport";

const dl = path.join(process.env.USERPROFILE ?? "", "Downloads");
const outPath = path.join(process.cwd(), "scripts", "_detail-rows-result.json");

function codeFromDetailId(id: string): string | null {
  const m = String(id ?? "").match(/^budget-(.+)$/);
  return m ? (m[1] ?? null) : null;
}

function tryFile(name: string, encoding: "utf8" | "win1251") {
  const buf = fs.readFileSync(path.join(dl, name));
  const text = encoding === "utf8" ? buf.toString("utf8") : iconv.decode(buf, "win1251");
  const rawRows = parseFinanceCsvTextToRawRows(text);
  const format = detectFinanceCsvFormat(rawRows);
  // suppress noise by temporarily silencing console? keep as is
  const prevLog = console.log;
  const prevWarn = console.warn;
  const prevTable = console.table;
  const prevTrace = console.trace;
  console.log = () => {};
  console.warn = () => {};
  console.table = () => {};
  console.trace = () => {};
  let snapshot;
  let audit;
  try {
    ({ snapshot, audit } = importFinanceBudgetExecutionCsvFromRawRows(rawRows, `${name}:${encoding}`));
  } finally {
    console.log = prevLog;
    console.warn = prevWarn;
    console.table = prevTable;
    console.trace = prevTrace;
  }
  const ds = snapshot.expenseChart?.detailSegments ?? [];
  return {
    name,
    encoding,
    format,
    rawRowCount: rawRows.length,
    foundMetrics: audit.foundMetrics,
    detailCount: ds.length,
    segmentsCount: snapshot.expenseChart?.segments?.length ?? 0,
    projectTotalCostRub: snapshot.expenseChart?.projectTotalCostRub ?? null,
    expensesKpi: snapshot.kpi.expenses,
    sampleCells: (rawRows.slice(0, 5) as string[][]).map((r) => r.slice(0, 4)),
    rows: ds.map((s) => ({ code: codeFromDetailId(s.id), valueRub: s.valueRub })),
  };
}

const names = fs.readdirSync(dl).filter((f) => f.toLowerCase().endsWith(".csv"));
const results = [];
for (const name of names) {
  for (const enc of ["utf8", "win1251"] as const) {
    try {
      const r = tryFile(name, enc);
      if (r.detailCount > 0 || r.format === "budget_execution" || r.foundMetrics > 0) {
        results.push(r);
      }
    } catch (e) {
      results.push({ name, encoding: enc, error: String(e) });
    }
  }
}

results.sort((a, b) => ((b as { detailCount?: number }).detailCount ?? 0) - ((a as { detailCount?: number }).detailCount ?? 0));
const best = results[0] as {
  detailCount?: number;
  rows?: Array<{ code: string | null; valueRub: number }>;
  name?: string;
  encoding?: string;
} | undefined;

const payload: Record<string, unknown> = {
  scanned: results.map((r) => ({
    name: (r as { name: string }).name,
    encoding: (r as { encoding: string }).encoding,
    format: (r as { format?: string }).format,
    detailCount: (r as { detailCount?: number }).detailCount,
    foundMetrics: (r as { foundMetrics?: number }).foundMetrics,
    expensesKpi: (r as { expensesKpi?: number | null }).expensesKpi,
    projectTotalCostRub: (r as { projectTotalCostRub?: number | null }).projectTotalCostRub,
  })),
};

if (best?.rows && (best.detailCount ?? 0) > 0) {
  const rows = best.rows;
  const unique = [...new Set(rows.map((r) => r.code))].sort((a, b) =>
    String(a).localeCompare(String(b), "ru", { numeric: true }),
  );
  const countExact = (code: string) => rows.filter((r) => r.code === code).length;
  payload.source = { name: best.name, encoding: best.encoding, detailCount: best.detailCount };
  payload.first30 = rows.slice(0, 30);
  payload.uniqueCodes = unique;
  payload.counts = {
    "2.01": countExact("2.01"),
    "2.02": countExact("2.02"),
    "2.03": countExact("2.03"),
    "2.04": countExact("2.04"),
    "2.01.01": countExact("2.01.01"),
    "2.04.03": countExact("2.04.03"),
  };
}

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
console.log("wrote", outPath, "bestDetail", best?.detailCount ?? 0);
