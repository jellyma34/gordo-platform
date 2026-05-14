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
  /** Факт за отчётный месяц, ₽ (если есть отдельная колонка в CSV). */
  factReportMonthRub?: number | null;
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
  /** Сделки: план/факт (если есть в CSV) */
  dealsPlanCount?: number | null;
  dealsFactCount?: number | null;
  isTotal?: boolean;
};

export type SalesPlanExecutionSummary = {
  planCumulativeRub: number;
  factCumulativeRub: number;
  /** Сводное выполнение по ₽ */
  completionPct: number | null;
  deviationRub: number;
};

/** Помесячный план/факт (₽ за месяц) для линейного графика «План vs факт» — импорт Excel/JSON. */
export type SalesPlanExecutionMonthlyPoint = {
  periodKey: string;
  planRub: number;
  factRub: number;
};

export type SalesPlanExecutionDataset = {
  /** YYYY-MM-DD — отчётная дата блока */
  reportDateYmd: string;
  summary: SalesPlanExecutionSummary;
  rows: SalesPlanExecutionRow[];
  /** Ряд месяцев YYYY-MM; при отсутствии — блок графика не показывается */
  monthlyPlanFact?: SalesPlanExecutionMonthlyPoint[] | null;
};

/** Пустой срез до загрузки CSV или при ошибке разбора. */
export function emptySalesPlanExecutionDataset(reportDateYmd: string): SalesPlanExecutionDataset {
  return {
    reportDateYmd: reportDateYmd.trim() || "1970-01-01",
    summary: {
      planCumulativeRub: 0,
      factCumulativeRub: 0,
      completionPct: null,
      deviationRub: 0,
    },
    rows: [],
    monthlyPlanFact: null,
  };
}

export function formatReportDateRu(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  return `${m[3]}.${m[2]}.${m[1]}`;
}
