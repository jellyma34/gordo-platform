/**
 * Полная диагностика цепочки тендеров: CSV → API → фильтры UI.
 * Запуск: npx tsx scripts/tenders-full-diagnostic.ts
 */
import fs from "fs";

const API = process.env.E2E_API_URL || "http://127.0.0.1:8080";
process.env.NEXT_PUBLIC_API_URL = API;

const CSV_PATH = "data/tender-import-sample.csv";

function countCyrillic(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x0400 && c <= 0x04ff) n++;
  }
  return n;
}

function hasMojibake(s: string): boolean {
  return s.includes("\uFFFD") || /[\u0080-\u00bf]{2,}/.test(s);
}

function filterTendersForScope(list: Tender[], scope: ConstructionObjectScope): Tender[] {
  if (scope === "project") return list.filter((t) => t.partId === 1 || t.partId === 2);
  return list.filter((t) => t.partId === scope);
}

function filterTendersTableRows(items: Tender[], activePartId: number): Tender[] {
  return items.filter((t) => t.partId === activePartId);
}

function editPartIdFromScope(scope: ConstructionObjectScope): 1 | 2 {
  return scope === "project" ? 1 : scope;
}

async function queryPostgresDirect(): Promise<{
  count: number;
  rows: Array<{ id: number; code: string; name: string; part_id: number; contractor: string | null; comment: string | null }>;
  dupCodes: Array<{ part_id: number; code: string; n: number }>;
} | null> {
  try {
    const { Client } = await import("pg");
    const client = new Client({
      connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/gordo",
    });
    await client.connect();
    const countRes = await client.query("SELECT COUNT(*)::int AS c FROM tenders");
    const rowsRes = await client.query(
      "SELECT id, code, name, part_id, contractor, comment FROM tenders ORDER BY code LIMIT 50",
    );
    const dupRes = await client.query(
      "SELECT part_id, code, COUNT(*)::int AS n FROM tenders GROUP BY part_id, code HAVING COUNT(*) > 1",
    );
    await client.end();
    return {
      count: countRes.rows[0]?.c ?? 0,
      rows: rowsRes.rows,
      dupCodes: dupRes.rows,
    };
  } catch (e) {
    console.log("PostgreSQL direct:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function main() {
  const { decodeCsvBytesWithBestEncoding } = await import("../lib/csvTextEncoding");
  const { loginRequest } = await import("../lib/auth");
  const { bulkImportTendersToDb, listTendersFromDb } = await import("../lib/constructionApi");
  const { normalizeTenderCsvRowsWithAudit, parseTenderCsvText } = await import("../lib/tenderCsvImport");
  type Tender = import("../lib/tenderData").Tender;
  type ConstructionObjectScope = import("../lib/gprUtils").ConstructionObjectScope;

  const buf = fs.readFileSync(CSV_PATH);
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const smart = decodeCsvBytesWithBestEncoding(new Uint8Array(buf));

  console.log("=== 1. Pipeline counts ===");
  const csvLines = smart.split(/\r?\n/).filter((l) => l.trim());
  const dataLines = Math.max(0, csvLines.length - 1);
  console.log("CSV file:", CSV_PATH);
  console.log("  total lines (non-empty):", csvLines.length);
  console.log("  data rows (excl. header):", dataLines);

  const parsedUtf8 = parseTenderCsvText(utf8);
  const parsedSmart = parseTenderCsvText(smart);
  const parsed = parsedUtf8;
  const { tenders, audit } = normalizeTenderCsvRowsWithAudit(parsed.rows, parsed.headers, {
    layout: parsed.layout,
    dataStartFileRow: parsed.dataStartFileRow,
  });
  const auditSmart = normalizeTenderCsvRowsWithAudit(parsedSmart.rows, parsedSmart.headers, {
    layout: parsedSmart.layout,
    dataStartFileRow: parsedSmart.dataStartFileRow,
  }).audit;

  console.log("Parser (UTF-8 read — как e2e / flat CSV):");
  console.log("  layout:", audit.layout);
  console.log("  parsedRows:", audit.parsedRows);
  console.log("  loaded (after normalize):", audit.loaded);
  console.log("  skipped:", audit.skipped);
  console.log("  parseErrors:", audit.parseErrors);
  console.log("Parser (readCsvFileTextSmart / CP1251 heuristic):");
  console.log("  loaded:", auditSmart.loaded, "skipped:", auditSmart.skipped);
  if (auditSmart.skippedRows[0]) console.log("  first skip:", auditSmart.skippedRows[0].reason);

  const auth = await loginRequest("marislova34@gmail.com", "1234");
  const saved = await bulkImportTendersToDb(auth.token, tenders);
  console.log("bulkImportTendersToDb → POST /tender/bulk-import:", saved.length);

  const fromApi = await listTendersFromDb(auth.token);
  console.log("GET /tender (no filter):", fromApi.length);

  const pg = await queryPostgresDirect();
  if (pg) {
    console.log("PostgreSQL COUNT(*):", pg.count);
    console.log("PostgreSQL duplicate (part_id,code) groups:", pg.dupCodes.length);
  }

  for (const scope of [1, 2, "project"] as ConstructionObjectScope[]) {
    const n = filterTendersForScope(fromApi, scope).length;
    const editN = filterTendersTableRows(fromApi, editPartIdFromScope(scope)).length;
    console.log(`TendersPresentation scope=${scope}: ${n} | TendersTable (edit) activePartId=${editPartIdFromScope(scope)}: ${editN}`);
  }

  console.log("\n=== 2. Encoding samples ===");
  console.log("UTF-8 vs smart cyrillic:", countCyrillic(utf8), countCyrillic(smart));
  for (let i = 0; i < Math.min(3, tenders.length); i++) {
    const t = tenders[i]!;
    const csvLine = csvLines[i + 1] ?? "";
    const cells = csvLine.split(";");
    const api = fromApi.find((x) => x.code === t.code && x.partId === t.partId);
    const pgRow = pg?.rows.find((x) => x.code === t.code && x.part_id === t.partId);
    console.log(`\n--- Row ${i + 1} code=${t.code} partId=${t.partId} ---`);
    console.log("CSV raw name cell:", cells[1] ?? "(n/a)");
    console.log("After parser name:", t.name);
    console.log("After parser contractor:", t.contractor ?? "(empty)");
    console.log("After parser comment (≈description):", t.comment ?? "(empty)");
    console.log("GET /tender name:", api?.name ?? "(missing)");
    console.log("GET /tender contractor:", api?.contractor ?? "(empty)");
    console.log("PostgreSQL name:", pgRow?.name ?? "(n/a)");
    console.log("mojibake parser:", hasMojibake(t.name), "| API:", api ? hasMojibake(api.name) : "n/a");
  }
  console.log("\nNote: fields package_name / external_id are NOT in Tender schema.");
  console.log("      description → mapped to `comment`; package_name → N/A (use `name`).");

  console.log("\n=== 3. Record loss check ===");
  const stages = [
    ["CSV data rows", dataLines],
    ["Parser loaded", audit.loaded],
    ["bulk-import response", saved.length],
    ["GET /tender", fromApi.length],
    ["PostgreSQL", pg?.count ?? "n/a"],
  ] as const;
  for (const [label, n] of stages) {
    console.log(`  ${label}: ${n}`);
  }
  if (audit.skipped > 0) {
    console.log("  Skipped rows:", audit.skippedRows.slice(0, 5));
  }

  console.log("\n=== 4. React key conflicts ===");
  const byId = new Map<string, Tender[]>();
  for (const t of fromApi) {
    const list = byId.get(t.id) ?? [];
    list.push(t);
    byId.set(t.id, list);
  }
  const idDups = [...byId.entries()].filter(([, l]) => l.length > 1);
  console.log("duplicate id:", idDups.length);
  for (const [id, list] of idDups) {
    for (const t of list) console.log(`  id=${id} code=${t.code} partId=${t.partId}`);
  }

  const byCodePart = new Map<string, Tender[]>();
  for (const t of fromApi) {
    const k = `${t.partId}::${t.code}`;
    const list = byCodePart.get(k) ?? [];
    list.push(t);
    byCodePart.set(k, list);
  }
  const codeDups = [...byCodePart.entries()].filter(([, l]) => l.length > 1);
  console.log("duplicate (part_id,code):", codeDups.length);

  console.log("React keys in TendersTable: key={row.id} — unique if DB ids unique");
  console.log("React keys in TendersPresentation: key={part.id}, key={card.label}, key={entry.key} — fixed sets");

  console.log("\n=== 5. Scope filtering ===");
  console.log("DB total:", fromApi.length);
  console.log("  partId=1:", fromApi.filter((t) => t.partId === 1).length);
  console.log("  partId=2:", fromApi.filter((t) => t.partId === 2).length);
  for (const scope of [1, 2, "project"] as ConstructionObjectScope[]) {
    const pres = filterTendersForScope(fromApi, scope);
    console.log(`filterTendersForScope(${scope}): ${pres.length}`, pres.map((t) => t.code).join(", ") || "—");
  }

  console.log("\n=== 6. PostgreSQL sample (LIMIT 50) ===");
  if (pg) {
    for (const r of pg.rows) {
      const bad = hasMojibake(r.name) || (r.contractor ? hasMojibake(r.contractor) : false);
      console.log(
        `id=${r.id} code=${r.code} part_id=${r.part_id} name=${r.name.slice(0, 40)}${bad ? " [MOJIBAKE]" : ""}`,
      );
    }
  }

  console.log("\n=== 7. Edit vs Presentation ===");
  console.log("Both use listTendersFromDb(token) — same API source.");
  console.log("Edit: TendersTable filters partId === activePartId (no project tab in edit).");
  console.log("Presentation: filterTendersForScope — project = partId 1 OR 2.");
  console.log("Edit project scope fallback: editPartId = 1 (TendersSection.tsx:21).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
