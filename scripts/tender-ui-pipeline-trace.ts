/**
 * Диагностика UI-цепочки импорта: read → parse → normalize → diff → save.
 * Запуск: npx tsx scripts/tender-ui-pipeline-trace.ts
 */
import { File } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";

import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { diffTendersImportScoped } from "../lib/tenderImportDiff";
import {
  importTenderCsvFile,
  normalizeTenderCsvRowsWithAudit,
  parseTenderCsvText,
} from "../lib/tenderCsvImportUi";

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

function countCyrillicLetters(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x0400 && c <= 0x04ff) n++;
  }
  return n;
}

/** Копия readTenderCsvFileText из tenderCsvImportUi (до исправления). */
function readTenderCsvFileTextLegacy(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");
  if (!utf8.includes("\uFFFD") && countCyrillicLetters(utf8) >= 3) {
    return utf8;
  }
  return decodeCsvBytesWithBestEncoding(bytes);
}

async function trace(label: string, file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const textLegacy = readTenderCsvFileTextLegacy(bytes);
  const textSmart = decodeCsvBytesWithBestEncoding(bytes);

  const parsedLegacy = parseTenderCsvText(textLegacy);
  const normLegacy = normalizeTenderCsvRowsWithAudit(parsedLegacy.rows, parsedLegacy.headers, {
    layout: parsedLegacy.layout,
    dataStartFileRow: parsedLegacy.dataStartFileRow,
  });

  const parsedSmart = parseTenderCsvText(textSmart);
  const normSmart = normalizeTenderCsvRowsWithAudit(parsedSmart.rows, parsedSmart.headers, {
    layout: parsedSmart.layout,
    dataStartFileRow: parsedSmart.dataStartFileRow,
  });

  const viaImport = await importTenderCsvFile(file);
  const diff = diffTendersImportScoped([], viaImport.tenders, viaImport.audit.parsedRows);

  console.log(`\n=== ${label} ===`);
  console.log({
    encodingSame: textLegacy === textSmart,
    layoutLegacy: parsedLegacy.layout,
    layoutSmart: parsedSmart.layout,
    parsedRowsLegacy: parsedLegacy.rows.length,
    parsedRowsSmart: parsedSmart.rows.length,
    loadedLegacy: normLegacy.audit.loaded,
    loadedSmart: normSmart.audit.loaded,
    importLoaded: viaImport.audit.loaded,
    importSkipped: viaImport.audit.skipped,
    diffTotal: diff.stats.total,
    firstSkip: viaImport.audit.skippedRows[0],
    firstTender: viaImport.tenders[0]?.code,
  });
}

async function main() {
  const csvUtf8 = buildGprArticlesProcurementCsv(149);
  const utf8File = new File([Buffer.from(csvUtf8, "utf8")], "gpr-utf8.csv", { type: "text/csv" });

  const csvBytesCp1251 = (() => {
    try {
      const iconv = require("iconv-lite") as {
        encode: (s: string, enc: string) => Buffer;
      };
      return iconv.encode(csvUtf8, "win1251");
    } catch {
      return null;
    }
  })();

  await trace("UTF-8 file", utf8File);

  if (csvBytesCp1251) {
    const cpFile = new File([csvBytesCp1251], "gpr-cp1251.csv", { type: "text/csv" });
    await trace("CP1251 file (Excel RU)", cpFile);
  } else {
    console.log("\n(skip CP1251 test: no iconv-lite)");
  }

  writeFileSync("data/tender-gpr-articles-149.csv", csvUtf8, "utf8");
  console.log("\nWrote data/tender-gpr-articles-149.csv for manual UI test");
}

void main();
