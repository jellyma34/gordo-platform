/**
 * Импорт из Excel/JSON: одна строка среза «Исполнение плана продаж».
 * Суммы в ₽; проценты 0–100+ (факт/план и доля портфеля).
 */
export type SalesPlanExecutionRowId =
  | "apartments"
  | "apt_1r"
  | "apt_2r"
  | "apt_3r"
  | "apt_4p"
  | "parking"
  | "storage"
  | "commercial"
  | "total";

export type SalesPlanExecutionRow = {
  id: SalesPlanExecutionRowId;
  /** Подпись в таблице */
  name: string;
  planProjectRub: number;
  planReportMonthRub: number;
  planCumulativeRub: number;
  factCumulativeRub: number;
  /** Факт накоп. − план накоп. */
  deviationRub: number;
  /** factCumulativeRub / planCumulativeRub * 100, при плане 0 — null */
  completionPct: number | null;
  /** Доля строки в сумме planCumulativeRub по всем строкам (без ИТОГО) или явная; 0–100 */
  shareOfVolumePct: number;
  /** Комментарий к отклонению (tooltip / заметка) */
  deviationComment?: string | null;
  isTotal?: boolean;
};

export type SalesPlanExecutionSummary = {
  planCumulativeRub: number;
  factCumulativeRub: number;
  /** Сводное выполнение по ₽ */
  completionPct: number | null;
  deviationRub: number;
};

export type SalesPlanExecutionDataset = {
  /** YYYY-MM-DD — отчётная дата блока */
  reportDateYmd: string;
  summary: SalesPlanExecutionSummary;
  rows: SalesPlanExecutionRow[];
};

/** Демо-набор для UI до импорта Excel/JSON (структура совместима с импортом). */
export const MARKETING_SALES_PLAN_EXECUTION_DEMO: SalesPlanExecutionDataset = {
  reportDateYmd: "2026-03-31",
  summary: {
    planCumulativeRub: 4_820_000_000,
    factCumulativeRub: 4_215_000_000,
    completionPct: (4_215 / 4_820) * 100,
    deviationRub: 4_215_000_000 - 4_820_000_000,
  },
  rows: [
    {
      id: "apartments",
      name: "Квартиры",
      planProjectRub: 3_200_000_000,
      planReportMonthRub: 118_000_000,
      planCumulativeRub: 2_960_000_000,
      factCumulativeRub: 2_780_000_000,
      deviationRub: -180_000_000,
      completionPct: (2_780 / 2_960) * 100,
      shareOfVolumePct: 61.4,
      deviationComment: "Отставание по темпу броней во 2-м квартале; дожим по 2-комн.",
    },
    {
      id: "apt_1r",
      name: "1-ком квартиры",
      planProjectRub: 620_000_000,
      planReportMonthRub: 22_000_000,
      planCumulativeRub: 580_000_000,
      factCumulativeRub: 552_000_000,
      deviationRub: -28_000_000,
      completionPct: (552 / 580) * 100,
      shareOfVolumePct: 12.0,
      deviationComment: "В пределах допуска; конверсия визит → бронь стабильна.",
    },
    {
      id: "apt_2r",
      name: "2-ком квартиры",
      planProjectRub: 1_050_000_000,
      planReportMonthRub: 38_000_000,
      planCumulativeRub: 980_000_000,
      factCumulativeRub: 902_000_000,
      deviationRub: -78_000_000,
      completionPct: (902 / 980) * 100,
      shareOfVolumePct: 20.3,
      deviationComment: "Основной вклад в недобор; проверить ценовую лестницу и акции.",
    },
    {
      id: "apt_3r",
      name: "3-ком квартиры",
      planProjectRub: 980_000_000,
      planReportMonthRub: 35_000_000,
      planCumulativeRub: 910_000_000,
      factCumulativeRub: 868_000_000,
      deviationRub: -42_000_000,
      completionPct: (868 / 910) * 100,
      shareOfVolumePct: 18.9,
      deviationComment: null,
    },
    {
      id: "apt_4p",
      name: "4-ком и более",
      planProjectRub: 550_000_000,
      planReportMonthRub: 23_000_000,
      planCumulativeRub: 490_000_000,
      factCumulativeRub: 458_000_000,
      deviationRub: -32_000_000,
      completionPct: (458 / 490) * 100,
      shareOfVolumePct: 10.2,
      deviationComment: "Узкая база спроса; мониторить показы дорогих лотов.",
    },
    {
      id: "parking",
      name: "Парковки",
      planProjectRub: 420_000_000,
      planReportMonthRub: 14_000_000,
      planCumulativeRub: 385_000_000,
      factCumulativeRub: 362_000_000,
      deviationRub: -23_000_000,
      completionPct: (362 / 385) * 100,
      shareOfVolumePct: 8.0,
      deviationComment: null,
    },
    {
      id: "storage",
      name: "Кладовые",
      planProjectRub: 180_000_000,
      planReportMonthRub: 6_500_000,
      planCumulativeRub: 165_000_000,
      factCumulativeRub: 158_000_000,
      deviationRub: -7_000_000,
      completionPct: (158 / 165) * 100,
      shareOfVolumePct: 3.4,
      deviationComment: null,
    },
    {
      id: "commercial",
      name: "Коммерция",
      planProjectRub: 320_000_000,
      planReportMonthRub: 11_000_000,
      planCumulativeRub: 295_000_000,
      factCumulativeRub: 239_000_000,
      deviationRub: -56_000_000,
      completionPct: (239 / 295) * 100,
      shareOfVolumePct: 6.1,
      deviationComment: "Длинный цикл сделки; уточнить воронку по коммерческим лидам.",
    },
    {
      id: "total",
      name: "ИТОГО",
      planProjectRub: 4_820_000_000,
      planReportMonthRub: 168_000_000,
      planCumulativeRub: 4_820_000_000,
      factCumulativeRub: 4_215_000_000,
      deviationRub: -605_000_000,
      completionPct: (4_215 / 4_820) * 100,
      shareOfVolumePct: 100,
      deviationComment: "Сводное отклонение по проекту на отчётную дату.",
      isTotal: true,
    },
  ],
};

export function formatReportDateRu(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  return `${m[3]}.${m[2]}.${m[1]}`;
}
