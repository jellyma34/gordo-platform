/**
 * Самопроверка импорта CSV тендеров: сопоставление колонок по заголовкам.
 * Запуск: npm run test:tender-csv
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildTenderColumnMapWithDiagnostics,
  normalizeTenderCsvRowsWithAudit,
  parseTenderCsvText,
  type TenderColumnMapKey,
} from "./tenderCsvImport";

const ROOT = path.resolve(import.meta.dirname ?? __dirname, "..");
const LEGACY_PATH = path.join(ROOT, "data/tender-procurement-sample.csv");

function readCsv(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function assertImportOk(label: string, csv: string, expectedLoaded: number): void {
  const parsed = parseTenderCsvText(csv);
  assert.equal(parsed.layout, "procurement", `${label}: layout procurement`);

  const { diagnostics } = buildTenderColumnMapWithDiagnostics(parsed.headers, parsed.layout);
  assert.equal(diagnostics.error, null, `${label}: column map error: ${diagnostics.error}`);
  assert.equal(
    diagnostics.matchedRequiredCount,
    diagnostics.requiredCount,
    `${label}: required columns ${diagnostics.matchedRequiredCount}/${diagnostics.requiredCount}`,
  );

  const requiredKeys: TenderColumnMapKey[] = [
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
  for (const key of requiredKeys) {
    assert.ok(diagnostics.indices[key] >= 0, `${label}: missing mapped column «${key}»`);
  }

  const { audit, tenders } = normalizeTenderCsvRowsWithAudit(parsed.rows, parsed.headers, {
    layout: parsed.layout,
    dataStartFileRow: parsed.dataStartFileRow,
  });
  assert.equal(audit.loaded, expectedLoaded, `${label}: loaded rows`);
  assert.equal(audit.skipped, 0, `${label}: skipped rows`);
  assert.ok(
    audit.skippedRows.every((s) => s.reason !== "missing_code"),
    `${label}: missing_code in skipped rows`,
  );
  assert.equal(tenders.length, expectedLoaded, `${label}: tenders count`);
  assert.ok(tenders[0]?.code, `${label}: first tender code`);
}

function insertTenderNumberColumn(csv: string, tenderIds: string[]): string {
  const lines = csv.split(/\r?\n/);
  lines[0] = lines[0]!.split(";").toSpliced(1, 0, "№ тендера").join(";");
  let dataIdx = 0;
  for (let i = 2; i < lines.length; i++) {
    if (!lines[i]!.trim()) continue;
    const cells = lines[i]!.split(";");
    cells.splice(1, 0, tenderIds[dataIdx] ?? String(1000 + dataIdx));
    lines[i] = cells.join(";");
    dataIdx += 1;
  }
  return lines.join("\n");
}

/** Переставить две колонки данных (сохраняя двухуровневую шапку). */
function swapCsvColumns(csv: string, indexA: number, indexB: number): string {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  return lines
    .map((line) => {
      const cells = line.split(";");
      if (indexA >= cells.length || indexB >= cells.length) return line;
      const tmp = cells[indexA]!;
      cells[indexA] = cells[indexB]!;
      cells[indexB] = tmp;
      return cells.join(";");
    })
    .join("\n");
}

// 1. Legacy CSV
const legacyCsv = readCsv(LEGACY_PATH);
assertImportOk("legacy", legacyCsv, 2);
assert.ok(
  buildTenderColumnMapWithDiagnostics(parseTenderCsvText(legacyCsv).headers, "procurement").diagnostics
    .headersByField.id.includes("п/п"),
  "legacy: id from № п/п",
);

// 2. Новый CSV с колонкой «№ тендера»
const withTenderCsv = insertTenderNumberColumn(legacyCsv, ["5001", "5002"]);
assertImportOk("with-tender-number", withTenderCsv, 2);
const withTenderDiag = buildTenderColumnMapWithDiagnostics(
  parseTenderCsvText(withTenderCsv).headers,
  "procurement",
).diagnostics;
assert.ok(
  withTenderDiag.headersByField.id.toLowerCase().includes("тендера"),
  "with-tender-number: id from № тендера",
);

// 3. CSV с переставленными колонками (код ↔ наименование)
const reorderedCsv = swapCsvColumns(legacyCsv, 1, 2);
assertImportOk("reordered-columns", reorderedCsv, 2);
const reorderedDiag = buildTenderColumnMapWithDiagnostics(
  parseTenderCsvText(reorderedCsv).headers,
  "procurement",
).diagnostics;
assert.notEqual(
  reorderedDiag.indices.code,
  reorderedDiag.indices.name,
  "reordered: code and name remain distinct",
);

console.log("tenderCsvImport selftest: ok (legacy, with-tender-number, reordered-columns)");

// 4. GPR-like 153 строки с «№ тендера»
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
assertImportOk("gpr-like-153", buildGprLikeProcurementCsv(153), 153);

/** GPR-формат с фактическими заголовками: № статей, ID Код, Этап работ. */
function buildGprArticlesProcurementCsv(rowCount: number): string {
  const h0 =
    "№ статей;ID Код;Этап работ;ГПР;Отставание;Начало тендера;;;Дата заключения договора;;;Стоимость (руб.);;;Контрагент;Договор;Статус;Комментарий к отклонениям";
  const h1 = ";;;;;План;Факт;Откл.;План;Факт;Откл.;План;Факт;Откл.;;;";
  const rows: string[] = [h0, h1];
  for (let i = 1; i <= rowCount; i++) {
    const code = `2.05.${String(i).padStart(2, "0")}.1`;
    rows.push(
      `${i};${code};Работа ${i};;;;02.04.2026;05.04.2026;1;01.06.2026;10.06.2026;9;23513403;23000000;ООО Тест;;В работе;`,
    );
  }
  return rows.join("\n");
}

