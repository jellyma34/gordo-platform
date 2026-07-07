import { writeFileSync } from "node:fs";
import iconv from "iconv-lite";

import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { normalizeTenderCsvRowsWithAudit, parseTenderCsvText } from "../lib/tenderCsvImportUi";

function buildCsv(): string {
  const h0 =
    "№ статей;ID Код;Этап работ;ГПР;Отставание;Начало тендера;;;Дата заключения договора;;;Стоимость (руб.);;;Контрагент;Договор;Статус;Комментарий к отклонениям";
  const h1 = ";;;;;План;Факт;Откл.;План;Факт;Откл.;План;Факт;Откл.;;;";
  const lines = [h0, h1];
  for (let i = 1; i <= 149; i++) {
    const code = `2.05.${String(i).padStart(2, "0")}.1`;
    lines.push(
      `${i};${code};Работа ${i};;;;02.04.2026;05.04.2026;1;01.06.2026;10.06.2026;9;23513403;23000000;ООО;;В работе;`,
    );
  }
  return lines.join("\n");
}

function countCyrillicLetters(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x0400 && c <= 0x04ff) n++;
  }
  return n;
}

function readTenderCsvFileTextCurrent(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");
  if (!utf8.includes("\uFFFD") && countCyrillicLetters(utf8) >= 3) {
    return utf8;
  }
  return decodeCsvBytesWithBestEncoding(bytes);
}

const csvUtf8 = buildCsv();
const utf8Bytes = new TextEncoder().encode(csvUtf8);
const cp1251Bytes = iconv.encode(csvUtf8, "win1251");

for (const [label, bytes] of [
  ["utf8", utf8Bytes],
  ["cp1251", cp1251Bytes],
] as const) {
  const current = readTenderCsvFileTextCurrent(bytes);
  const smart = decodeCsvBytesWithBestEncoding(bytes);
  const parsedCurrent = parseTenderCsvText(current);
  const normCurrent = normalizeTenderCsvRowsWithAudit(parsedCurrent.rows, parsedCurrent.headers, {
    layout: parsedCurrent.layout,
    dataStartFileRow: parsedCurrent.dataStartFileRow,
  });
  const parsedSmart = parseTenderCsvText(smart);
  const normSmart = normalizeTenderCsvRowsWithAudit(parsedSmart.rows, parsedSmart.headers, {
    layout: parsedSmart.layout,
    dataStartFileRow: parsedSmart.dataStartFileRow,
  });
  console.log(label, {
    same: current === smart,
    layoutCurrent: parsedCurrent.layout,
    loadedCurrent: normCurrent.audit.loaded,
    layoutSmart: parsedSmart.layout,
    loadedSmart: normSmart.audit.loaded,
  });
}

writeFileSync("data/tender-gpr-articles-149.csv", csvUtf8, "utf8");
