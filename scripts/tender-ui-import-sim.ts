import { File } from "node:buffer";
import { readFileSync } from "node:fs";

import {
  importTenderCsvFile,
  parseTenderCsvText,
  normalizeTenderCsvRowsWithAudit,
} from "../lib/tenderCsvImportUi";

const h0 =
  "№ п/п;№ тендера;Наименование работ;Этап работ ГПР;;;Начало тендера;;;Дата заключения договора;;;Стоимость (руб.);;;Контрагент;Договор;Статус;Комментарий к отклонениям";
const h1 = ";;;ГПР;Отставание;План;Факт;Откл.;План;Факт;Откл.;План;Факт;Откл.;;;";
const rows: string[] = [h0, h1];
for (let i = 1; i <= 3; i++) {
  rows.push(
    [i, 1000 + i, `2.05.0${i}.1`, `Работа ${i}`, "", "", "", "02.04.2026", "05.04.2026", "1", "01.06.2026", "10.06.2026", "9", "23513403", "23000000", "", "", "", ""].join(";"),
  );
}
const csv = rows.join("\n");
async function main() {
  const file = new File([Buffer.from(csv, "utf8")], "test.csv", { type: "text/csv" });

  const viaUi = await importTenderCsvFile(file);
  console.log("importTenderCsvFile (UI entry):", {
    loaded: viaUi.audit.loaded,
    layout: viaUi.audit.layout,
    error: viaUi.audit.columnMapDiagnostics?.error,
    matched: `${viaUi.audit.columnMapDiagnostics?.matchedRequiredCount}/${viaUi.audit.columnMapDiagnostics?.requiredCount}`,
  });

  const bytes = readFileSync("data/tender-procurement-sample.csv");
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");
  const parsed = parseTenderCsvText(utf8);
  const viaChain = normalizeTenderCsvRowsWithAudit(parsed.rows, parsed.headers, {
    layout: parsed.layout,
    dataStartFileRow: parsed.dataStartFileRow,
  });
  console.log("legacy sample via UI module:", {
    loaded: viaChain.audit.loaded,
    layout: viaChain.audit.layout,
    error: viaChain.audit.columnMapDiagnostics?.error,
  });
}

void main();
