/**
 * Диагностика этапа чтения строк: CSV row → extractTenderRowProcurement → code.
 * Запуск: npx tsx scripts/tender-row-read-trace.ts [path-to-csv]
 */
import fs from "node:fs";

import { parseTenderCsvText, traceTenderRowCodeReadDiagnostics } from "../lib/tenderCsvImport";

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

const csv = process.argv[2]
  ? fs.readFileSync(process.argv[2], "utf8")
  : buildGprArticlesProcurementCsv(149);

const parsed = parseTenderCsvText(csv);
const traces = traceTenderRowCodeReadDiagnostics(parsed, 5);

console.log("=== Цепочка чтения code (первые 5 строк) ===");
console.log("CSV row → extractTenderRowProcurement → getMappedCell/colMap → resolveCode → record.code");
console.table(traces);

const emptyCode = parsed.rows.filter(
  (row, i) =>
    !traceTenderRowCodeReadDiagnostics(
      { ...parsed, rows: [row] },
      1,
    )[0]?.afterTrim,
).length;
console.log("строк с пустым code после чтения:", emptyCode, "/", parsed.rows.length);
