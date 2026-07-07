/**
 * Трассировка построения ColumnMap: resolvedHeaders → patterns → findColumnByPatterns → colMap.
 * Запуск: npx tsx scripts/tender-columnmap-trace.ts [path-to-csv]
 */
import fs from "node:fs";

import {
  buildTenderColumnMapWithDiagnostics,
  buildTenderProcurementColumnMap,
  normalizeTenderCsvRowsWithAudit,
  parseTenderCsvText,
  type TenderColumnMapKey,
} from "../lib/tenderCsvImport";

function buildGprLikeProcurementCsv(rowCount: number): string {
  const h0 =
    "№ п/п;№ тендера;Наименование работ;Этап работ ГПР;;;Начало тендера;;;Дата заключения договора;;;Стоимость (руб.);;;Контрагент;Договор;Статус;Комментарий к отклонениям";
  const h1 = ";;;ГПР;Отставание;План;Факт;Откл.;План;Факт;Откл.;План;Факт;Откл.;;;";
  const rows: string[] = [h0, h1];
  for (let i = 1; i <= rowCount; i++) {
    const code = `2.05.${String(i).padStart(2, "0")}.1`;
    rows.push(
      `${i};${1000 + i};${code};Работа ${i};;;;02.04.2026;05.04.2026;1;01.06.2026;10.06.2026;9;23513403;23000000;ООО Тест;;В работе;`,
    );
  }
  return rows.join("\n");
}

const csv = process.argv[2]
  ? fs.readFileSync(process.argv[2], "utf8")
  : buildGprLikeProcurementCsv(153);

const parsed = parseTenderCsvText(csv);
const resolvedHeaders = parsed.headers;

console.log("=== 1. resolvedHeaders (после merge шапки) ===");
resolvedHeaders.forEach((h, i) => {
  const norm = h.trim().toLowerCase().replace(/\s+/g, " ");
  console.log(`  [${i}] raw="${h}" norm="${norm}"`);
});

const { colMap, diagnostics } = buildTenderColumnMapWithDiagnostics(resolvedHeaders, "procurement");
const procMap = buildTenderProcurementColumnMap(resolvedHeaders);

console.log("\n=== 2–5. ColumnMap (buildTenderColumnMapWithDiagnostics = buildTenderProcurementColumnMap) ===");
const keys: TenderColumnMapKey[] = [
  "id",
  "code",
  "name",
  "stage",
  "planStart",
  "factStart",
  "planContractDate",
  "factContractDate",
  "cost",
  "factCost",
  "contractor",
  "status",
];

for (const key of keys) {
  const idx = diagnostics.indices[key];
  const inMap = colMap[key];
  const inProc = procMap[key];
  console.log({
    field: key,
    header: diagnostics.headersByField[key] || "—",
    foundIndex: idx,
    colMap: inMap,
    procMap: inProc,
    synced: idx === inMap && inMap === inProc,
    written: inMap >= 0,
  });
}

console.log("\n=== итог ===");
console.log("matchedRequired:", `${diagnostics.matchedRequiredCount}/${diagnostics.requiredCount}`);
console.log("missingRequired:", diagnostics.missingRequired.map((m) => m.label));
console.log("error:", diagnostics.error);

const { audit } = normalizeTenderCsvRowsWithAudit(parsed.rows, parsed.headers, {
  layout: parsed.layout,
  dataStartFileRow: parsed.dataStartFileRow,
});
console.log("import:", { loaded: audit.loaded, skipped: audit.skipped });