const gprArticlesDiag = buildTenderColumnMapWithDiagnostics(
  parseTenderCsvText(buildGprArticlesProcurementCsv(3)).headers,
  "procurement",
).diagnostics;
assert.ok(
  gprArticlesDiag.headersByField.id.toLowerCase().includes("статей"),
  "gpr-articles: id from № статей",
);
assert.ok(
  gprArticlesDiag.headersByField.code.toLowerCase().includes("id код"),
  "gpr-articles: code from ID Код",
);
assert.ok(
  gprArticlesDiag.headersByField.name.toLowerCase().includes("этап работ"),
  "gpr-articles: name from Этап работ",
);
assertImportOk("gpr-articles-153", buildGprArticlesProcurementCsv(153), 153);

/** Пустая строка (только разделители) между sub header и данными — как в реальном CSV. */
function buildGprArticlesProcurementCsvWithEmptyDataSeparator(rowCount: number): string {
  const lines = buildGprArticlesProcurementCsv(rowCount).split("\n");
  const colCount = lines[0]!.split(";").length;
  lines.splice(2, 0, ";".repeat(Math.max(0, colCount - 1)));
  return lines.join("\n");
}

const blankSepParsed = parseTenderCsvText(buildGprArticlesProcurementCsvWithEmptyDataSeparator(149));
assert.equal(blankSepParsed.layout, "procurement", "gpr-articles-blank-sep: layout");
assertImportOk(
  "gpr-articles-blank-sep-149",
  buildGprArticlesProcurementCsvWithEmptyDataSeparator(149),
  149,
);

// 6. Строки как массив ячеек (string[][]) — ColumnMap по индексу, не по ключу заголовка
function buildGprArticlesMatrixRows(rowCount: number): {
  headers: string[];
  rows: string[][];
  layout: "procurement";
  dataStartFileRow: number;
} {
  const csv = buildGprArticlesProcurementCsv(rowCount);
  const parsed = parseTenderCsvText(csv);
  const matrixRows = parsed.rows.map((obj) => parsed.headers.map((h) => obj[h] ?? ""));
  return {
    headers: parsed.headers,
    rows: matrixRows,
    layout: "procurement",
    dataStartFileRow: parsed.dataStartFileRow,
  };
}

const matrixCase = buildGprArticlesMatrixRows(149);
const matrixAudit = normalizeTenderCsvRowsWithAudit(
  matrixCase.rows as unknown as Record<string, string>[],
  matrixCase.headers,
  { layout: matrixCase.layout, dataStartFileRow: matrixCase.dataStartFileRow },
).audit;
assert.equal(matrixAudit.loaded, 149, "array-rows: loaded");
assert.equal(matrixAudit.skipped, 0, "array-rows: skipped");
assert.ok(
  matrixAudit.skippedRows.every((s) => s.reason !== "missing_code"),
  "array-rows: no missing_code",
);

console.log("tenderCsvImport selftest: ok (+ gpr-like-153, gpr-articles-153, array-rows)");

// 7. Реальные файлы: GPR-149 и Excel-экспорт (тендеры)_май.csv
import { decodeCsvBytesWithBestEncoding } from "./csvTextEncoding";

function assertFileImportOk(
  label: string,
  filePath: string,
  options?: { encoding?: "bytes" | "utf8"; minLoaded?: number },
): number {
  const minLoaded = options?.minLoaded ?? 1;
  const csv =
    options?.encoding === "bytes"
      ? decodeCsvBytesWithBestEncoding(new Uint8Array(fs.readFileSync(filePath)))
      : readCsv(filePath);
  const parsed = parseTenderCsvText(csv);
  assert.equal(parsed.layout, "procurement", `${label}: layout procurement`);
  const { audit } = normalizeTenderCsvRowsWithAudit(parsed.rows, parsed.headers, {
    layout: parsed.layout,
    dataStartFileRow: parsed.dataStartFileRow,
  });
  assert.ok(audit.loaded >= minLoaded, `${label}: loaded >= ${minLoaded}, got ${audit.loaded}`);
  assert.equal(audit.skipped, 0, `${label}: skipped ${audit.skipped}`);
  assert.ok(
    audit.columnMapDiagnostics?.indices?.code >= 0,
    `${label}: colMap.code mapped`,
  );
  return audit.loaded;
}

const gpr149Loaded = assertFileImportOk(
  "tender-gpr-articles-149",
  path.join(ROOT, "data/tender-gpr-articles-149.csv"),
  { minLoaded: 149 },
);
assert.equal(gpr149Loaded, 149, "tender-gpr-articles-149: exact 149");

const maiPath = path.join(ROOT, "data/(тендеры)_май.csv");
if (fs.existsSync(maiPath)) {
  const maiLoaded = assertFileImportOk("(тендеры)_май", maiPath, {
    encoding: "bytes",
    minLoaded: 100,
  });
  console.log(`(тендеры)_май.csv: loaded=${maiLoaded}`);
}

console.log("tenderCsvImport selftest: ok (+ real gpr-149, excel май)");
