export type ProjectValueCsvFormat = "legacy" | "project_value";

export type ProjectValueNormalizedRow = {
  segmentNorm: string;
  monthKey: string;
  csvFormat: ProjectValueCsvFormat;
  /** Устав (sidebar + KPI1 plan). */
  charter: number;
  /** Текущ. план продаж (KPI1 fact). */
  currentPlan: number;
  /** Увеличение стоимости объекта (KPI2 single). */
  priceIncrease: number;
  /** В отчет. месяце наценили на (circle). */
  reportMarkup: number;
  /** @deprecated legacy alias */
  projectCost: number;
  planMonth: number;
  planCumulative: number;
  factMonth: number;
  factCumulative: number;
};

export type ProjectValueEntitySummary = {
  csvFormat: ProjectValueCsvFormat;
  charter: number;
  currentPlan: number;
  priceIncrease: number;
  reportMarkup: number;
  projectCost: number;
  planMonth: number;
  planCumulative: number;
  factMonth: number;
  factCumulative: number;
  rawLabel: string;
};

export type ProjectValueCsvParseDiagnostics = {
  rawHeaders: string[];
  columnMapping: Record<string, string> | null;
  delimiter: string | null;
  csvType:
    | "legacy_wide_table"
    | "legacy_project_value_wide_table"
    | "project_value_csv"
    | "unknown";
  monthKeyUsed?: string;
  importedRootRows: number;
};

export type ProjectValueCsvParseResult =
  | {
      ok: true;
      rows: ProjectValueNormalizedRow[];
      warnings: string[];
      diagnostics: ProjectValueCsvParseDiagnostics;
      apartmentsSummary: ProjectValueEntitySummary | null;
      parkingSummary?: ProjectValueEntitySummary | null;
      storageSummary?: ProjectValueEntitySummary | null;
      commercialSummary?: ProjectValueEntitySummary | null;
    }
  | {
      ok: false;
      error: string;
      warnings: string[];
      diagnostics: ProjectValueCsvParseDiagnostics;
    };

export type ParseProjectValueCsvOptions = {
  dashboardPeriodKey: string;
  period: "month" | "quarter";
  reportAsOfYmd: string;
  fileName?: string;
};
