/**
 * npx tsx scripts/tender-colmap-trace-run.ts
 * Симуляция заголовков из UI (одноуровневая шапка, layout=procurement).
 */
import { logBuildTenderProcurementColumnMapTrace } from "../lib/tenderCsvImport";

const headers = [
  "__col_0",
  "ID Код",
  "Этап работ",
  "ГПР",
  "Отставание",
  "Начало тендера",
  "__col_6",
  "__col_7",
  "Дата заключения договора",
  "__col_9",
  "__col_10",
  "Стоимость (руб.)",
  "__col_12",
  "__col_13",
  "Контрагент",
  "Договор",
  "Статус",
  "Комментарий к отклонениям",
];

logBuildTenderProcurementColumnMapTrace(headers);
