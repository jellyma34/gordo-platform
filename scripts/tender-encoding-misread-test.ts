import iconv from "iconv-lite";

import { normalizeTenderCsvRowsWithAudit, parseTenderCsvText } from "../lib/tenderCsvImportUi";

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
const csvUtf8 = lines.join("\n");
const bytes = iconv.encode(csvUtf8, "win1251");
const utf8mis = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");

function countCyrillicLetters(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x0400 && c <= 0x04ff) n++;
  }
  return n;
}

const cy = countCyrillicLetters(utf8mis);
const earlyReturn = !utf8mis.includes("\uFFFD") && cy >= 3;
console.log({ earlyReturn, fffd: utf8mis.includes("\uFFFD"), cy });

const p = parseTenderCsvText(utf8mis);
const r = normalizeTenderCsvRowsWithAudit(p.rows, p.headers, {
  layout: p.layout,
  dataStartFileRow: p.dataStartFileRow,
});
console.log({
  layout: p.layout,
  parsed: p.rows.length,
  loaded: r.audit.loaded,
  skipped: r.audit.skipped,
  firstReason: r.audit.skippedRows[0]?.reason,
});
