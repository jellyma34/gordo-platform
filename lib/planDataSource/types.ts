export type ApartmentPlanCsvNormalizedRow = {
  segmentNorm: string;
  apartmentTypeNorm: string | null;
  monthKey: string;
  planMonth: number;
  planCumulative: number;
  totalVolume: number;
};

/** Метаданные разбора для отладки и превью в UI */
export type ApartmentPlanCsvParseDiagnostics = {
  rawHeaders: string[];
  columnMapping: Record<string, string> | null;
  /** Первые строки как в файле (ключ — имя колонки из заголовка) */
  previewRows: Record<string, string>[];
  delimiter: string | null;
  /** Тип распознанного шаблона CSV */
  csvType?: "wide_table" | "bi_report" | "legacy_wide_table" | "fact_revenue_csv";
  /** Кодировка при разборе (факт поступлений / RU CSV). */
  encoding?: "utf-8" | "utf-8-sig" | "cp1251";
  /** Сколько строк-сегментов импортировано (без агрегата) */
  importedSegmentRows?: number;
  /** Строки-агрегаты (например «Квартиры»), не импортированы как сегменты */
  ignoredSummaryRows?: number;
  /** Какой YYYY-MM присвоен строкам BI-отчёта */
  monthKeyUsed?: string;
  /** Факт для KPI всегда из системы (сделки / отчёт), не из CSV */
  factSource?: "system_json";
};

export type ApartmentPlanCsvParseOk = {
  ok: true;
  rows: ApartmentPlanCsvNormalizedRow[];
  warnings: string[];
  diagnostics: ApartmentPlanCsvParseDiagnostics;
  /** Заполняется для BI-отчёта (свод «Квартиры», месяц отчёта) */
  biReportMeta?: {
    monthKey: string;
    /** Сводная строка «Квартиры» — накопительный план KPI (не сумма сегментов / не ИТОГО). */
    apartmentsSummary?: {
      planMonth: number;
      planCumulative: number;
      planProject: number;
      rawLabel: string;
    } | null;
    /** Строка «ИТОГО» — KPI блока «Проект» (не сумма сегментов). */
    projectSummary?: {
      planMonth: number;
      planCumulative: number;
      planProject: number;
      rawLabel: string;
    } | null;
    /** @deprecated Используйте apartmentsSummary.planProject */
    summaryPlanProject?: number | null;
  };
};

export type ApartmentPlanCsvParseFail = {
  ok: false;
  error: string;
  warnings: string[];
  diagnostics: ApartmentPlanCsvParseDiagnostics;
};

export type ApartmentPlanCsvParseResult = ApartmentPlanCsvParseOk | ApartmentPlanCsvParseFail;

/**
 * Режим расчёта плана накопительно для KPI квартир:
 * - BI: готовая колонка «План накопит. итогом» по строкам сегментов;
 * - Wide: сумма plan_month по всем месяцам ≤ конец выбранного периода (строка «Квартиры» не в импорте).
 */
export type ApartmentPlanKpiCumulativeMode = "bi_report_ready_column" | "wide_table_sum_plan_month";

export type ApartmentPlanKpiPlanSlice = {
  planMonth: number;
  planCumulative: number;
  totalVolume: number;
  cumulativeMode?: ApartmentPlanKpiCumulativeMode;
};

/** Опции разбора: BI-отчёт без колонки месяца требует контекст периода */
export type ParseApartmentPlanCsvOptions = {
  /** Текущий период дашборда: YYYY-MM или YYYY-Qn */
  dashboardPeriodKey: string;
  period: "month" | "quarter";
  /** report.asOf YYYY-MM-DD — подстраховка для месяца BI */
  reportAsOfYmd: string;
  /** Имя файла — распознавание месяца из названия */
  fileName?: string;
};
