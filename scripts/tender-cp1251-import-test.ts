import { File } from "node:buffer";
import iconv from "iconv-lite";

import { importTenderCsvFile } from "../lib/tenderCsvImportUi";

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
const file = new File([bytes], "gpr-cp1251.csv", { type: "text/csv" });

async function main() {
  const r = await importTenderCsvFile(file);
  console.log({
    loaded: r.audit.loaded,
    skipped: r.audit.skipped,
    layout: r.audit.layout,
    parsedRows: r.audit.parsedRows,
    firstReason: r.audit.skippedRows[0]?.reason,
  });
}

void main();
